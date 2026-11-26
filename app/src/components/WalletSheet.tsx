import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect } from 'react';
import { useChain } from '../chain/ChainProvider';
import { explorerAddress, PROGRAM_ID } from '../chain/config';
import { Sheet } from './ui';

const short = (a: string) => a.slice(0, 4) + '…' + a.slice(-4);

/** Top-bar pill: shows the network (and wallet in devnet) and opens the sheet. */
export function ModeBadge() {
  const { mode, openSheet, chain } = useChain();
  const publicKey = chain?.owner;
  const label = mode === 'demo' ? 'DEMO' : publicKey ? short(publicKey.toBase58()) : 'CONNECT';
  return (
    <button
      className="mono"
      onClick={() => openSheet(true)}
      aria-label="Network and wallet"
      style={{
        height: 36, padding: '0 12px', borderRadius: 18, fontSize: 11, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6,
        border: '1px solid var(--line-2)', background: mode === 'devnet' ? 'rgba(212,255,58,0.1)' : 'transparent',
        color: mode === 'devnet' ? 'var(--accent)' : 'var(--muted-2)', whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: mode === 'devnet' && publicKey ? 'var(--accent)' : 'var(--muted)' }} />
      {label}
    </button>
  );
}

export function WalletSheet() {
  const { mode, setMode, sheetOpen, openSheet, snap, burner, chain, run } = useChain();
  const { wallets, select, wallet, connect, connected, connecting, disconnect, publicKey: adapterKey } = useWallet();
  const publicKey = chain?.owner ?? adapterKey;

  // After picking a wallet, connect to it.
  useEffect(() => {
    if (wallet && !connected && !connecting) connect().catch(() => {});
  }, [wallet, connected, connecting, connect]);

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  const sol = snap ? snap.walletLamports / 1e9 : null;

  return (
    <Sheet open={sheetOpen} onClose={() => openSheet(false)} title="Network">
      <div className="seg boxed" role="tablist" aria-label="Network" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <button role="tab" aria-selected={mode === 'demo'} onClick={() => setMode('demo')}>Demo</button>
        <button role="tab" aria-selected={mode === 'devnet'} onClick={() => setMode('devnet')}>Solana devnet</button>
      </div>

      {mode === 'demo' ? (
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Everything runs in your browser with sample balances. Switch to devnet to save, play and win on-chain with
          MagicBlock Ephemeral Rollups and VRF.
        </p>
      ) : (connected || burner.on) && publicKey ? (
        <>
          <div className="card receipt">
            <div><span className="muted">{burner.on ? 'BURNER WALLET' : 'WALLET'}</span><span>{short(publicKey.toBase58())}</span></div>
            <div><span className="muted">DEVNET SOL</span><span>{sol === null ? '…' : sol.toFixed(3)}</span></div>
            <div><span className="muted">PROGRAM</span><a href={explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">{short(PROGRAM_ID.toBase58())} ↗</a></div>
          </div>
          {sol !== null && sol < 0.05 && (
            <a className="btn light" href="https://faucet.solana.com" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              Get devnet SOL ↗
            </a>
          )}
          {burner.on && sol !== null && sol < 0.05 && (
            <button
              className="btn"
              onClick={() =>
                void run('Requesting a devnet airdrop…', async (c) => {
                  const sig = await c.base.requestAirdrop(c.owner, 1e9);
                  await c.base.confirmTransaction(sig, 'confirmed');
                })
              }
            >
              Airdrop 1 devnet SOL
            </button>
          )}
          {burner.on ? (
            <button className="btn" onClick={() => burner.enable(false)}>Stop using burner</button>
          ) : (
            <button className="btn" onClick={() => disconnect().catch(() => {})}>Disconnect</button>
          )}
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Connect a Solana wallet set to devnet. You approve deposits and withdrawals; claw moves are signed by a
            short-lived session key, so no popups while you play.
          </p>
          {installed.length === 0 ? (
            <a className="btn light" href="https://phantom.com/download" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              Install a Solana wallet ↗
            </a>
          ) : (
            <div className="stack">
              {installed.map((w) => (
                <button key={w.adapter.name} className="btn" style={{ justifyContent: 'flex-start', gap: 12 }} onClick={() => select(w.adapter.name)} disabled={connecting}>
                  <img src={w.adapter.icon} alt="" width={24} height={24} style={{ borderRadius: 6 }} />
                  {connecting && wallet?.adapter.name === w.adapter.name ? 'Connecting…' : w.adapter.name}
                </button>
              ))}
            </div>
          )}
          <button className="btn" style={{ border: '1px dashed #3a3a44' }} onClick={() => burner.enable(true)}>
            No wallet? Use a burner (devnet only)
          </button>
        </>
      )}
      <button className="btn" style={{ border: 'none' }} onClick={() => openSheet(false)}>Done</button>
    </Sheet>
  );
}

/** Pending transaction status and errors, shown over every screen. */
export function ChainToast() {
  const { status, error, clearError } = useChain();
  if (!status && !error) return null;
  return (
    <div
      className="toast"
      role={error ? 'alert' : 'status'}
      style={{ top: 'auto', bottom: 96, display: 'flex', alignItems: 'center', gap: 10, zIndex: 60, background: error ? '#2a1414' : 'var(--text)', color: error ? '#ffb4a8' : 'var(--bg)', border: error ? '1px solid #5a2a24' : 'none' }}
    >
      {!error && <span className="spinner" aria-hidden="true" />}
      <span style={{ flex: 1, lineHeight: 1.35 }}>{error || status}</span>
      {error && <button onClick={clearError} aria-label="Dismiss" style={{ border: 'none', background: 'none', color: 'inherit', fontSize: 18, minWidth: 44, minHeight: 44 }}>×</button>}
    </div>
  );
}
