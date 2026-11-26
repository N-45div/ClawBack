import * as anchor from '@coral-xyz/anchor';
import { GetCommitmentSignature } from '@magicblock-labs/ephemeral-rollups-sdk';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  BASE_RPC, DELEGATION_PROGRAM, EPHEMERAL_QUEUE, ER_RPC, ER_VALIDATOR, ER_WS, IDL, PROGRAM_ID,
} from './config';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Game = any;
type Player = any;

export const PHASE = { IDLE: 0, AWAIT_LAYOUT: 1, AIM: 2, AWAIT_DROP: 3 } as const;
export const ASSETS = ['SOL', 'BTC', 'USDC', 'NFT'] as const;

export interface ChainHolding {
  assetIdx: number;
  valueCents: number;
  sellBackCents: number;
  pending: boolean; // still inside the delegated Game, not yet settled
}

export interface ChainSnapshot {
  owner: string;
  walletLamports: number;
  hasPlayer: boolean;
  savingsCents: number;
  plays: number; // player + game
  progressCents: number;
  playsUsed: number;
  wins: number;
  holdings: ChainHolding[];
  delegated: boolean;
  phase: number;
}

export interface ChainDrop {
  won: boolean;
  stagesPassed: number;
  prizeIdx: number;
  aimMilli: number;
  gripMilli: number;
  rollMilli: number;
  layoutSeed: string; // u64 as decimal
  sig: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: any): number => (typeof v === 'number' ? v : v?.toNumber ? v.toNumber() : Number(v));

async function waitFor<T>(what: string, fn: () => Promise<T | undefined>, timeoutMs = 45_000, every = 250): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn().catch(() => undefined);
    if (v !== undefined) return v;
    await sleep(every);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/**
 * One client per connected wallet.
 * Base-layer instructions are signed by the wallet (one popup each).
 * Rollup instructions are signed by a browser session key registered on-chain via
 * load_session, so steering never prompts the wallet.
 */
export class ClawChain {
  readonly base = new Connection(BASE_RPC, 'confirmed');
  readonly er = new Connection(ER_RPC, { commitment: 'confirmed', wsEndpoint: ER_WS });
  readonly program: anchor.Program;
  readonly owner: PublicKey;
  readonly playerPda: PublicKey;
  readonly gamePda: PublicKey;
  readonly vaultPda: PublicKey;
  readonly merchant = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey; // demo merchant wallet
  readonly session: Keypair;
  private erBlockhash: { hash: string; at: number } | null = null;

  constructor(readonly wallet: AnchorWallet) {
    const provider = new anchor.AnchorProvider(this.base, wallet, { commitment: 'confirmed' });
    this.program = new anchor.Program(IDL as anchor.Idl, provider);
    this.owner = wallet.publicKey;
    const pid = PROGRAM_ID;
    this.vaultPda = PublicKey.findProgramAddressSync([Buffer.from('vault')], pid)[0];
    this.playerPda = PublicKey.findProgramAddressSync([Buffer.from('player'), this.owner.toBuffer()], pid)[0];
    this.gamePda = PublicKey.findProgramAddressSync([Buffer.from('game'), this.owner.toBuffer()], pid)[0];
    this.session = loadSessionKey(this.owner);
  }

  // ------------------------------------------------------------------ reads

  private decodeGame(data: Buffer): Game {
    return this.program.coder.accounts.decode('game', data);
  }

  async isDelegated(): Promise<boolean> {
    const info = await this.base.getAccountInfo(this.gamePda);
    return !!info && info.owner.equals(DELEGATION_PROGRAM);
  }

  async readGame(where: 'base' | 'er'): Promise<Game | null> {
    const info = await (where === 'er' ? this.er : this.base).getAccountInfo(this.gamePda);
    if (!info || !info.owner.equals(PROGRAM_ID)) return null;
    return this.decodeGame(info.data);
  }

  async snapshot(): Promise<ChainSnapshot> {
    const [lamports, playerInfo, gameInfo] = await Promise.all([
      this.base.getBalance(this.owner),
      this.base.getAccountInfo(this.playerPda),
      this.base.getAccountInfo(this.gamePda),
    ]);
    const delegated = !!gameInfo && gameInfo.owner.equals(DELEGATION_PROGRAM);
    const empty: ChainSnapshot = {
      owner: this.owner.toBase58(), walletLamports: lamports, hasPlayer: false, savingsCents: 0, plays: 0,
      progressCents: 0, playsUsed: 0, wins: 0, holdings: [], delegated, phase: 0,
    };
    if (!playerInfo) return empty;
    const p: Player = this.program.coder.accounts.decode('player', playerInfo.data);
    const g: Game | null = delegated ? await this.readGame('er').catch(() => null) : gameInfo ? this.decodeGame(gameInfo.data) : null;

    const holdings: ChainHolding[] = [];
    for (let a = 0; a < 4; a++) {
      const v = num(p.holdingsCents[a]);
      if (v > 0) holdings.push({ assetIdx: a, valueCents: v, sellBackCents: num(p.sellBackCents[a]), pending: false });
      const gv = g ? num(g.wonValueCents[a]) : 0;
      if (gv > 0) holdings.push({ assetIdx: a, valueCents: gv, sellBackCents: num(g.wonSellBackCents[a]), pending: true });
    }
    return {
      ...empty,
      hasPlayer: true,
      savingsCents: num(p.savingsCents),
      plays: p.plays + (g ? g.plays : 0),
      progressCents: num(p.progressCents),
      playsUsed: p.playsUsed + (g ? g.played : 0),
      wins: p.wins + (g ? g.wins : 0),
      holdings,
      phase: g ? g.phase : 0,
    };
  }

  // ------------------------------------------------------- base layer (wallet)

  async initPlayer(): Promise<string> {
    return this.program.methods.initPlayer().accounts({ owner: this.owner }).rpc();
  }

  async pay(amountCents: number, boost: number): Promise<string> {
    return this.program.methods
      .pay(new anchor.BN(amountCents), boost)
      .accounts({ owner: this.owner, merchant: this.merchant })
      .rpc();
  }

  async withdraw(cents: number): Promise<string> {
    return this.program.methods.withdraw(new anchor.BN(cents)).accounts({ owner: this.owner }).rpc();
  }

  async sell(assetIdx: number): Promise<string> {
    await this.bringHome();
    return this.program.methods.sell(assetIdx).accounts({ owner: this.owner }).rpc();
  }

  /** Move plays into the Game, register the session key and delegate to the ER, in one wallet approval. */
  async ensureSession(): Promise<void> {
    if (await this.isDelegated()) {
      const g = await this.readGame('er');
      const pInfo = await this.base.getAccountInfo(this.playerPda);
      const p: Player = pInfo ? this.program.coder.accounts.decode('player', pInfo.data) : { plays: 0 };
      // Reuse the open session unless its plays ran out while new ones were earned on Solana.
      if (g && g.sessionKey.equals(this.session.publicKey) && (g.plays > 0 || p.plays === 0)) return;
      // Otherwise (or if this browser lost the session key) bring the game home and reopen.
      await this.bringHome();
    }
    const tx = new Transaction().add(
      await this.program.methods.loadSession(this.session.publicKey).accounts({ owner: this.owner, session: this.session.publicKey }).instruction(),
      await this.program.methods
        .delegateGame()
        .accounts({ owner: this.owner })
        .remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }])
        .instruction(),
    );
    await (this.program.provider as anchor.AnchorProvider).sendAndConfirm(tx);
    await waitFor('the rollup to pick up your game', async () => {
      const g = await this.readGame('er');
      return g && g.sessionKey.equals(this.session.publicKey) ? true : undefined;
    });
  }

  /**
   * Commit + undelegate the Game (signed on the ER by the session key, or the wallet if the
   * session key is gone), wait for it on the base layer, then settle winnings into the Player.
   */
  async bringHome(onStage?: (s: string) => void): Promise<void> {
    if (await this.isDelegated()) {
      const g = await this.readGame('er');
      const useSession = !!g && g.sessionKey.equals(this.session.publicKey);
      onStage?.('Committing from the rollup');
      const tx = await this.program.methods
        .endSession()
        .accounts({ payer: useSession ? this.session.publicKey : this.owner, game: this.gamePda })
        .transaction();
      const sig = useSession ? await this.sendEr(tx, true) : await this.sendErWithWallet(tx);
      const commit = await GetCommitmentSignature(sig, this.er);
      await this.base.confirmTransaction(commit, 'confirmed');
      onStage?.('Settling on Solana');
      await waitFor('the game to return to Solana', async () => ((await this.isDelegated()) ? undefined : true), 90_000, 500);
    }
    const g = await this.readGame('base');
    const pending = g && (g.plays > 0 || g.played > 0 || g.wonValueCents.some((v: any) => num(v) > 0));
    if (pending) await this.program.methods.settle().accounts({ owner: this.owner }).rpc();
  }

  // ------------------------------------------------- ephemeral rollup (session)

  private async erHash(fresh = false): Promise<string> {
    if (fresh || !this.erBlockhash || Date.now() - this.erBlockhash.at > 15_000) {
      this.erBlockhash = { hash: (await this.er.getLatestBlockhash()).blockhash, at: Date.now() };
    }
    return this.erBlockhash.hash;
  }

  private async sendEr(tx: Transaction, confirm: boolean): Promise<string> {
    tx.feePayer = this.session.publicKey;
    tx.recentBlockhash = await this.erHash(confirm);
    tx.sign(this.session);
    const sig = await this.er.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    if (confirm) {
      await this.er.confirmTransaction(sig, 'confirmed');
      const st = await this.er.getSignatureStatus(sig);
      if (st.value?.err) throw new Error('Rollup transaction failed: ' + JSON.stringify(st.value.err));
    }
    return sig;
  }

  private async sendErWithWallet(tx: Transaction): Promise<string> {
    tx.feePayer = this.owner;
    tx.recentBlockhash = await this.erHash(true);
    const signed = await this.wallet.signTransaction(tx);
    const sig = await this.er.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await this.er.confirmTransaction(sig, 'confirmed');
    return sig;
  }

  /** Use a play; VRF shuffles the prizes. Resolves with the on-chain layout (prize indices). */
  async startPlay(): Promise<{ layout: number[]; seed: string; sig: string }> {
    const tx = await this.program.methods
      .startPlay(Math.floor(Math.random() * 256))
      .accounts({ signer: this.session.publicKey, game: this.gamePda, oracleQueue: EPHEMERAL_QUEUE })
      .transaction();
    const sig = await this.sendEr(tx, true);
    const g = await waitFor('VRF to shuffle the prizes', async () => {
      const g = await this.readGame('er');
      return g && g.phase === PHASE.AIM ? g : undefined;
    }, 30_000, 150);
    return { layout: Array.from(g.layout as number[]), seed: g.layoutSeed.toString(), sig };
  }

  /** Steer. Fire-and-forget: the rollup has no fees and the next move supersedes this one. */
  moveClaw(x1000: number): void {
    this.program.methods
      .moveClaw(Math.round(x1000))
      .accounts({ signer: this.session.publicKey, game: this.gamePda })
      .transaction()
      .then((tx) => this.sendEr(tx, false))
      .catch(() => {});
  }

  /** Final position + drop in one transaction, then wait for the VRF roll to land. */
  async drop(x1000: number): Promise<ChainDrop> {
    const before = await this.readGame('er');
    const nonceBefore = before ? before.last.nonce.toString() : '';
    const tx = new Transaction().add(
      await this.program.methods.moveClaw(Math.round(x1000)).accounts({ signer: this.session.publicKey, game: this.gamePda }).instruction(),
      await this.program.methods
        .dropClaw(Math.floor(Math.random() * 256))
        .accounts({ signer: this.session.publicKey, game: this.gamePda, oracleQueue: EPHEMERAL_QUEUE })
        .instruction(),
    );
    const sig = await this.sendEr(tx, true);
    const g = await waitFor('the VRF roll', async () => {
      const g = await this.readGame('er');
      return g && g.phase === PHASE.IDLE && g.last.nonce.toString() !== nonceBefore ? g : undefined;
    }, 30_000, 150);
    const l = g.last;
    return {
      won: l.won, stagesPassed: l.stagesPassed, prizeIdx: l.prizeIdx, aimMilli: l.aimMilli,
      gripMilli: l.gripMilli, rollMilli: l.rollMilli, layoutSeed: l.layoutSeed.toString(), sig,
    };
  }
}

/** Devnet-only throwaway key, kept per wallet so a refresh can keep playing the same session. */
function loadSessionKey(owner: PublicKey): Keypair {
  const k = 'clawback-session-' + owner.toBase58();
  try {
    const raw = localStorage.getItem(k);
    if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    /* make a new one */
  }
  const kp = Keypair.generate();
  localStorage.setItem(k, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export function friendlyError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/User rejected|rejected the request/i.test(m)) return 'You cancelled in your wallet.';
  if (/insufficient|0x1\b|debit an account/i.test(m)) return 'Not enough devnet SOL in your wallet. Grab some at faucet.solana.com.';
  if (/PoolEmpty|Prize pool/i.test(m)) return 'The prize pool cannot cover that right now.';
  if (/NoPlays|No plays/i.test(m)) return 'No plays left. Round up a payment to earn more.';
  return m.length > 140 ? m.slice(0, 140) + '…' : m;
}
