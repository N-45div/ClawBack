// Core claw rules. Day 2 moves the same rules on-chain: the program computes
// aim and grip, and MagicBlock VRF supplies `seed` and `roll` instead of
// the browser's crypto RNG.

export type Tier = 'common' | 'rare' | 'epic';
export type Asset = 'SOL' | 'BTC' | 'USDC' | 'NFT';

export interface PrizeType {
  id: string;
  asset: Asset;
  name: string;
  tag: string; // short label under the ball
  valueCents: number; // what it is worth when won
  sellBackCents: number; // instant buy-back price
  tier: Tier;
  maxGrip: number; // win chance with a perfect aim, 0..1
}

export const PRIZE_TYPES: PrizeType[] = [
  { id: 'sol-small', asset: 'SOL', name: '$0.25 of Solana', tag: '$0.25 SOL', valueCents: 25, sellBackCents: 24, tier: 'common', maxGrip: 0.6 },
  { id: 'btc', asset: 'BTC', name: '$1.00 of Bitcoin', tag: '$1 BTC', valueCents: 100, sellBackCents: 95, tier: 'rare', maxGrip: 0.35 },
  { id: 'sol-big', asset: 'SOL', name: '$5.00 of Solana', tag: '$5 SOL', valueCents: 500, sellBackCents: 475, tier: 'epic', maxGrip: 0.12 },
  { id: 'usdc', asset: 'USDC', name: '$0.50 of USD Coin', tag: '$0.50 USDC', valueCents: 50, sellBackCents: 50, tier: 'common', maxGrip: 0.6 },
  { id: 'nft', asset: 'NFT', name: 'Sponsor badge NFT', tag: 'NFT BADGE', valueCents: 40, sellBackCents: 40, tier: 'rare', maxGrip: 0.3 },
];

export const SLOTS = 5;
export const PLAY_SECONDS = 15;
export const CENTS_PER_PLAY = 50;
/** Aim never drops the grip below this share of the max. */
const MIN_AIM_FACTOR = 0.35;

export function randomU32(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

/** Small deterministic PRNG so a layout can be re-derived from its seed. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of the prize types into slots, from a seed. */
export function layoutFromSeed(seed: number): PrizeType[] {
  const rand = mulberry32(seed);
  const out = [...PRIZE_TYPES];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** clawX is 0..1 across the pit. Returns the slot under the claw. */
export function slotUnder(clawX: number): number {
  return Math.min(SLOTS - 1, Math.max(0, Math.floor(clawX * SLOTS)));
}

/** 1 when dead centre over a prize, 0 at the edge of its slot. */
export function aimScore(clawX: number): number {
  const slot = slotUnder(clawX);
  const centre = (slot + 0.5) / SLOTS;
  const half = 0.5 / SLOTS;
  return Math.max(0, 1 - Math.abs(clawX - centre) / half);
}

export function gripChance(prize: PrizeType, aim: number): number {
  return prize.maxGrip * (MIN_AIM_FACTOR + (1 - MIN_AIM_FACTOR) * aim);
}

export type Stage = 'grab' | 'lift' | 'chute';
export const STAGES: Stage[] = ['grab', 'lift', 'chute'];

export interface DropResult {
  won: boolean;
  /** Stages passed before failing (3 when won). */
  passed: number;
  failedAt?: Stage;
  roll: number; // 0..1
  grip: number; // 0..1
  aim: number;
  prize: PrizeType;
  seed: number;
  /** Devnet: the rollup transaction that dropped the claw. */
  sig?: string;
  /** Devnet: rollup transactions sent while steering this play. */
  moves?: number;
}

/**
 * One roll decides the outcome, so the grip chance shown is the real
 * chance of winning. The reveal is then split over three stages for drama:
 * a loss picks the stage it fails at from the same roll.
 */
export function resolveDrop(prize: PrizeType, aim: number, roll: number, seed: number): DropResult {
  const grip = gripChance(prize, aim);
  const won = roll < grip;
  if (won) return { won, passed: 3, roll, grip, aim, prize, seed };
  // Spread losses across stages by how far the roll missed.
  const miss = (roll - grip) / (1 - grip || 1);
  const failIdx = miss > 0.55 ? 0 : miss > 0.2 ? 1 : 2;
  return { won, passed: failIdx, failedAt: STAGES[failIdx], roll, grip, aim, prize, seed };
}

/** Change a payment rounds up to: next whole dollar, or a full dollar if it is exact. */
export function roundUpCents(amountCents: number): number {
  const r = (100 - (amountCents % 100)) % 100;
  return r === 0 ? 100 : r;
}

export function shortHex(n: number): string {
  const h = (n >>> 0).toString(16).padStart(8, '0');
  return '0x' + h.slice(0, 4) + '…' + h.slice(-3);
}
