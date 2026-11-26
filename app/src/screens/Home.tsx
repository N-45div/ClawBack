import { BigMoney, Dock, Icon, TopBar } from '../components/ui';
import { CENTS_PER_PLAY } from '../lib/game';
import { money, moneyParts } from '../lib/format';
import { useNav, useStore } from '../state/store';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function Sparkline({ values }: { values: number[] }) {
  const w = 350;
  const h = 80;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [4 + (i * (w - 8)) / (values.length - 1), h - 5 - ((v - lo) / span) * (h - 11)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [ex, ey] = pts[pts.length - 1];
  return (
    <figure
      role="img"
      aria-label={`Savings this week, from ${money(values[0])} to ${money(values[values.length - 1])}`}
      style={{ margin: '20px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" style={{ overflow: 'visible' }}>
        <path d={`${line}V${h}H4Z`} fill="var(--accent)" fillOpacity="0.08" />
        <path d={line} stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={ex} cy={ey} r="9" fill="var(--accent)" fillOpacity="0.18" />
        <circle cx={ex} cy={ey} r="4" fill="var(--accent)" />
      </svg>
      <div aria-hidden="true" className="mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
        {DAYS.map((d) => <span key={d}>{d}</span>)}
      </div>
    </figure>
  );
}

function MiniCabinet() {
  return (
    <svg width="92" height="124" viewBox="0 0 92 124" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="90" height="122" rx="16" fill="#1A1A20" stroke="#2E2E36" />
      <rect x="10" y="10" width="72" height="16" rx="6" fill="var(--accent)" />
      <rect x="10" y="32" width="72" height="62" rx="8" fill="#0B0B0E" stroke="#26262D" />
      <path d="M16 39H76" stroke="#3A3A44" strokeWidth="2" strokeLinecap="round" />
      <path d="M46 39V52" stroke="#8C8C98" strokeWidth="1.5" />
      <rect x="40" y="51" width="12" height="6" rx="2" fill="#D9D9E0" />
      <path d="M42 57L38 65M50 57L54 65" stroke="#D9D9E0" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="84" r="8" fill="#6F8BFF" />
      <circle cx="41" cy="86" r="7" fill="#C9CBD6" />
      <circle cx="58" cy="83" r="9" fill="#FFC547" />
      <circle cx="73" cy="87" r="6" fill="#6F8BFF" />
      <rect x="10" y="100" width="72" height="16" rx="6" fill="#111115" />
      <circle cx="26" cy="108" r="4" fill="#3A3A44" />
      <circle cx="64" cy="108" r="5" fill="var(--accent)" />
    </svg>
  );
}

export default function Home() {
  const { state } = useStore();
  const go = useNav();
  const toNext = CENTS_PER_PLAY - state.progressCents;

  return (
    <div className="screen with-dock">
      <TopBar
        left={<span className="wordmark">clawback</span>}
        right={<button className="avatar-btn" aria-label="Profile">AK</button>}
      />

      <section aria-label="Savings" className="stack" style={{ paddingTop: 8 }}>
        <span className="label">Savings · never at risk</span>
        <BigMoney parts={moneyParts(state.savingsCents)} size={60} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }} className="muted">
          <span className="pill accent">+{money(state.weekRoundupsCents)}</span>
          from round-ups this week
        </div>
      </section>

      <Sparkline values={state.week} />

      <div className="row2" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => go('portfolio')}>Withdraw</button>
        <button className="btn light" onClick={() => go('pay')}>Pay &amp; save</button>
      </div>

      <button
        className="dots"
        onClick={() => go('claw')}
        style={{
          marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '18px 18px 18px 20px', borderRadius: 24, border: '1px solid var(--line)', backgroundColor: '#111115', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">Machine 01 · $128 pool</span>
          <span className="display" style={{ fontSize: 24 }}>
            {state.plays} {state.plays === 1 ? 'play' : 'plays'} ready
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="bar" style={{ width: 96 }} aria-hidden="true">
              <div style={{ width: `${(state.progressCents / CENTS_PER_PLAY) * 100}%` }} />
            </div>
            <span className="label">{money(toNext)} to go</span>
          </div>
          <span
            style={{
              alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 22, background: 'var(--accent)', color: 'var(--on-accent)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, marginTop: 4,
            }}
          >
            {state.plays > 0 ? 'Play now' : 'Earn a play'} <Icon.arrow />
          </span>
        </div>
        <MiniCabinet />
      </button>

      <section aria-label="Squad activity" style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 36 }}>
          <span className="label">Squad</span>
          <button onClick={() => go('squad')} style={{ border: 'none', background: 'none', fontSize: 13, minHeight: 44, padding: 0 }}>See all</button>
        </div>
        <ul className="list">
          {state.feed.slice(0, 2).map((f) => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56 }}>
              <span className={f.me ? 'av sm me' : 'av sm'} aria-hidden="true">{f.initials}</span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {f.who} <span className="muted">{f.what}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Dock active="home" />
    </div>
  );
}
