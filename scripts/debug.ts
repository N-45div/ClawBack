/** Inspect the Game PDA on the ER and base layer, with recent ER transaction logs. */
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ER_RPC = process.env.ER_RPC ?? 'https://devnet-as.magicblock.app/';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(ROOT, '.keys/deployer.json'), 'utf8'))));
const idl = JSON.parse(readFileSync(resolve(ROOT, 'target/idl/clawback.json'), 'utf8'));
const base = new Connection('https://api.devnet.solana.com', 'confirmed');
const er = new Connection(ER_RPC, 'confirmed');
const program = new anchor.Program(idl, new anchor.AnchorProvider(base, new anchor.Wallet(wallet), {}));
const [gamePda] = PublicKey.findProgramAddressSync([Buffer.from('game'), wallet.publicKey.toBuffer()], program.programId);

for (const [name, conn] of [['base', base], ['er', er]] as const) {
  const info = await conn.getAccountInfo(gamePda);
  console.log(`\n== ${name}: owner ${info?.owner.toBase58()}`);
  if (info && info.owner.equals(program.programId) || (info && name === 'er')) {
    try {
      const g = program.coder.accounts.decode('game', info!.data);
      console.log({ phase: g.phase, plays: g.plays, played: g.played, nonce: g.nonce.toString(), layout: Array.from(g.layout), session: g.sessionKey.toBase58() });
    } catch (e) {
      console.log('decode failed', (e as Error).message);
    }
  }
}

const sigs = await er.getSignaturesForAddress(gamePda, { limit: 6 });
for (const s of sigs) {
  const tx = await er.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  console.log(`\n-- ${s.signature.slice(0, 16)}… err=${JSON.stringify(s.err)}`);
  for (const l of tx?.meta?.logMessages ?? []) console.log('   ' + l);
}
