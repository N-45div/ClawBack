# Clawback: build plan

Solana Blitz v10 (MagicBlock). Deadline: **Fri Nov 27, 7:30 PM IST**.
Submit at https://build.magicblock.app/?stage=blitz#submit

**One line:** Spare change from everyday payments goes into savings you can always withdraw. Each round-up earns claw plays, and the prizes are small slices of real investments. No money is ever wagered.

Design: https://claude.ai/artifact/85kvLThWdfG7cLx8EeKDMZ

## Day 1: Tue Nov 24, app UI plus demo mode
- [x] React + Vite app in `app/`, all six screens from the approved design
- [x] Game logic in `app/src/lib/game.ts`: real-time claw, aim score, grip chance, 3-stage reveal (grab, lift, chute)
- [x] Local state saved in localStorage, so the full loop works with no chain:
      pay → round-up → plays → claw → win → keep or sell → squad feed
- [x] Clear "DEMO MODE" label wherever randomness is local

Run it: `npm run dev --prefix app`, then open http://localhost:5173.
Controls: hold ◀ ▶ (or the arrow keys) to steer, START/DROP (or Space).

## Day 2: Wed Nov 25, on-chain program (devnet)
- [x] Install Rust, Solana CLI and Anchor (WSL): Agave 3.1.9, Anchor 1.0.2, `ephemeral-rollups-sdk =0.18.0`
- [x] Anchor program `clawback` (builds; 6 unit tests on the game math pass):
  - `Player` PDA: savings, plays, round-up progress, holdings
  - `pay_and_round_up`: sends the merchant payment, round-up goes to the savings vault, credits plays
  - `withdraw`: savings back to the wallet at any time
  - `Game` PDA delegated to an **Ephemeral Rollup**: `start_play`, `move_claw` (fast, zero fee), `drop`
  - `drop` requests **MagicBlock VRF**; the callback scores aim × tier odds and resolves grab, lift and chute
  - commit and undelegate the game, then settle the prize to the `Player`
- [x] Smoke test script: `scripts/smoke.ts` (full loop on devnet + ER)
- [x] Deployed to devnet (upgrade authority: devnet wallet `.keys/deployer.json`, `Bs5W7m…RgaG`)
- [x] Smoke test passes end to end on devnet + `devnet-as` ER: pay → delegate → VRF layout → steer → drop → VRF roll →
      commit/undelegate (~2–3 s) → settle. Run: `npm --prefix scripts run smoke`; inspect: `npx --prefix scripts tsx scripts/debug.ts`
- Fixed on the way: the `#[vrf_callback]` macro derives the VRF identity PDA at runtime (~270k CU, callback ran out of
  compute). The callback now declares `vrf_program_identity` with a compile-time `VRF_IDENTITY` const.
  `end_session` also recovers a game whose VRF answer never arrived (refunds the play).

Build (in WSL): `bash scripts/build.sh` · errors only: `bash scripts/build.sh errors` · tests: `bash scripts/build.sh test`
Program id: `Gw5XQLpiwYnNGaxmxXmAisozGN4R4WA7YTKbAXAaTeeE`

## Day 3: Thu Nov 26 to Fri Nov 27, connect and ship
- [x] Wallet adapter (Wallet Standard) + devnet burner wallet; session key signs rollup moves (no popups while steering)
- [x] Demo/devnet switch: pay, withdraw, sell, settle, START/steer/DROP all on-chain in devnet, with demo kept as a fallback
- [x] Tested in the app on devnet: create account → pay 3× (+$2.10, +4 plays) → session + VRF layout (2.8 s) →
      drop (VRF, 3.6 s) → won $1 BTC → settle → sell-back (+$0.95) → withdraw
- [x] README
- [x] Frontend on Vercel: https://clawback-six.vercel.app
- [ ] 2-minute demo video (script in DEMO.md)
- [ ] Submit before Fri 7:30 PM IST
