import type { ReactNode } from 'react';
import type { Asset, Tier } from '../lib/game';
import { useNav, type Screen } from '../state/store';

type IconProps = { size?: number; stroke?: number };
const svg = (size: number, stroke: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  home: ({ size = 22, stroke = 2 }: IconProps) => svg(size, stroke, <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />),
  claw: ({ size = 22, stroke = 2 }: IconProps) =>
    svg(size, stroke, <><path d="M12 2v7" /><path d="M7 14l5-5 5 5" /><path d="M7 14v3l-2 3" /><path d="M17 14v3l2 3" /></>),
  chart: ({ size = 22, stroke = 2 }: IconProps) =>
    svg(size, stroke, <><path d="M3 20h18" /><path d="M6 16v-5" /><path d="M11 16V7" /><path d="M16 16v-3" /><path d="M20 16V5" /></>),
  users: ({ size = 22, stroke = 2 }: IconProps) =>
    svg(size, stroke, <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>),
  back: ({ size = 20, stroke = 2 }: IconProps) => svg(size, stroke, <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>),
  close: ({ size = 18, stroke = 2 }: IconProps) => svg(size, stroke, <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>),
  arrow: ({ size = 16, stroke = 2.4 }: IconProps) => svg(size, stroke, <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>),
  left: ({ size = 24, stroke = 2.4 }: IconProps) => svg(size, stroke, <path d="M15 5l-7 7 7 7" />),
  right: ({ size = 24, stroke = 2.4 }: IconProps) => svg(size, stroke, <path d="M9 5l7 7-7 7" />),
  check: ({ size = 14, stroke = 3.2 }: IconProps) => svg(size, stroke, <path d="M5 12.5l4.5 4.5L19 7.5" />),
  lock: ({ size = 18, stroke = 2 }: IconProps) => svg(size, stroke, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  star: ({ size = 15, stroke = 2 }: IconProps) =>
    svg(size, stroke, <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />),
  chevron: ({ size = 16, stroke = 2 }: IconProps) => svg(size, stroke, <path d="M9 5l7 7-7 7" />),
};

export function sphereBg(base: string, dark: string): string {
  return `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75), rgba(255,255,255,0) 30%), radial-gradient(circle at 50% 55%, ${base}, ${dark})`;
}

export const TIER_SPHERE: Record<Tier, string> = {
  common: sphereBg('#D2D4DE', '#4E5160'),
  rare: sphereBg('#7891FF', '#1F2A70'),
  epic: sphereBg('#FFCB55', '#7A4E00'),
};

export const ASSET_SPHERE: Record<Asset, string> = {
  SOL: sphereBg('#A98BFF', '#3B2286'),
  BTC: sphereBg('#FFCB55', '#7A4E00'),
  USDC: sphereBg('#7CC4FF', '#1C4F80'),
  NFT: sphereBg('#D2D4DE', '#4E5160'),
};

export function BigMoney({ parts, size }: { parts: [string, string]; size: number }) {
  return (
    <div className="bigmoney" style={{ letterSpacing: size > 50 ? -2 : -1 }}>
      <span style={{ fontSize: size }}>{parts[0]}</span>
      <span style={{ fontSize: size / 2 }} className="muted">{parts[1]}</span>
    </div>
  );
}

export function TopBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      <div className="topbar-center">{center}</div>
      <div className="topbar-side right">{right}</div>
    </header>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="iconbtn" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

const TABS: { id: Screen; label: string; icon: keyof typeof Icon }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'claw', label: 'Play', icon: 'claw' },
  { id: 'portfolio', label: 'Portfolio', icon: 'chart' },
  { id: 'squad', label: 'Squad', icon: 'users' },
];

export function Dock({ active }: { active: Screen }) {
  const go = useNav();
  return (
    <nav className="dock" aria-label="Main">
      {TABS.map((t) => {
        const on = t.id === active;
        const I = Icon[t.icon];
        return (
          <button
            key={t.id}
            className={on ? 'dock-item on' : 'dock-item'}
            aria-label={t.label}
            aria-current={on ? 'page' : undefined}
            onClick={() => go(t.id)}
          >
            <I size={on ? 20 : 22} />
            {on && <span>{t.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <h2 className="sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function DemoBadge() {
  return <span className="demo-badge" title="Randomness and balances are local in demo mode. Day 2 moves them on-chain.">DEMO MODE</span>;
}
