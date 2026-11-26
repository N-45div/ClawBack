import { useState } from 'react';
import { ASSET_SPHERE, BigMoney, Dock, Icon, Sheet, TopBar } from '../components/ui';
import { money, moneyParts } from '../lib/format';
import { initialState, useStore, type Holding } from '../state/store';

// Illustrative 7-day shape per asset. Day 3 replaces these with live prices.
const SPARK: Record<string, string> = {
  SOL: 'M2 17L11 14L20 15L29 9L38 11L47 6L54 4',
  BTC: 'M2 12L11 13L20 10L29 12L38 8L47 9L54 7',
  USDC: 'M2 11L54 11',
  NFT: 'M2 11L54 11',
};

export default function Portfolio() {
  const { state, dispatch } = useStore();
  const [selling, setSelling] = useState<Holding | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [toast, setToast] = useState('');

  const wonCents = state.holdings.reduce((a, h) => a + h.valueCents, 0);
  const total = state.savingsCents + wonCents;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  return (
    <div className="screen with-dock">
      {toast && <div className="toast" role="status">{toast}</div>}
      <TopBar left={<h1 className="display" style={{ margin: 0, fontSize: 20, whiteSpace: 'nowrap' }}>Portfolio</h1>} />

      <section aria-label="Total balance" className="stack" style={{ paddingTop: 8 }}>
        <span className="label">Everything you own</span>
        <BigMoney parts={moneyParts(total)} size={56} />
        <div aria-hidden="true" style={{ display: 'flex', gap: 3, height: 8, marginTop: 12 }}>
          <div style={{ flex: state.savingsCents, borderRadius: 4, background: 'var(--text)' }} />
          <div style={{ flex: wonCents, borderRadius: 4, background: 'var(--accent)' }} />
        </div>
        <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: 1, color: 'var(--muted-2)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--text)' }} />SAVINGS {money(state.savingsCents)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent)' }} />WON {money(wonCents)}
          </span>
        </div>
      </section>

      <section aria-label="Savings" className="card" style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 14px 14px 16px', borderRadius: 20 }}>
        <span aria-hidden="true" className="av" style={{ width: 40, height: 40, borderRadius: 20 }}><Icon.lock /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Savings</span>
          <span className="muted" style={{ fontSize: 12 }}>Never at risk · its yield funds prizes</span>
        </div>
        <button className="btn small" onClick={() => setWithdrawing(true)} disabled={state.savingsCents <= 0}>Withdraw</button>
      </section>

      <section aria-label="Won from the claw" style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32 }}>
          <h2 className="label" style={{ margin: 0, fontWeight: 400 }}>Won from the claw</h2>
          <span className="label">{state.playsUsed} free plays</span>
        </div>
        {state.holdings.length === 0 ? (
          <p className="muted" style={{ fontSize: 14, margin: '12px 0' }}>Nothing yet. Your first grab lands here.</p>
        ) : (
          <ul className="list">
            {state.holdings.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => setSelling(h)}
                  aria-label={`${h.name}, ${money(h.valueCents)}. Open to hold or sell`}
                  style={{ width: '100%', height: 66, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}
                >
                  <span className="ball" aria-hidden="true" style={{ width: 34, height: 34, background: ASSET_SPHERE[h.asset] }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{h.name}</span>
                    <span className="mono muted" style={{ fontSize: 11 }}>{h.asset === 'NFT' ? 'NFT · COLLECTIBLE' : h.asset}</span>
                  </span>
                  <svg width="56" height="22" viewBox="0 0 56 22" fill="none" aria-hidden="true">
                    <path d={SPARK[h.asset]} stroke={h.asset === 'SOL' || h.asset === 'BTC' ? 'var(--accent)' : '#4A4A55'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="mono" style={{ width: 64, textAlign: 'right', fontSize: 14 }}>{h.asset === 'NFT' ? 'Owned' : money(h.valueCents)}</span>
                  <span style={{ color: '#6A6A76', display: 'flex' }}><Icon.chevron /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn ghost"
          style={{ marginTop: 12, width: '100%' }}
          onClick={() => {
            if (confirm('Reset the demo balances?')) dispatch({ type: 'reset' });
          }}
        >
          RESET DEMO ({money(initialState.savingsCents)})
        </button>
      </section>

      <Sheet open={!!selling} onClose={() => setSelling(null)} title={selling?.name ?? ''}>
        {selling && (
          <>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Keep it invested, or sell it back to the machine instantly. The sell-back price is fixed and public.
            </p>
            <div className="card receipt">
              <div><span className="muted">WORTH</span><span>{money(selling.valueCents)}</span></div>
              <div><span className="muted">SELL-BACK</span><span className="accent">{money(selling.sellBackCents)}</span></div>
            </div>
            <button
              className="btn primary"
              onClick={() => {
                dispatch({ type: 'sell', holdingId: selling.id });
                flash(`Sold. ${money(selling.sellBackCents)} added to savings.`);
                setSelling(null);
              }}
            >
              Sell for {money(selling.sellBackCents)}
            </button>
            <button className="btn" onClick={() => setSelling(null)}>Keep it</button>
          </>
        )}
      </Sheet>

      <Sheet open={withdrawing} onClose={() => setWithdrawing(false)} title="Withdraw savings">
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Your savings are always yours. Withdrawing sends them back to your wallet. Plays you already earned stay.
        </p>
        <div className="card receipt">
          <div><span className="muted">AVAILABLE</span><span>{money(state.savingsCents)}</span></div>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            const amt = state.savingsCents;
            dispatch({ type: 'withdraw', cents: amt });
            flash(`${money(amt)} sent to your wallet.`);
            setWithdrawing(false);
          }}
        >
          Withdraw {money(state.savingsCents)}
        </button>
        <button className="btn" onClick={() => setWithdrawing(false)}>Cancel</button>
      </Sheet>

      <Dock active="portfolio" />
    </div>
  );
}
