import { useState } from 'react';
import { BigMoney, Icon, IconButton, TopBar } from '../components/ui';
import { CENTS_PER_PLAY, roundUpCents } from '../lib/game';
import { money, moneyParts } from '../lib/format';
import { useNav, useStore } from '../state/store';
import { useChain } from '../chain/ChainProvider';
import { explorerTx } from '../chain/config';

// Demo merchants. Day 3 swaps this for a real Solana Pay request.
const MERCHANTS = [
  { name: 'Corner Café', initials: 'CC', note: 'Flat white + croissant', item: 'COFFEE', cents: 430 },
  { name: 'Metro', initials: 'MT', note: 'Ride to work', item: 'RIDE', cents: 265 },
  { name: 'Green Bowl', initials: 'GB', note: 'Lunch bowl', item: 'LUNCH', cents: 840 },
];

export default function Pay() {
  const { state, dispatch } = useStore();
  const go = useNav();
  const [mIdx, setMIdx] = useState(0);
  const [on, setOn] = useState(true);
  const [boost, setBoost] = useState(1);
  const [paid, setPaid] = useState<null | { save: number; plays: number; total: number; merchant: string; sig?: string }>(null);
  const { mode, run, status } = useChain();

  const m = MERCHANTS[mIdx];
  const save = on ? roundUpCents(m.cents) * boost : 0;
  const plays = Math.floor((state.progressCents + save) / CENTS_PER_PLAY);
  const total = m.cents + save;

  const pay = async () => {
    if (mode === 'devnet') {
      // The program sends the purchase to the merchant and the round-up to the savings vault.
      const sig = await run('Approve the payment in your wallet…', (c) => c.pay(m.cents, on ? boost : 0));
      if (!sig) return;
      dispatch({ type: 'roundupStats', saveCents: save });
      setPaid({ save, plays, total, merchant: m.name, sig });
      return;
    }
    dispatch({ type: 'pay', saveCents: save, merchant: m.name });
    setPaid({ save, plays, total, merchant: m.name });
  };

  if (paid) {
    return (
      <div className="screen">
        <TopBar center={<h1 className="label" style={{ margin: 0 }}>Receipt</h1>} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 40 }}>
          <span aria-hidden="true" style={{ width: 76, height: 76, borderRadius: 38, background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon.check size={34} stroke={2.6} />
          </span>
          <span className="muted" style={{ fontSize: 15, marginTop: 8 }}>Paid {paid.merchant}</span>
          <span className="display" style={{ fontSize: 52, letterSpacing: -2, lineHeight: 1 }}>{money(paid.total)}</span>
        </div>
        <section aria-label="Receipt" className="card receipt" style={{ marginTop: 36 }}>
          <div><span className="muted">SAVED</span><span className="accent">+{money(paid.save)}</span></div>
          <div><span className="muted">CLAW PLAYS</span><span>+{paid.plays}</span></div>
          <div><span className="muted">SAVINGS NOW</span><span>{money(state.savingsCents)}</span></div>
          {paid.sig && (
            <div>
              <span className="muted">SOLANA TX</span>
              <a href={explorerTx(paid.sig)} target="_blank" rel="noreferrer">{paid.sig.slice(0, 8)}… ↗</a>
            </div>
          )}
        </section>
        <div className="spacer" style={{ minHeight: 24 }} />
        <div className="stack">
          <button className="btn primary" onClick={() => go('claw')}>Play the claw</button>
          <button
            className="btn"
            style={{ border: 'none' }}
            onClick={() => {
              setPaid(null);
              setMIdx((i) => (i + 1) % MERCHANTS.length);
            }}
          >
            Make another payment
          </button>
          <button className="btn" style={{ border: 'none' }} onClick={() => go('home')}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar
        left={<IconButton label="Back to home" onClick={() => go('home')}><Icon.back /></IconButton>}
        center={<h1 className="label" style={{ margin: 0 }}>Paying</h1>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 20 }}>
        <span className="av" aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 26, background: '#17171c', border: '1px solid var(--line-2)', fontSize: 15 }}>{m.initials}</span>
        <span style={{ fontSize: 15, fontWeight: 500, marginTop: 6 }}>{m.name}</span>
        <span className="label">{m.note}</span>
        <div style={{ marginTop: 18 }}>
          <BigMoney parts={moneyParts(m.cents)} size={76} />
        </div>
      </div>

      <section aria-label="Round-up" className="card" style={{ marginTop: 32, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Round up the change</span>
            <span className="muted" style={{ fontSize: 13 }}>It lands in your savings, not ours</span>
          </div>
          <button className="switch" role="switch" aria-checked={on} aria-label="Round up the change" onClick={() => setOn(!on)}>
            <span />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div aria-hidden="true" style={{ display: 'flex', gap: save ? 3 : 0, height: 12 }}>
            <div style={{ flex: m.cents, borderRadius: 6, background: 'var(--text)', transition: 'flex 0.3s' }} />
            <div style={{ flex: save, borderRadius: 6, background: 'var(--accent)', transition: 'flex 0.3s' }} />
          </div>
          <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: 1 }}>
            <span className="muted">{m.item} {money(m.cents)}</span>
            <span className="accent">SAVED {money(save)}</span>
          </div>
        </div>

        {on && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <span className="muted" style={{ fontSize: 14 }}>Boost</span>
            <div className="seg" role="group" aria-label="Round-up boost" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: 200 }}>
              {[1, 2, 3].map((b) => (
                <button key={b} className="mono" aria-pressed={b === boost} onClick={() => setBoost(b)}>{b}×</button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="spacer" style={{ minHeight: 24 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 14px' }}>
        <span className="muted" style={{ fontSize: 14 }}>+{plays} claw {plays === 1 ? 'play' : 'plays'} with this payment</span>
        <span className="mono" style={{ fontSize: 14 }}>{money(total)}</span>
      </div>
      <button className="btn primary" onClick={() => void pay()} disabled={!!status}>Pay {money(total)}</button>
    </div>
  );
}
