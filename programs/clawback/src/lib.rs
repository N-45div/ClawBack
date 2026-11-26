//! Clawback: spare change in, real investments out.
//!
//! Base layer (Solana devnet):
//!   init_vault / fund_pool          the savings vault and prize pool
//!   init_player                     a Player (savings, plays, holdings) + its Game
//!   pay                             pay a merchant; round-up goes to savings and earns plays
//!   withdraw / sell                 savings are always withdrawable; prizes sell back instantly
//!   load_session + delegate_game    move plays into the Game and delegate it to an Ephemeral Rollup
//!   settle                          after undelegation, move winnings + unused plays back to the Player
//!
//! Ephemeral Rollup (zero fee, real time):
//!   start_play -> VRF -> callback_layout     fair prize layout every play
//!   move_claw                                 steer, many times a second
//!   drop_claw  -> VRF -> callback_drop       aim x tier odds decides the grab
//!   end_session                               commit + undelegate the Game back to the base layer
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::Discriminator;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::{
    self as mb_vrf,
    consts::{program_identity_pubkey, scoped_vrf_identity_const},
    instructions::{create_request_randomness_ix_const, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

pub mod game;

declare_id!("Gw5XQLpiwYnNGaxmxXmAisozGN4R4WA7YTKbAXAaTeeE");

const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);
/// The VRF oracle's signer for callbacks into this program. Computed at compile time:
/// the #[vrf_callback] macro's default derives it at runtime, which burns ~270k CU.
pub const VRF_IDENTITY: Pubkey = Pubkey::new_from_array(scoped_vrf_identity_const(&crate::ID).0);
/// A VRF request older than this is treated as lost (oracle requests purge after ~2 min).
pub const VRF_STALE_SECONDS: i64 = 45;

pub const VAULT_SEED: &[u8] = b"vault";
pub const PLAYER_SEED: &[u8] = b"player";
pub const GAME_SEED: &[u8] = b"game";

/// Devnet money unit: 1 cent = 10,000 lamports ($1 = 0.001 SOL).
pub const LAMPORTS_PER_CENT: u64 = 10_000;
pub const CENTS_PER_PLAY: u64 = 50;
pub const MAX_BOOST: u8 = 3;
/// Seconds a player has to steer before anyone may force the drop.
pub const PLAY_SECONDS: i64 = 15;
/// Lamports sent to the session key so it can sign on the rollup.
pub const SESSION_TOP_UP: u64 = 2_000_000;

pub mod phase {
    pub const IDLE: u8 = 0;
    pub const AWAIT_LAYOUT: u8 = 1;
    pub const AIM: u8 = 2;
    pub const AWAIT_DROP: u8 = 3;
}

#[ephemeral]
#[program]
pub mod clawback {
    use super::*;

    // ------------------------------------------------------------ base layer

    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.authority = ctx.accounts.authority.key();
        v.pool_cents = 0;
        v.total_savings_cents = 0;
        v.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Anyone (a sponsor, the treasury) can top up the prize pool.
    pub fn fund_pool(ctx: Context<FundPool>, amount_cents: u64) -> Result<()> {
        transfer_in(&ctx.accounts.funder, &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program, amount_cents)?;
        ctx.accounts.vault.pool_cents = ctx.accounts.vault.pool_cents.checked_add(amount_cents).ok_or(ClawError::Overflow)?;
        Ok(())
    }

    pub fn init_player(ctx: Context<InitPlayer>) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        let p = &mut ctx.accounts.player;
        p.owner = owner;
        p.bump = ctx.bumps.player;
        let g = &mut ctx.accounts.game;
        g.owner = owner;
        g.bump = ctx.bumps.game;
        g.layout = [0, 1, 2, 3, 4];
        g.claw_x = 500;
        Ok(())
    }

    /// Pay a merchant. The round-up (x boost) goes to the savings vault and earns plays.
    pub fn pay(ctx: Context<Pay>, amount_cents: u64, boost: u8) -> Result<()> {
        require!(amount_cents > 0, ClawError::BadAmount);
        require!(boost <= MAX_BOOST, ClawError::BadBoost);
        // The purchase itself
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer { from: ctx.accounts.owner.to_account_info(), to: ctx.accounts.merchant.to_account_info() },
            ),
            amount_cents * LAMPORTS_PER_CENT,
        )?;
        if boost == 0 {
            return Ok(());
        }
        let save = game::round_up_cents(amount_cents) * boost as u64;
        transfer_in(&ctx.accounts.owner, &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program, save)?;

        let p = &mut ctx.accounts.player;
        let bank = p.progress_cents + save;
        p.plays = p.plays.checked_add((bank / CENTS_PER_PLAY) as u32).ok_or(ClawError::Overflow)?;
        p.progress_cents = bank % CENTS_PER_PLAY;
        p.savings_cents += save;
        ctx.accounts.vault.total_savings_cents += save;
        emit!(RoundUp { owner: p.owner, amount_cents, saved_cents: save, plays: p.plays });
        Ok(())
    }

    /// Savings are never at risk: withdraw any amount, any time.
    pub fn withdraw(ctx: Context<Withdraw>, amount_cents: u64) -> Result<()> {
        let p = &mut ctx.accounts.player;
        require!(amount_cents > 0 && amount_cents <= p.savings_cents, ClawError::BadAmount);
        p.savings_cents -= amount_cents;
        ctx.accounts.vault.total_savings_cents -= amount_cents;
        pay_out(&ctx.accounts.vault.to_account_info(), &ctx.accounts.owner.to_account_info(), amount_cents)?;
        Ok(())
    }

    /// Sell a won asset back to the machine at its fixed sell-back price; proceeds go to savings.
    pub fn sell(ctx: Context<Sell>, asset: u8) -> Result<()> {
        require!((asset as usize) < 4, ClawError::BadAsset);
        let p = &mut ctx.accounts.player;
        let v = &mut ctx.accounts.vault;
        let a = asset as usize;
        let proceeds = p.sell_back_cents[a];
        require!(proceeds > 0, ClawError::NothingToSell);
        require!(v.pool_cents >= proceeds, ClawError::PoolEmpty);
        v.pool_cents -= proceeds;
        v.total_savings_cents += proceeds;
        p.savings_cents += proceeds;
        p.holdings_cents[a] = 0;
        p.sell_back_cents[a] = 0;
        Ok(())
    }

    /// Move earned plays into the Game and register a browser session key that may
    /// sign rollup moves (no wallet popup per move). Follow with delegate_game in the same tx.
    pub fn load_session(ctx: Context<LoadSession>, session_key: Pubkey) -> Result<()> {
        let p = &mut ctx.accounts.player;
        let g = &mut ctx.accounts.game;
        require!(g.phase == phase::IDLE, ClawError::WrongPhase);
        g.plays = g.plays.checked_add(p.plays).ok_or(ClawError::Overflow)?;
        p.plays = 0;
        g.session_key = session_key;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer { from: ctx.accounts.owner.to_account_info(), to: ctx.accounts.session.to_account_info() },
            ),
            SESSION_TOP_UP,
        )?;
        Ok(())
    }

    pub fn delegate_game(ctx: Context<DelegateGame>) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        ctx.accounts.delegate_game(
            &ctx.accounts.owner,
            &[GAME_SEED, owner.as_ref()],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// After the Game is undelegated: winnings become holdings, unused plays go back.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let p = &mut ctx.accounts.player;
        let g = &mut ctx.accounts.game;
        require!(g.phase == phase::IDLE, ClawError::WrongPhase);
        for a in 0..4 {
            p.holdings_cents[a] += g.won_value_cents[a];
            p.sell_back_cents[a] += g.won_sell_back_cents[a];
            g.won_value_cents[a] = 0;
            g.won_sell_back_cents[a] = 0;
        }
        p.plays += g.plays;
        p.plays_used += g.played;
        p.wins += g.wins;
        g.plays = 0;
        g.played = 0;
        g.wins = 0;
        g.session_key = Pubkey::default();
        Ok(())
    }

    // ------------------------------------------------------- ephemeral rollup

    /// Use one play and ask VRF for a fresh, fair prize layout.
    pub fn start_play(ctx: Context<RequestVrf>, client_seed: u8) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require_session(g, &ctx.accounts.signer.key())?;
        require!(g.phase == phase::IDLE, ClawError::WrongPhase);
        require!(g.plays > 0, ClawError::NoPlays);
        g.plays -= 1;
        g.played += 1;
        g.phase = phase::AWAIT_LAYOUT;
        g.started_at = Clock::get()?.unix_timestamp; // request time, until the layout lands
        g.nonce = g.nonce.wrapping_add(1);
        let nonce = g.nonce;
        request_vrf(&ctx, instruction::CallbackLayout::DISCRIMINATOR, client_seed, nonce)
    }

    pub fn callback_layout(ctx: Context<VrfCallback>, randomness: [u8; 32], nonce: u64) -> Result<()> {
        let g = &mut ctx.accounts.game;
        // Late or duplicate fulfilments are ignored, never double-applied.
        if g.phase != phase::AWAIT_LAYOUT || g.nonce != nonce {
            return Ok(());
        }
        g.layout = game::layout_from_randomness(&randomness);
        g.layout_seed = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
        g.claw_x = 500;
        g.started_at = Clock::get()?.unix_timestamp;
        g.phase = phase::AIM;
        Ok(())
    }

    /// Steer. Called many times a second on the rollup, at zero fee.
    pub fn move_claw(ctx: Context<MoveClaw>, x: u16) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require_session(g, &ctx.accounts.signer.key())?;
        require!(g.phase == phase::AIM, ClawError::WrongPhase);
        require!(Clock::get()?.unix_timestamp - g.started_at <= PLAY_SECONDS + 2, ClawError::TimeUp);
        g.claw_x = x.min(game::PIT);
        Ok(())
    }

    /// Drop the claw and ask VRF for the roll. After the timer anyone may force it.
    pub fn drop_claw(ctx: Context<RequestVrf>, client_seed: u8) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require!(g.phase == phase::AIM, ClawError::WrongPhase);
        let timed_out = Clock::get()?.unix_timestamp - g.started_at > PLAY_SECONDS;
        if !timed_out {
            require_session(g, &ctx.accounts.signer.key())?;
        }
        g.phase = phase::AWAIT_DROP;
        g.nonce = g.nonce.wrapping_add(1);
        let nonce = g.nonce;
        request_vrf(&ctx, instruction::CallbackDrop::DISCRIMINATOR, client_seed, nonce)
    }

    pub fn callback_drop(ctx: Context<VrfCallback>, randomness: [u8; 32], nonce: u64) -> Result<()> {
        let g = &mut ctx.accounts.game;
        if g.phase != phase::AWAIT_DROP || g.nonce != nonce {
            return Ok(());
        }
        let o = game::resolve_drop(&g.layout, g.claw_x, &randomness);
        if o.won {
            let prize = &game::PRIZES[o.prize_idx as usize];
            let a = prize.asset as usize;
            g.won_value_cents[a] += prize.value_cents;
            g.won_sell_back_cents[a] += prize.sell_back_cents;
            g.wins += 1;
        }
        g.last = LastDrop {
            won: o.won,
            stages_passed: o.stages_passed,
            prize_idx: o.prize_idx,
            claw_x: g.claw_x,
            aim_milli: o.aim_milli as u16,
            grip_milli: o.grip_milli as u16,
            roll_milli: o.roll_milli as u16,
            layout_seed: g.layout_seed,
            nonce,
        };
        g.phase = phase::IDLE;
        emit!(DropResolved { owner: g.owner, won: o.won, prize_idx: o.prize_idx, grip_milli: o.grip_milli as u16, roll_milli: o.roll_milli as u16 });
        Ok(())
    }

    /// Commit the Game to the base layer and hand it back (then call settle there).
    pub fn end_session(ctx: Context<EndSession>) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require_session(g, &ctx.accounts.payer.key())?;
        let age = Clock::get()?.unix_timestamp - g.started_at;
        match g.phase {
            phase::IDLE => {}
            // Walking away mid-play forfeits that play.
            phase::AIM => g.phase = phase::IDLE,
            // A VRF answer that never came: refund the play and invalidate the request.
            phase::AWAIT_LAYOUT | phase::AWAIT_DROP if age > VRF_STALE_SECONDS + PLAY_SECONDS => {
                g.plays += 1;
                g.played = g.played.saturating_sub(1);
                g.nonce = g.nonce.wrapping_add(1);
                g.phase = phase::IDLE;
            }
            _ => return err!(ClawError::WrongPhase),
        }
        ctx.accounts.game.exit(&crate::ID)?;
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.game.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

// ---------------------------------------------------------------- helpers

fn require_session(g: &Game, signer: &Pubkey) -> Result<()> {
    require!(*signer == g.owner || (g.session_key != Pubkey::default() && *signer == g.session_key), ClawError::NotYourGame);
    Ok(())
}

fn transfer_in<'info>(from: &Signer<'info>, vault: &AccountInfo<'info>, sys: &Program<'info, System>, cents: u64) -> Result<()> {
    system_program::transfer(
        CpiContext::new(sys.key(), system_program::Transfer { from: from.to_account_info(), to: vault.clone() }),
        cents.checked_mul(LAMPORTS_PER_CENT).ok_or(ClawError::Overflow)?,
    )
}

fn pay_out(vault: &AccountInfo, to: &AccountInfo, cents: u64) -> Result<()> {
    let lamports = cents.checked_mul(LAMPORTS_PER_CENT).ok_or(ClawError::Overflow)?;
    **vault.try_borrow_mut_lamports()? = vault.lamports().checked_sub(lamports).ok_or(ClawError::PoolEmpty)?;
    **to.try_borrow_mut_lamports()? += lamports;
    Ok(())
}

fn request_vrf(ctx: &Context<RequestVrf>, discriminator: &[u8], client_seed: u8, nonce: u64) -> Result<()> {
    let mut caller_seed = [client_seed; 32];
    caller_seed[..8].copy_from_slice(&nonce.to_le_bytes());
    let params = RequestRandomnessParams {
        payer: ctx.accounts.signer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: discriminator.to_vec(),
        caller_seed,
        accounts_metas: Some(vec![SerializableAccountMeta { pubkey: ctx.accounts.game.key(), is_signer: false, is_writable: true }]),
        callback_args: Some(nonce.to_le_bytes().to_vec()),
        ..Default::default()
    };
    let ix = create_request_randomness_ix_const(params, PROGRAM_IDENTITY);
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.signer.to_account_info(), &ix)?;
    Ok(())
}

// --------------------------------------------------------------- accounts

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub pool_cents: u64,
    pub total_savings_cents: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub owner: Pubkey,
    pub savings_cents: u64,
    pub plays: u32,
    pub progress_cents: u64,
    pub plays_used: u32,
    pub wins: u32,
    /// Indexed by game::Asset: SOL, BTC, USDC, NFT.
    pub holdings_cents: [u64; 4],
    pub sell_back_cents: [u64; 4],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct LastDrop {
    pub won: bool,
    pub stages_passed: u8,
    pub prize_idx: u8,
    pub claw_x: u16,
    pub aim_milli: u16,
    pub grip_milli: u16,
    pub roll_milli: u16,
    pub layout_seed: u64,
    pub nonce: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub owner: Pubkey,
    pub session_key: Pubkey,
    pub plays: u32,
    pub played: u32,
    pub wins: u32,
    pub phase: u8,
    pub nonce: u64,
    pub layout: [u8; 5],
    pub layout_seed: u64,
    pub claw_x: u16,
    pub started_at: i64,
    pub won_value_cents: [u64; 4],
    pub won_sell_back_cents: [u64; 4],
    pub last: LastDrop,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(init, payer = authority, space = 8 + Vault::INIT_SPACE, seeds = [VAULT_SEED], bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut, seeds = [VAULT_SEED], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub funder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitPlayer<'info> {
    #[account(init, payer = owner, space = 8 + Player::INIT_SPACE, seeds = [PLAYER_SEED, owner.key().as_ref()], bump)]
    pub player: Account<'info, Player>,
    #[account(init, payer = owner, space = 8 + Game::INIT_SPACE, seeds = [GAME_SEED, owner.key().as_ref()], bump)]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pay<'info> {
    #[account(mut, seeds = [PLAYER_SEED, owner.key().as_ref()], bump = player.bump, has_one = owner)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [VAULT_SEED], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    /// CHECK: any wallet the payment goes to
    #[account(mut)]
    pub merchant: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [PLAYER_SEED, owner.key().as_ref()], bump = player.bump, has_one = owner)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [VAULT_SEED], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut, seeds = [PLAYER_SEED, owner.key().as_ref()], bump = player.bump, has_one = owner)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [VAULT_SEED], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct LoadSession<'info> {
    #[account(mut, seeds = [PLAYER_SEED, owner.key().as_ref()], bump = player.bump, has_one = owner)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [GAME_SEED, owner.key().as_ref()], bump = game.bump, has_one = owner)]
    pub game: Account<'info, Game>,
    /// CHECK: the browser session key being registered; only receives a small top-up
    #[account(mut)]
    pub session: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateGame<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: the Game PDA being delegated
    #[account(mut, del, seeds = [GAME_SEED, owner.key().as_ref()], bump)]
    pub game: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut, seeds = [PLAYER_SEED, owner.key().as_ref()], bump = player.bump, has_one = owner)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [GAME_SEED, owner.key().as_ref()], bump = game.bump, has_one = owner)]
    pub game: Account<'info, Game>,
    pub owner: Signer<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestVrf<'info> {
    /// Owner or registered session key; pays the (fee-exempt on ER) VRF request.
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, game.owner.as_ref()], bump = game.bump)]
    pub game: Account<'info, Game>,
    /// CHECK: MagicBlock oracle queue (ephemeral queue on the rollup)
    #[account(mut, constraint =
        oracle_queue.key() == mb_vrf::consts::DEFAULT_EPHEMERAL_QUEUE ||
        oracle_queue.key() == mb_vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE ||
        oracle_queue.key() == mb_vrf::consts::DEFAULT_QUEUE ||
        oracle_queue.key() == mb_vrf::consts::DEFAULT_TEST_QUEUE @ ClawError::BadQueue)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct VrfCallback<'info> {
    /// Declared here (so the macro skips its runtime-derived version) with a compile-time address.
    #[account(address = VRF_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut)]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct MoveClaw<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, game.owner.as_ref()], bump = game.bump)]
    pub game: Account<'info, Game>,
}

#[commit]
#[derive(Accounts)]
pub struct EndSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, game.owner.as_ref()], bump = game.bump)]
    pub game: Account<'info, Game>,
}

// ----------------------------------------------------------------- events

#[event]
pub struct RoundUp {
    pub owner: Pubkey,
    pub amount_cents: u64,
    pub saved_cents: u64,
    pub plays: u32,
}

#[event]
pub struct DropResolved {
    pub owner: Pubkey,
    pub won: bool,
    pub prize_idx: u8,
    pub grip_milli: u16,
    pub roll_milli: u16,
}

#[error_code]
pub enum ClawError {
    #[msg("Amount must be positive and within your balance")]
    BadAmount,
    #[msg("Boost must be 0 to 3")]
    BadBoost,
    #[msg("Unknown asset")]
    BadAsset,
    #[msg("Nothing to sell")]
    NothingToSell,
    #[msg("Prize pool cannot cover this right now")]
    PoolEmpty,
    #[msg("Not your game")]
    NotYourGame,
    #[msg("Wrong game phase for this action")]
    WrongPhase,
    #[msg("No plays left")]
    NoPlays,
    #[msg("Time is up, drop the claw")]
    TimeUp,
    #[msg("Unsupported oracle queue")]
    BadQueue,
    #[msg("Arithmetic overflow")]
    Overflow,
}
