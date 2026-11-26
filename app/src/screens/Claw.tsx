import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { DemoBadge, Icon, IconButton, TIER_SPHERE, TopBar } from '../components/ui';
import {
  PLAY_SECONDS, aimScore, gripChance, layoutFromSeed, randomU32, resolveDrop, shortHex, slotUnder,
  type DropResult,
} from '../lib/game';
import { pct } from '../lib/format';
import { useNav, useStore } from '../state/store';

type Phase = 'idle' | 'aim' | 'auto' | 'missed';

const SPEED = 0.55; // pit widths per second
const DROP_DEPTH = 148; // px the cable extends to reach the balls
const CHUTE_X = 0.06;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BACK_PILE = [
  { left: 8, tier: 'rare' as const },
  { left: 60, tier: 'common' as const },
  { left: 112, tier: 'epic' as const },
  { left: 162, tier: 'common' as const },
  { left: 212, tier: 'rare' as const },
  { left: 262, tier: 'common' as const },
];

function ClawHead({ closed }: { closed: boolean }) {
  return (
    <svg width="52" height="50" viewBox="0 0 52 50" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id="clawMetal" gradientUnits="userSpaceOnUse" x1="8" y1="0" x2="44" y2="0">
          <stop offset="0" stopColor="#8C8C98" />
          <stop offset="0.5" stopColor="#ECECF1" />
          <stop offset="1" stopColor="#8C8C98" />
        </linearGradient>
      </defs>
      <rect x="14" y="0" width="24" height="16" rx="6" fill="url(#clawMetal)" />
      <circle cx="26" cy="8" r="3" fill="#0A0A0C" />
      <path d={closed ? 'M17 16C12 26 14 36 22 46' : 'M17 16C10 26 8 36 15 48'} stroke="url(#clawMetal)" strokeWidth="4" />
      <path d={closed ? 'M35 16C40 26 38 36 30 46' : 'M35 16C42 26 44 36 37 48'} stroke="url(#clawMetal)" strokeWidth="4" />
      <path d="M26 16V44" stroke="url(#clawMetal)" strokeWidth="4" />
    </svg>
  );
}

export default function Claw() {
  const { state, dispatch } = useStore();
  const go = useNav();

  const [seed, setSeed] = useState(() => randomU32());
  const layout = useMemo(() => layoutFromSeed(seed), [seed]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [clawX, setClawX] = useState(0.3);
  const [dir, setDir] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PLAY_SECONDS);
  const [dropY, setDropY] = useState(0);
  const [closed, setClosed] = useState(false);
  const [held, setHeld] = useState<number | null>(null); // slot index being carried
  const [inChute, setInChute] = useState(false);
  const [result, setResult] = useState<DropResult | null>(null);
  const [stageNote, setStageNote] = useState('');

  const xRef = useRef(clawX);
  xRef.current = clawX;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // StrictMode mounts twice; re-arm after the dev-only unmount
    return () => {
      alive.current = false;
    };
  }, []);

  const slot = slotUnder(clawX);
  const target = layout[slot];
  const aim = aimScore(clawX);
  const grip = gripChance(target, aim);

  // Hold-to-move loop
  useEffect(() => {
    if (phase !== 'aim' || dir === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setClawX((x) => Math.min(1, Math.max(0, x + dir * SPEED * dt)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, dir]);

  const drop = useCallback(async () => {
    if (phase !== 'aim') return;
    setDir(0);
    setPhase('auto');
    const x = xRef.current;
    const s = slotUnder(x);
    const prize = layout[s];
    // Demo: browser randomness. On-chain this roll comes from MagicBlock VRF.
    const roll = randomU32() / 4294967296;
    const r = resolveDrop(prize, aimScore(x), roll, seed);
    setResult(r);

    setStageNote('GRAB');
    setDropY(DROP_DEPTH);
    await sleep(850);
    setClosed(true);
    await sleep(350);
    if (!alive.current) return;

    if (r.failedAt === 'grab') {
      setDropY(0);
      await sleep(850);
      if (!alive.current) return;
      setClosed(false);
      setPhase('missed');
      return;
    }

    setHeld(s);
    setStageNote('LIFT');
    setDropY(0);
    if (r.failedAt === 'lift') {
      await sleep(420);
      setHeld(null);
      await sleep(450);
      if (!alive.current) return;
      setClosed(false);
      setPhase('missed');
      return;
    }
    await sleep(850);

    setStageNote('CHUTE');
    setClawX(CHUTE_X);
    if (r.failedAt === 'chute') {
      await sleep(500);
      setHeld(null);
      await sleep(500);
      if (!alive.current) return;
      setClosed(false);
      setPhase('missed');
      return;
    }
    await sleep(900);
    setClosed(false);
    setInChute(true);
    await sleep(500);
    if (!alive.current) return;
    dispatch({ type: 'win', result: r });
    go('win');
  }, [phase, layout, seed, dispatch, go]);

  // Countdown; the claw drops itself at zero
  useEffect(() => {
    if (phase !== 'aim') return;
    if (timeLeft <= 0) {
      void drop();
      return;
    }
    const t = setTimeout(() => setTimeLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, drop]);

  const start = () => {
    if (state.plays <= 0) return;
    dispatch({ type: 'startPlay' });
    setSeed(randomU32()); // new fair layout every play (VRF on-chain)
    setResult(null);
    setHeld(null);
    setInChute(false);
    setClosed(false);
    setDropY(0);
    setClawX(0.5);
    setTimeLeft(PLAY_SECONDS);
    setStageNote('');
    setPhase('aim');
  };

  // Keyboard: arrows steer, space or enter starts/drops
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft') setDir(-1);
      else if (e.key === 'ArrowRight') setDir(1);
      else if (e.key === ' ' || e.key === 'Enter') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (phase === 'aim') void drop();
        else if ((phase === 'idle' || phase === 'missed') && state.plays > 0) start();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setDir(0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const steering = phase === 'aim';
  const holdProps = (d: number) => ({
    onPointerDown: (e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (steering) setDir(d);
    },
    onPointerUp: () => setDir(0),
    onPointerCancel: () => setDir(0),
    onLostPointerCapture: () => setDir(0),
    disabled: !steering,
  });

  const centreLabel = phase === 'aim' ? 'DROP' : phase === 'auto' ? '···' : 'START';
  const onCentre = () => {
    if (phase === 'aim') void drop();
    else if (phase !== 'auto') start();
  };

  return (
    <div className="screen" style={{ alignItems: 'center' }}>
      <div className="glow" aria-hidden="true" style={{ top: 140, left: -20, width: 430, height: 460, background: 'radial-gradient(closest-side, rgba(212,255,58,0.09), rgba(212,255,58,0))' }} />

      <div style={{ width: '100%', position: 'relative' }}>
        <TopBar
          left={<IconButton label="Back to home" onClick={() => go('home')}><Icon.back /></IconButton>}
          center={
            <>
              <h1 className="label" style={{ margin: 0 }}>Machine 01</h1>
              <span style={{ fontSize: 14, fontWeight: 500 }}>$128 prize pool</span>
            </>
          }
          right={
            <span className="mono" style={{ height: 32, padding: '0 12px', borderRadius: 16, border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
              {state.plays} {state.plays === 1 ? 'PLAY' : 'PLAYS'}
            </span>
          }
        />
      </div>

      <section className="cabinet" aria-label="Claw machine" style={{ width: 350, maxWidth: '100%' }}>
        <div className="marquee">
          <div className="lights top" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => <span key={i} className={(i + (phase === 'aim' ? timeLeft : 0)) % 2 ? '' : 'lit'} />)}
          </div>
          <span className="marquee-title">CLAWBACK</span>
          <div className="lights bottom" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => <span key={i} className={(i + (phase === 'aim' ? timeLeft : 0)) % 2 ? 'lit' : ''} />)}
          </div>
        </div>

        <div className="glass">
          <div className="streak" aria-hidden="true" style={{ left: 228, width: 34 }} />
          <div className="streak" aria-hidden="true" style={{ left: 272, width: 10 }} />
          <div className="rail" aria-hidden="true" />
          <div aria-hidden="true" className="back-pile">
            {BACK_PILE.map((b, i) => <span key={i} className="ball" style={{ left: b.left, background: TIER_SPHERE[b.tier] }} />)}
          </div>

          <div className="pit">
            {/* Prize chute */}
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 150, width: 46, height: 40, borderRadius: 10, border: '1px dashed #3a3a44', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4, background: inChute ? 'rgba(212,255,58,0.12)' : 'transparent', transition: 'background 0.3s' }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: 1, color: 'var(--muted)' }}>OUT</span>
            </div>

            <div className="carriage" aria-hidden="true" style={{ left: `${clawX * 100}%`, transition: phase === 'auto' ? 'left 0.8s ease-in-out' : 'none' }} />
            {steering && <div className="guide" aria-hidden="true" style={{ left: `${clawX * 100}%` }} />}

            <div className="claw" aria-hidden="true" style={{ left: `${clawX * 100}%`, transition: phase === 'auto' ? 'left 0.8s ease-in-out' : 'none' }}>
              <div className="cable" style={{ height: 60 + dropY, transition: 'height 0.8s cubic-bezier(.5,0,.4,1)' }} />
              <ClawHead closed={closed} />
              {held !== null && !inChute && (
                <span className="ball" style={{ position: 'absolute', left: 4, top: 60 + dropY + 26, width: 44, height: 44, background: TIER_SPHERE[layout[held].tier], transition: 'top 0.8s cubic-bezier(.5,0,.4,1)' }} />
              )}
            </div>

            <ul className="prize-row" aria-label="Prizes in the machine">
              {layout.map((p, i) => (
                <li key={p.id} className={[i === slot && phase !== 'auto' ? 'target' : '', held === i || (inChute && result?.prize.id === p.id) ? 'taken' : ''].join(' ')}>
                  <span className="ball" aria-hidden="true" style={{ width: 52, height: 52, background: TIER_SPHERE[p.tier] }} />
                  <span className="tag">
                    {p.tag.split(' ')[0]}
                    <br />
                    {p.tag.split(' ')[1]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {phase === 'idle' && (
            <div className="overlay">
              {state.plays > 0 ? (
                <>
                  <span className="display" style={{ fontSize: 22 }}>Ready when you are</span>
                  <span className="muted" style={{ fontSize: 14, maxWidth: 240, lineHeight: 1.45 }}>
                    Press START to use 1 play. You get {PLAY_SECONDS} seconds to line up the claw, then DROP.
                  </span>
                </>
              ) : (
                <>
                  <span className="display" style={{ fontSize: 22 }}>No plays left</span>
                  <span className="muted" style={{ fontSize: 14, maxWidth: 240, lineHeight: 1.45 }}>Every $0.50 you round up earns a play.</span>
                  <button className="btn light small" onClick={() => go('pay')}>Pay &amp; save</button>
                </>
              )}
            </div>
          )}

          {phase === 'missed' && result && (
            <div className="overlay" role="status">
              <span className="label" style={{ color: 'var(--muted-2)' }}>Slipped at {result.failedAt}</span>
              <span className="display" style={{ fontSize: 22 }}>So close</span>
              <span className="mono muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                GRIP {pct(result.grip)} · ROLL {result.roll.toFixed(2)}<br />AIM {result.aim.toFixed(2)} · LAYOUT {shortHex(result.seed)}
              </span>
              {state.plays > 0 ? (
                <button className="btn light small" onClick={start}>Try again · {state.plays} left</button>
              ) : (
                <button className="btn light small" onClick={() => go('pay')}>Earn more plays</button>
              )}
            </div>
          )}
        </div>

        <div className="readout" aria-live="polite">
          <div><small>{phase === 'auto' ? 'STAGE' : 'TARGET'}</small><b>{phase === 'auto' ? stageNote : target.tag}</b></div>
          <div><small>GRIP</small><b>{pct(phase === 'auto' && result ? result.grip : grip)}</b></div>
          <div><small>TIME</small><b style={{ color: timeLeft <= 5 && steering ? 'var(--accent)' : 'var(--text)' }}>00:{String(steering ? timeLeft : PLAY_SECONDS).padStart(2, '0')}</b></div>
        </div>
      </section>

      <div className="controls">
        <button className="pad" aria-label="Move claw left (hold)" {...holdProps(-1)}><Icon.left /></button>
        <button
          className="arcade"
          aria-label={phase === 'aim' ? 'Drop the claw' : 'Start a play'}
          onClick={onCentre}
          disabled={phase === 'auto' || (phase !== 'aim' && state.plays <= 0)}
        >
          <span>{centreLabel}</span>
        </button>
        <button className="pad" aria-label="Move claw right (hold)" {...holdProps(1)}><Icon.right /></button>
      </div>

      <p className="hint">
        HOLD ◀ ▶ TO STEER · CENTRE IT FOR A STRONGER GRIP
        <br />
        LAYOUT {shortHex(seed)} · ODDS PUBLIC
      </p>
      <div style={{ marginTop: 10 }}><DemoBadge /></div>
    </div>
  );
}
