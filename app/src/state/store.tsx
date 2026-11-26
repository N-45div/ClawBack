import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { CENTS_PER_PLAY, type Asset, type DropResult } from '../lib/game';

export interface Holding {
  id: string;
  asset: Asset;
  name: string;
  valueCents: number;
  sellBackCents: number;
  wonAt: number;
}

export interface FeedItem {
  id: string;
  who: string;
  initials: string;
  what: string;
  at: number;
  cheers: number;
  cheered: boolean;
  me?: boolean;
}

export interface State {
  savingsCents: number;
  plays: number;
  /** Round-up cents banked toward the next play (0..CENTS_PER_PLAY-1). */
  progressCents: number;
  weekRoundupsCents: number;
  /** Savings balance at the end of each of the last 7 days (cents), today last. */
  week: number[];
  holdings: Holding[];
  feed: FeedItem[];
  squadSavedCents: number;
  playsUsed: number;
  lastWin?: { result: DropResult; holdingId: string; shared: boolean; sold: boolean };
}

type Action =
  | { type: 'pay'; saveCents: number; merchant: string }
  | { type: 'startPlay' }
  | { type: 'win'; result: DropResult }
  | { type: 'sell'; holdingId: string }
  | { type: 'withdraw'; cents: number }
  | { type: 'share' }
  | { type: 'cheer'; id: string }
  | { type: 'reset' };

const now = Date.now();
const min = 60_000;

export const initialState: State = {
  savingsCents: 4260,
  plays: 3,
  progressCents: 20,
  weekRoundupsCents: 310,
  week: [3620, 3710, 3790, 3840, 3960, 4130, 4260],
  holdings: [
    { id: 'h-sol', asset: 'SOL', name: 'Solana', valueCents: 235, sellBackCents: 223, wonAt: now - 3 * 86_400_000 },
    { id: 'h-usdc', asset: 'USDC', name: 'USD Coin', valueCents: 50, sellBackCents: 50, wonAt: now - 86_400_000 },
    { id: 'h-nft', asset: 'NFT', name: 'Sponsor badge', valueCents: 40, sellBackCents: 40, wonAt: now - 2 * 86_400_000 },
  ],
  feed: [
    { id: 'f-rahul', who: 'Rahul', initials: 'RS', what: 'grabbed $2.00 of SOL', at: now - 4 * min, cheers: 12, cheered: false },
    { id: 'f-meera', who: 'Meera', initials: 'MP', what: 'saved $1.20 on lunch', at: now - 22 * min, cheers: 5, cheered: false },
    { id: 'f-arjun', who: 'Arjun', initials: 'AV', what: 'sold a badge for $1.40', at: now - 60 * min, cheers: 3, cheered: false },
  ],
  squadSavedCents: 21400,
  playsUsed: 8,
};

const ASSET_NAMES: Record<Asset, string> = { SOL: 'Solana', BTC: 'Bitcoin', USDC: 'USD Coin', NFT: 'Sponsor badge' };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'pay': {
      const bank = s.progressCents + a.saveCents;
      const earned = Math.floor(bank / CENTS_PER_PLAY);
      const savings = s.savingsCents + a.saveCents;
      return {
        ...s,
        savingsCents: savings,
        plays: s.plays + earned,
        progressCents: bank % CENTS_PER_PLAY,
        weekRoundupsCents: s.weekRoundupsCents + a.saveCents,
        squadSavedCents: s.squadSavedCents + a.saveCents,
        week: [...s.week.slice(0, -1), savings],
      };
    }
    case 'startPlay':
      if (s.plays <= 0) return s;
      return { ...s, plays: s.plays - 1, playsUsed: s.playsUsed + 1 };
    case 'win': {
      const p = a.result.prize;
      const id = 'h-' + Math.random().toString(36).slice(2, 9);
      const existing = s.holdings.find((h) => h.asset === p.asset && p.asset !== 'NFT');
      const holdings = existing
        ? s.holdings.map((h) =>
            h === existing
              ? { ...h, valueCents: h.valueCents + p.valueCents, sellBackCents: h.sellBackCents + p.sellBackCents, wonAt: Date.now() }
              : h,
          )
        : [
            { id, asset: p.asset, name: ASSET_NAMES[p.asset], valueCents: p.valueCents, sellBackCents: p.sellBackCents, wonAt: Date.now() },
            ...s.holdings,
          ];
      return { ...s, holdings, lastWin: { result: a.result, holdingId: existing ? existing.id : id, shared: false, sold: false } };
    }
    case 'sell': {
      // Selling from the win screen sells only the prize just won; from the
      // portfolio it sells the whole holding.
      const w = s.lastWin;
      if (w && !w.sold && a.holdingId === w.holdingId && w.result.prize) {
        const p = w.result.prize;
        const holdings = s.holdings
          .map((h) => (h.id === a.holdingId ? { ...h, valueCents: h.valueCents - p.valueCents, sellBackCents: h.sellBackCents - p.sellBackCents } : h))
          .filter((h) => h.valueCents > 0);
        return { ...s, holdings, savingsCents: s.savingsCents + p.sellBackCents, lastWin: { ...w, sold: true } };
      }
      const h = s.holdings.find((x) => x.id === a.holdingId);
      if (!h) return s;
      return {
        ...s,
        holdings: s.holdings.filter((x) => x.id !== a.holdingId),
        savingsCents: s.savingsCents + h.sellBackCents,
      };
    }
    case 'withdraw': {
      const cents = Math.min(a.cents, s.savingsCents);
      return { ...s, savingsCents: s.savingsCents - cents, week: [...s.week.slice(0, -1), s.savingsCents - cents] };
    }
    case 'share': {
      const w = s.lastWin;
      if (!w || w.shared) return s;
      const item: FeedItem = {
        id: 'f-' + Date.now(),
        who: 'You',
        initials: 'AK',
        what: 'grabbed ' + w.result.prize.name.replace('Sponsor badge NFT', 'a sponsor badge'),
        at: Date.now(),
        cheers: 0,
        cheered: false,
        me: true,
      };
      return { ...s, feed: [item, ...s.feed], lastWin: { ...w, shared: true } };
    }
    case 'cheer':
      return {
        ...s,
        feed: s.feed.map((f) =>
          f.id === a.id ? { ...f, cheered: !f.cheered, cheers: f.cheers + (f.cheered ? -1 : 1) } : f,
        ),
      };
    case 'reset':
      return initialState;
  }
}

const KEY = 'clawback-demo-v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initialState, ...(JSON.parse(raw) as State) };
  } catch {
    /* fall back to the seed state */
  }
  return initialState;
}

const Ctx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

export type Screen = 'home' | 'pay' | 'claw' | 'win' | 'portfolio' | 'squad';
const NavCtx = createContext<(s: Screen) => void>(() => {});
export const NavProvider = NavCtx.Provider;
export const useNav = () => useContext(NavCtx);
