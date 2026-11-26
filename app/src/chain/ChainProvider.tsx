import { useAnchorWallet, useWallet, type AnchorWallet } from '@solana/wallet-adapter-react';
import { Keypair, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClawChain, friendlyError, type ChainSnapshot } from './client';

export type Mode = 'demo' | 'devnet';

interface ChainCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
  chain: ClawChain | null;
  snap: ChainSnapshot | null;
  refresh: () => Promise<ChainSnapshot | null>;
  /** Run a chain action with a status line; returns undefined if it failed (error is shown),
   *  so `fn` should return a value (not void) when success matters to the caller. */
  run: <T>(status: string, fn: (c: ClawChain) => Promise<T>) => Promise<T | undefined>;
  status: string;
  setStatus: (s: string) => void;
  error: string;
  clearError: () => void;
  /** Show an error from a chain call made outside `run`. */
  fail: (e: unknown) => void;
  sheetOpen: boolean;
  openSheet: (open: boolean) => void;
  /** Devnet-only keypair kept in this browser, for trying the app without a wallet extension. */
  burner: { on: boolean; address: string; enable: (on: boolean) => void };
}

const Ctx = createContext<ChainCtx | null>(null);
const MODE_KEY = 'clawback-mode';
const BURNER_KEY = 'clawback-burner-key';
const BURNER_ON = 'clawback-burner-on';

function loadBurner(): Keypair {
  try {
    const raw = localStorage.getItem(BURNER_KEY);
    if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    /* make a new one */
  }
  const kp = Keypair.generate();
  localStorage.setItem(BURNER_KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function burnerWallet(kp: Keypair): AnchorWallet {
  const sign = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if ('version' in tx) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  };
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => sign(tx),
    signAllTransactions: async (txs) => txs.map(sign),
  };
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'demo');
  const adapterWallet = useAnchorWallet();
  const [burnerOn, setBurnerOn] = useState(() => localStorage.getItem(BURNER_ON) === '1');
  const burnerKp = useMemo(() => loadBurner(), []);
  const burnerW = useMemo(() => burnerWallet(burnerKp), [burnerKp]);
  // A connected extension wallet always wins over the burner.
  const wallet = adapterWallet ?? (burnerOn ? burnerW : undefined);
  const connected = !!wallet;
  useWallet();
  const [snap, setSnap] = useState<ChainSnapshot | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sheetOpen, openSheet] = useState(false);

  const chain = useMemo(() => (mode === 'devnet' && wallet ? new ClawChain(wallet) : null), [mode, wallet]);
  const chainRef = useRef(chain);
  chainRef.current = chain;

  const setMode = (m: Mode) => {
    localStorage.setItem(MODE_KEY, m);
    setModeState(m);
    setSnap(null);
    if (m === 'devnet' && !connected) openSheet(true);
  };

  const refresh = useCallback(async () => {
    const c = chainRef.current;
    if (!c) return null;
    try {
      const s = await c.snapshot();
      if (chainRef.current === c) setSnap(s);
      return s;
    } catch (e) {
      setError(friendlyError(e));
      return null;
    }
  }, []);

  useEffect(() => {
    setSnap(null);
    if (!chain) return;
    void refresh();
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [chain, refresh]);

  const run = useCallback(async <T,>(label: string, fn: (c: ClawChain) => Promise<T>) => {
    const c = chainRef.current;
    if (!c) {
      openSheet(true);
      return undefined;
    }
    setError('');
    setStatus(label);
    try {
      const out = await fn(c);
      await refresh();
      return out;
    } catch (e) {
      console.error(e);
      setError(friendlyError(e));
      return undefined;
    } finally {
      setStatus('');
    }
  }, [refresh]);

  const burner = {
    on: burnerOn && !adapterWallet,
    address: burnerKp.publicKey.toBase58(),
    enable: (on: boolean) => {
      localStorage.setItem(BURNER_ON, on ? '1' : '0');
      setBurnerOn(on);
    },
  };

  const value: ChainCtx = {
    burner,
    mode, setMode, chain, snap, refresh, run, status, setStatus, error,
    clearError: () => setError(''), sheetOpen, openSheet,
    fail: (e: unknown) => {
      console.error(e);
      setError(friendlyError(e));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChain() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChain outside ChainProvider');
  return v;
}
