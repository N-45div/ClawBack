import { useState, type CSSProperties } from 'react';
import { Dock, Icon, TopBar } from '../components/ui';
import { ago, money } from '../lib/format';
import { useStore } from '../state/store';

const GOAL_CENTS = 25000;
const R = 48;
const C = 2 * Math.PI * R;

export default function Squad() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<'feed' | 'board'>('feed');
  const [toast, setToast] = useState('');

  const done = Math.min(1, state.squadSavedCents / GOAL_CENTS);
  const board = [
    { name: 'Meera', initials: 'MP', cents: 6820 },
    { name: 'You', initials: 'AK', cents: state.savingsCents, me: true },
    { name: 'Rahul', initials: 'RS', cents: 3910 },
    { name: 'Arjun', initials: 'AV', cents: 2140 },
  ].sort((a, b) => b.cents - a.cents);

  return (
    <div className="screen with-dock">
      {toast && <div className="toast" role="status">{toast}</div>}
      <TopBar
        left={<h1 className="display" style={{ margin: 0, fontSize: 20 }}>Squad</h1>}
        right={
          <button
            className="btn small"
            onClick={() => {
              void navigator.clipboard?.writeText(location.origin);
              setToast('Invite link copied');
              setTimeout(() => setToast(''), 2000);
            }}
          >
            Invite
          </button>
        }
      />

      <section aria-label="Squad goal" className="card" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 18, padding: 18 }}>
        <div role="img" aria-label={`Squad goal ${Math.round(done * 100)}% done, ${money(state.squadSavedCents)} of ${money(GOAL_CENTS)}`} style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
          <svg width="112" height="112" viewBox="0 0 112 112" fill="none" aria-hidden="true">
            <circle cx="56" cy="56" r={R} stroke="#26262D" strokeWidth="9" />
            <circle
              cx="56" cy="56" r={R} stroke="var(--accent)" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${(C * done).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 56 56)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span className="display" style={{ fontSize: 20 }}>${Math.floor(state.squadSavedCents / 100)}</span>
            <span className="mono muted" style={{ fontSize: 10 }}>OF $250</span>
          </div>
        </div>
        <div className="stack">
          <span className="label" style={{ fontSize: 10 }}>Goal · 3 days left</span>
          <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.35, textWrap: 'pretty' } as CSSProperties}>
            {done >= 1 ? 'Goal hit! Everyone gets 10 bonus plays on Monday' : 'Hit $250 together and everyone gets 10 bonus plays'}
          </span>
          <div aria-hidden="true" style={{ display: 'flex' }}>
            {['RS', 'MP', 'AK', 'AV'].map((i, n) => (
              <span key={i} className={i === 'AK' ? 'av me' : 'av'} style={{ width: 28, height: 28, fontSize: 10, border: '2px solid var(--surface)', marginLeft: n ? -8 : 0 }}>{i}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="seg boxed" role="tablist" aria-label="Squad view" style={{ marginTop: 18, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>Activity</button>
        <button role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}>Top savers</button>
      </div>

      {tab === 'feed' ? (
        <ul className="list" aria-label="Activity" style={{ marginTop: 10 }}>
          {state.feed.map((f, i) => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 68, borderTop: i ? undefined : 'none' }}>
              <span className={f.me ? 'av me' : 'av'} aria-hidden="true">{f.initials}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14 }}>{f.who} <span className="muted">{f.what}</span></span>
                <span className="mono muted" style={{ fontSize: 11 }}>{ago(f.at)}</span>
              </span>
              <button
                aria-pressed={f.cheered}
                aria-label={`Cheer ${f.who}`}
                onClick={() => dispatch({ type: 'cheer', id: f.id })}
                className="mono"
                style={{
                  height: 44, minWidth: 64, padding: '0 12px', borderRadius: 22, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
                  border: `1px solid ${f.cheered ? 'var(--accent)' : 'var(--line-2)'}`,
                  background: f.cheered ? 'var(--accent)' : 'transparent',
                  color: f.cheered ? 'var(--on-accent)' : 'var(--muted-2)',
                }}
              >
                <Icon.star />{f.cheers}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="list" aria-label="Top savers this week" style={{ marginTop: 10 }}>
          {board.map((r, i) => (
            <li key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 64, borderTop: i ? undefined : 'none' }}>
              <span className="mono muted" style={{ width: 22, fontSize: 13 }}>0{i + 1}</span>
              <span className={r.me ? 'av me' : 'av'} aria-hidden="true">{r.initials}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{r.name}</span>
              <span className="mono" style={{ fontSize: 14, color: r.me ? 'var(--accent)' : 'var(--text)' }}>{money(r.cents)}</span>
            </li>
          ))}
        </ol>
      )}

      <Dock active="squad" />
    </div>
  );
}
