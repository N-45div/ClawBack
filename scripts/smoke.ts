/**
 * End-to-end devnet smoke test for the clawback program:
 *   base:  init vault/player -> fund pool -> pay with round-up -> load session + delegate Game
 *   ER:    start_play (VRF layout) -> move_claw x N -> drop_claw (VRF roll) -> end_session
 *   base:  wait for undelegation -> settle -> print the Player
 *
 * Run from the repo root:  npm --prefix scripts run smoke
 * Wallet: .keys/deployer.json (devnet only). Override ER with ER_RPC / ER_VALIDATOR.
 */
import * as anchor from '@coral-xyz/anchor';
import { GetCommitmentSignature } from '@magicblock-labs/ephemeral-rollups-sdk';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE_RPC = process.env.BASE_RPC ?? 'https://api.devnet.solana.com';
const ER_RPC = process.env.ER_RPC ?? 'https://devnet-as.magicblock.app/';
const ER_VALIDATOR = new PublicKey(process.env.ER_VALIDATOR ?? 'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57');
const DELEGATION_PROGRAM = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
const PRIZE_NAMES = ['$0.25 SOL', '$1 BTC', '$5 SOL', '$0.50 USDC', 'NFT badge'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (step: string, ...rest: unknown[]) => console.log(`\x1b[32m•\x1b[0m ${step}`, ...rest);

const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(ROOT, '.keys/deployer.json'), 'utf8'))));
const idl = JSON.parse(readFileSync(resolve(ROOT, 'target/idl/clawback.json'), 'utf8'));

const base = new Connection(BASE_RPC, 'confirmed');
const er = new Connection(ER_RPC, { commitment: 'confirmed', wsEndpoint: ER_RPC.replace('https', 'wss') });
const provider = new anchor.AnchorProvider(base, new anchor.Wallet(wallet), { commitment: 'confirmed' });
const program = new anchor.Program(idl, provider);
const pid = program.programId;

const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault')], pid);
const [playerPda] = PublicKey.findProgramAddressSync([Buffer.from('player'), wallet.publicKey.toBuffer()], pid);
const [gamePda] = PublicKey.findProgramAddressSync([Buffer.from('game'), wallet.publicKey.toBuffer()], pid);
// Fixed demo merchant so repeated runs pay the same wallet.
const merchant = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey;

async function readGame(conn: Connection) {
  const info = await conn.getAccountInfo(gamePda);
  if (!info) throw new Error('game account missing on ' + conn.rpcEndpoint);
  return program.coder.accounts.decode('game', info.data);
}

async function sendEr(tx: Transaction, signer: Keypair) {
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  tx.sign(signer);
  const sig = await er.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await er.confirmTransaction(sig, 'confirmed');
  const st = await er.getSignatureStatus(sig);
  if (st.value?.err) throw new Error(`ER tx failed ${sig}: ${JSON.stringify(st.value.err)}`);
  return sig;
}

async function waitFor<T>(what: string, fn: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn().catch(() => undefined);
    if (v !== undefined) return v;
    await sleep(400);
  }
  throw new Error('timed out waiting for ' + what);
}

/** end_session on the ER (signed by the session key or the owner), wait for the base layer, settle. */
async function undelegateAndSettle(signer: Keypair) {
  const t0 = Date.now();
  const endSig = await sendEr(await program.methods.endSession().accounts({ payer: signer.publicKey, game: gamePda }).transaction(), signer);
  log('end_session on ER', endSig.slice(0, 12) + '…');
  const commitSig = await GetCommitmentSignature(endSig, er);
  await base.confirmTransaction(commitSig, 'confirmed');
  log('committed to base layer', commitSig.slice(0, 12) + '…');
  await waitFor('undelegation', async () => {
    const info = await base.getAccountInfo(gamePda);
    return info && info.owner.equals(pid) ? true : undefined;
  }, 90_000);
  log(`Game back on base layer in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await program.methods.settle().accounts({ owner: wallet.publicKey }).rpc();
}

async function main() {
  log('wallet', wallet.publicKey.toBase58(), (await base.getBalance(wallet.publicKey)) / 1e9, 'SOL');
  log('program', pid.toBase58());

  if (!(await base.getAccountInfo(vaultPda))) {
    await program.methods.initVault().accounts({ authority: wallet.publicKey }).rpc();
    log('vault created');
  }
  await program.methods.fundPool(new anchor.BN(2000)).accounts({ funder: wallet.publicKey }).rpc();
  log('prize pool funded with $20.00');

  if (!(await base.getAccountInfo(playerPda))) {
    await program.methods.initPlayer().accounts({ owner: wallet.publicKey }).rpc();
    log('player created');
  }

  // A previous run may have left the Game delegated: end that session as the owner and settle.
  const gameInfo = await base.getAccountInfo(gamePda);
  if (gameInfo?.owner.equals(DELEGATION_PROGRAM)) {
    const g = await readGame(er);
    log('recovering a session left on the ER', `phase ${g.phase}, plays ${g.plays}`);
    await undelegateAndSettle(wallet);
  }

  const paySig = await program.methods.pay(new anchor.BN(430), 2).accounts({ owner: wallet.publicKey, merchant }).rpc();
  let player = await program.account.player.fetch(playerPda);
  log('paid $4.30 with 2x round-up', `savings $${(player.savingsCents.toNumber() / 100).toFixed(2)}`, `plays ${player.plays}`, paySig.slice(0, 12) + '…');

  // Session key: signs rollup moves so the wallet is not prompted per move.
  const session = Keypair.generate();
  const loadIx = await program.methods.loadSession(session.publicKey).accounts({ owner: wallet.publicKey, session: session.publicKey }).instruction();
  const delIx = await program.methods
    .delegateGame()
    .accounts({ owner: wallet.publicKey })
    .remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }])
    .instruction();
  const delSig = await provider.sendAndConfirm(new Transaction().add(loadIx, delIx));
  log('session loaded + Game delegated to ER', delSig.slice(0, 12) + '…');

  await waitFor('Game visible on ER', async () => {
    const g = await readGame(er);
    return g.plays > 0 ? g : undefined;
  });

  // ---- one full play on the rollup
  await sendEr(await program.methods.startPlay(Math.floor(Math.random() * 255)).accounts({ signer: session.publicKey, game: gamePda, oracleQueue: EPHEMERAL_QUEUE }).transaction(), session);
  const g1 = await waitFor('VRF layout', async () => {
    const g = await readGame(er);
    return g.phase === 2 ? g : undefined;
  });
  const layout: number[] = Array.from(g1.layout as number[]);
  log('VRF layout', layout.map((i) => PRIZE_NAMES[i]).join(' | '));

  // Aim at the BTC ball, steering there in small steps like the UI does.
  const targetSlot = layout.indexOf(1);
  const targetX = targetSlot * 200 + 100;
  const t0 = Date.now();
  let moves = 0;
  for (let x = 500; x !== targetX; x += Math.sign(targetX - x) * Math.min(50, Math.abs(targetX - x))) {
    await sendEr(await program.methods.moveClaw(x).accounts({ signer: session.publicKey, game: gamePda }).transaction(), session);
    moves++;
  }
  await sendEr(await program.methods.moveClaw(targetX).accounts({ signer: session.publicKey, game: gamePda }).transaction(), session);
  moves++;
  log(`steered with ${moves} ER txs in ${Date.now() - t0} ms (${Math.round((Date.now() - t0) / moves)} ms each, zero fee)`);

  const nonceBefore = (await readGame(er)).nonce.toString();
  await sendEr(await program.methods.dropClaw(Math.floor(Math.random() * 255)).accounts({ signer: session.publicKey, game: gamePda, oracleQueue: EPHEMERAL_QUEUE }).transaction(), session);
  const g2 = await waitFor('VRF drop result', async () => {
    const g = await readGame(er);
    return g.phase === 0 && g.last.nonce.toString() !== nonceBefore ? g : undefined;
  });
  const last = g2.last;
  log(
    last.won ? '\x1b[33mWON\x1b[0m' : 'missed',
    PRIZE_NAMES[last.prizeIdx],
    `aim ${last.aimMilli / 1000} grip ${last.gripMilli / 10}% roll ${last.rollMilli / 10}%`,
    last.won ? '' : `slipped at ${['grab', 'lift', 'chute'][last.stagesPassed]}`,
  );

  // ---- commit + undelegate, then settle on base
  await undelegateAndSettle(session);
  player = await program.account.player.fetch(playerPda);
  log('settled', {
    savings: '$' + (player.savingsCents.toNumber() / 100).toFixed(2),
    plays: player.plays,
    playsUsed: player.playsUsed,
    wins: player.wins,
    holdingsCents: player.holdingsCents.map((b: anchor.BN) => b.toNumber()),
  });

  // Return the session key's leftover lamports.
  const left = await base.getBalance(session.publicKey);
  if (left > 5000) {
    await base.sendTransaction(new Transaction().add(SystemProgram.transfer({ fromPubkey: session.publicKey, toPubkey: wallet.publicKey, lamports: left - 5000 })), [session]).catch(() => {});
  }
  log('done');
}

main().catch((e) => {
  console.error('\x1b[31m✗\x1b[0m', e);
  process.exit(1);
});
