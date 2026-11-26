import { useState } from 'react';
import { NavProvider, type Screen } from './state/store';
import Home from './screens/Home';
import Pay from './screens/Pay';
import Claw from './screens/Claw';
import Win from './screens/Win';
import Portfolio from './screens/Portfolio';
import Squad from './screens/Squad';
import { ChainToast, WalletSheet } from './components/WalletSheet';

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const h = location.hash.slice(1) as Screen;
    return ['home', 'pay', 'claw', 'win', 'portfolio', 'squad'].includes(h) ? h : 'home';
  });
  const go = (s: Screen) => {
    setScreen(s);
    history.replaceState(null, '', '#' + s);
    document.querySelector('.screen')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  };

  return (
    <NavProvider value={go}>
      <div className="phone">
        {screen === 'home' && <Home />}
        {screen === 'pay' && <Pay />}
        {screen === 'claw' && <Claw />}
        {screen === 'win' && <Win />}
        {screen === 'portfolio' && <Portfolio />}
        {screen === 'squad' && <Squad />}
        <ChainToast />
        <WalletSheet />
      </div>
    </NavProvider>
  );
}
