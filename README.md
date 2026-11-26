# ClawBack

**Spare change in, real investments out.**

ClawBack rounds up everyday payments into savings you can always withdraw. Every $0.50 you save earns a play on an arcade claw machine. Its prizes are slices of real assets (SOL, BTC, USDC) and sponsor collectibles. You never wager money: plays are earned by saving, and your savings are never at risk.

Built for **Solana Blitz v10** by MagicBlock, track *Entertainment Finance for Everyone*:
> apps that connect everyday spending to investing, as easy as a savings app and as fun as social trading.

- **Live app:** https://clawback-n45divs-projects.vercel.app. Starts in demo mode; tap the badge at the top right to switch to **Solana devnet**.
- **Program (devnet):** [`Gw5XQLpiwYnNGaxmxXmAisozGN4R4WA7YTKbAXAaTeeE`](https://explorer.solana.com/address/Gw5XQLpiwYnNGaxmxXmAisozGN4R4WA7YTKbAXAaTeeE?cluster=devnet)

## How it works

```
 Pay $4.30 for coffee ─► round up to $5.00 ─► $0.70 into your savings vault ─► +1 claw play
                                                            │
   withdraw any time ◄──────────────────────────────────────┘
                                                            
 START  ─► Game delegated to a MagicBlock Ephemeral Rollup (one wallet approval per session)
        ─► VRF shuffles the prizes into the machine
 STEER  ─► claw position streamed to the rollup ~8×/s, zero fees, no wallet popups
 DROP   ─► VRF roll vs. (your aim × the prize's public odds) ─► grab · lift · chute
 WIN    ─► prize is yours: keep it invested or sell it back instantly at a fixed price
 SETTLE ─► rollup commits + undelegates the Game; winnings land in your Solana account
```

| | Where | What |
|---|---|---|
| `pay` | Solana | Sends the purchase to the merchant, puts the round-up × boost into the vault, credits plays (1 per $0.50) |
| `withdraw` | Solana | Savings are always yours: withdraw any amount, any time |
| `load_session` + `delegate_game` | Solana | Moves plays into the Game, registers a browser session key, delegates the Game to the ER |
| `start_play` → `callback_layout` | **ER + VRF** | Uses a play; VRF shuffles the 5 prizes into the 5 slots |
| `move_claw` | **ER** | Steering, many times a second, at zero cost |
| `drop_claw` → `callback_drop` | **ER + VRF** | One roll decides the grab; the shown grip % is the true win chance |
| `end_session` | **ER** | Commit + undelegate back to Solana |
| `settle` / `sell` | Solana | Winnings become holdings; sell back at the public price into savings |

### Why it's fair, and why it isn't gambling
- **No money is wagered.** Plays come only from saving. You never pay to play, and savings never go down when you lose.
- **Public odds.** Each prize's grip chance is fixed in the program (`programs/clawback/src/game.rs`). Your aim scales it, and the UI shows the exact chance before you drop.
- **Verifiable randomness.** The prize layout and every roll come from MagicBlock VRF. The win screen shows a fairness receipt: aim, grip, roll and the drop transaction.
- **Prize funding.** Prizes come from a pool funded by sponsors and the vault's yield (`fund_pool`), in the spirit of prize-linked savings.

## Built with MagicBlock
- **Ephemeral Rollups:** the claw runs in real time on `devnet-as.magicblock.app`. Each move is a rollup transaction: no fees and fast confirmations, which a claw machine needs.
- **VRF:** two requests per play (layout and roll), served by the ephemeral oracle queue on the rollup.
- **Session keys:** the browser registers a short-lived key in `load_session`, so steering never prompts the wallet. The program only accepts the owner or that key for game moves.
- **SDK:** `ephemeral-rollups-sdk 0.18.0` (`#[ephemeral]`, `#[delegate]`, `#[commit]`, `#[vrf]`, `#[vrf_callback]`) with Anchor 1.0.2.

**Lesson learned (worth knowing if you use VRF):** the `#[vrf_callback]` macro's default identity check derives the scoped VRF identity PDA *at runtime*. That costs about 270k compute units, and our callback ran out of compute. Declaring `vrf_program_identity` yourself with a compile-time const (`scoped_vrf_identity_const(&crate::ID)` in a `const` item) fixes it. See `VRF_IDENTITY` in `programs/clawback/src/lib.rs`.

## Try it
1. Open the live app and play in **demo mode**. Everything runs in the browser.
2. Tap the top-right badge, choose **Solana devnet**, then connect a wallet set to devnet (Phantom, Solflare, Backpack).
   No wallet? Choose **Use a burner**, a devnet-only key kept in your browser, then airdrop or send it ~0.1 devnet SOL.
3. **Create account**, then **Pay & save** (try the 3× boost), then **Play the claw**. The first START asks for one approval to open the rollup session.
4. On a win, **Settle to Solana**, then sell it back or keep it from **Portfolio**. **Withdraw** returns savings to your wallet.

## Run locally
```bash
# app (demo mode works offline)
npm install --prefix app
npm run dev --prefix app            # http://localhost:5173

# program (WSL / Linux)
bash scripts/install-toolchain.sh   # Rust + Solana CLI, no sudo
bash scripts/install-anchor.sh      # Agave 3.1.9 + Anchor CLI 1.0.2
bash scripts/build.sh               # anchor build (+ keys sync on first run)
bash scripts/build.sh test          # unit tests for the claw maths
bash scripts/deploy.sh deploy       # devnet deploy with .keys/deployer.json

# end-to-end on devnet + ER: pay → delegate → VRF layout → steer → drop → VRF roll → commit → settle
npm install --prefix scripts && npm --prefix scripts run smoke
```

## Repo layout
```
app/                    React + Vite frontend
  src/chain/            ClawChain client (base layer via wallet, rollup via session key), provider, IDL
  src/lib/game.ts       claw rules (same numbers as the program)
  src/screens/          Home · Pay · Claw · Win · Portfolio · Squad
programs/clawback/      Anchor program: lib.rs (instructions/accounts), game.rs (integer maths + tests)
scripts/                toolchain, build, deploy, smoke test, debug
PLAN.md                 the day-by-day build plan
```

## Limits (devnet hackathon build)
- Money is devnet SOL at a fixed demo rate (1 cent = 10,000 lamports). "BTC"/"SOL"/"USDC" prizes are ledger entries valued in cents, not real token transfers yet.
- The squad feed and leaderboard are local, not on-chain.
- The merchant is a fixed demo wallet. A real build would use Solana Pay requests from merchants.
