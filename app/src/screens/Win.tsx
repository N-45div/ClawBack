import { useEffect } from 'react';
import { DemoBadge, Icon, IconButton, TIER_SPHERE, TopBar } from '../components/ui';
import { shortHex } from '../lib/game';
import { money, pct } from '../lib/format';
import { useNav, useStore } from '../state/store';

const GLOW: Record<string, string> = {
  common: 'rgba(210,212,222,0.22)',
  rare: 'rgba(120,145,255,0.32)',
  epic: 'rgba(255,203,85,0.3)',
};

export default function Win() {
  const { state, dispatch } = useStore();
  const go = useNav();
  const w = state.lastWin;

  useEffect(() => {
    if (!w) go('claw');
  }, [w, go]);
  if (!w) return null;

  const { result, sold, shared } = w;
  const p = result.prize;
  const ticker = p.asset === 'NFT' ? 'NFT' : p.asset;

  return (
    <div className="screen" style={{ alignItems: 'center' }}>
      <div className="glow" aria-hidden="true" style={{ top: 40, left: '50%', marginLeft: -160, width: 320, height: 320, background: `radial-gradient(closest-side, ${GLOW[p.tier]}, rgba(0,0,0,0))` }} />

      <div style={{ width: '100%', position: 'relative' }}>
        <TopBar
          left={<IconButton label="Close" onClick={() => go('home')}><Icon.close /></IconButton>}
          center={<span className="label" style={{ color: 'var(--accent)' }}>{sold ? 'Sold back' : 'Prize secured'}</span>}
        />
      </div>

      <div
        className="ball"
        style={{
          position: 'relative', marginTop: 18, width: 148, height: 148, background: TIER_SPHERE[p.tier],
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 50px rgba(0,0,0,0.5)',
          animation: 'rise 0.45s cubic-bezier(.2,1.4,.4,1)',
        }}
      >
        <span className="display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1, color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}>{ticker}</span>
      </div>

      <h1 className="display" style={{ position: 'relative', margin: '26px 0 0', fontSize: 28, letterSpacing: -1, textAlign: 'center' }}>{p.name}</h1>
      <span className="muted" style={{ position: 'relative', marginTop: 8, fontSize: 14 }}>
        {sold ? `${money(p.sellBackCents)} added to your savings` : `${p.tier[0].toUpperCase() + p.tier.slice(1)} tier · yours now`}
      </span>

      <ol className="stepper" aria-label="Grip checks passed">
        {['GRAB', 'LIFT', 'CHUTE'].map((s) => (
          <li key={s}>
            <span className="node"><Icon.check /></span>
            {s}
          </li>
        ))}
      </ol>

      <section aria-label="Fairness receipt" className="card ticket" style={{ marginTop: 26, borderRadius: 20 }}>
        <div className="ticket-head">
          <span className="muted" style={{ letterSpacing: 1.2 }}>FAIRNESS RECEIPT</span>
          <span className="accent">LAYOUT {shortHex(result.seed)}</span>
        </div>
        <span className="notch" aria-hidden="true" style={{ left: -11, borderRight: '1px solid var(--line)' }} />
        <span className="notch" aria-hidden="true" style={{ right: -11, borderLeft: '1px solid var(--line)' }} />
        <div className="ticket-grid">
          <div><small>AIM</small><span>{result.aim.toFixed(2)}</span></div>
          <div><small>GRIP / ROLL</small><span>{pct(result.grip)} / {result.roll.toFixed(2)}</span></div>
          <div><small>SELL-BACK</small><span>{money(p.sellBackCents)}</span></div>
        </div>
      </section>

      <div style={{ marginTop: 10 }}><DemoBadge /></div>
      <div className="spacer" style={{ minHeight: 20 }} />

      <div className="stack" style={{ width: '100%', position: 'relative' }}>
        {sold ? (
          <button className="btn primary" onClick={() => go('home')}>Back to savings</button>
        ) : (
          <button className="btn primary" onClick={() => go('portfolio')}>Keep it invested</button>
        )}
        <div className="row2">
          <button className="btn" disabled={sold} onClick={() => dispatch({ type: 'sell', holdingId: w.holdingId })}>
            {sold ? 'Sold' : `Sell for ${money(p.sellBackCents)}`}
          </button>
          <button
            className="btn"
            disabled={shared}
            onClick={() => {
              dispatch({ type: 'share' });
              go('squad');
            }}
          >
            {shared ? 'Shared' : 'Share to squad'}
          </button>
        </div>
        <button className="btn ghost" onClick={() => go('claw')}>
          {state.plays > 0 ? `PLAY AGAIN · ${state.plays} LEFT` : 'EARN MORE PLAYS'}
        </button>
      </div>
    </div>
  );
}
