import { PublicKey } from '@solana/web3.js';
import idl from './idl.json';

export const IDL = idl;
export const PROGRAM_ID = new PublicKey(idl.address);

const env = import.meta.env;
export const BASE_RPC: string = env.VITE_BASE_RPC ?? 'https://api.devnet.solana.com';
/** MagicBlock devnet Ephemeral Rollup (Asia). The Game is delegated to this validator. */
export const ER_RPC: string = env.VITE_ER_RPC ?? 'https://devnet-as.magicblock.app/';
export const ER_WS: string = ER_RPC.replace('https://', 'wss://');
export const ER_VALIDATOR = new PublicKey(env.VITE_ER_VALIDATOR ?? 'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57');

export const DELEGATION_PROGRAM = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
/** VRF oracle queue for requests made on the rollup (fee-exempt). */
export const EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');

/** Devnet money unit used by the program: 1 cent = 10,000 lamports. */
export const LAMPORTS_PER_CENT = 10_000;

export const explorerTx = (sig: string, cluster: 'devnet' | 'er' = 'devnet') =>
  cluster === 'er'
    ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(ER_RPC)}`
    : `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
