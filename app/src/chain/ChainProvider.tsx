import { useAnchorWallet, useWallet } from '@solana/wallet-adapter-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClawChain, friendlyError, type ChainSnapshot } from './client';

export type Mode = 'demo' | 'devnet';

interface ChainCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
  chain: ClawChain | null;
  snap: ChainSnapshot | null;
  refresh: () => Promise<ChainSnapshot | null>;
  /** Run a chain action with a status line; returns undefined if it failed (error is shown). */
  run: <T>(status: string, fn: (c: ClawChain) => Promise<T>) => Promise<T | undefined>;
  status: string;
  setStatus: (s: string) => void;
  error: string;
  clearError: () => void;
  sheetOpen: boolean;
  openSheet: (open: boolean) => void;
}

const Ctx = createContext<ChainCtx | null>(null);
const MODE_KEY = 'clawback-mode';

export function ChainProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'demo');
  const wallet = useAnchorWallet();
  const { connected } = useWallet();
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

  const value: ChainCtx = {
    mode, setMode, chain, snap, refresh, run, status, setStatus, error,
    clearError: () => setError(''), sheetOpen, openSheet,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChain() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChain outside ChainProvider');
  return v;
}
