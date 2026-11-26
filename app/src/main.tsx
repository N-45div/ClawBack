import './polyfills';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BASE_RPC } from './chain/config';
import { ChainProvider, useChain } from './chain/ChainProvider';
import { StoreProvider, devnetInitialState, initialState, useStore } from './state/store';
import './styles.css';

/** Pushes every fresh chain snapshot into the devnet store. */
function SyncBridge() {
  const { snap } = useChain();
  const { dispatch } = useStore();
  useEffect(() => {
    if (snap) dispatch({ type: 'sync', snap });
  }, [snap, dispatch]);
  return null;
}

function ModeStore({ children }: { children: ReactNode }) {
  const { mode } = useChain();
  return mode === 'devnet' ? (
    <StoreProvider key="devnet" storageKey="clawback-devnet-v1" seed={devnetInitialState}>
      <SyncBridge />
      {children}
    </StoreProvider>
  ) : (
    <StoreProvider key="demo" storageKey="clawback-demo-v1" seed={initialState}>
      {children}
    </StoreProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Wallets are discovered through the Wallet Standard (Phantom, Solflare, Backpack, ...). */}
    <ConnectionProvider endpoint={BASE_RPC}>
      <WalletProvider wallets={[]} autoConnect>
        <ChainProvider>
          <ModeStore>
            <App />
          </ModeStore>
        </ChainProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>,
);
