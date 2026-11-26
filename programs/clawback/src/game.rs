//! Claw rules, matching app/src/lib/game.ts in integer math.
//! Positions are 0..=1000 across the pit; probabilities are in "milli" (0..=1000).

pub const SLOTS: u16 = 5;
pub const PIT: u16 = 1000;
pub const SLOT_W: u16 = PIT / SLOTS; // 200
pub const MIN_AIM_FACTOR_MILLI: u64 = 350;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Asset {
    Sol = 0,
    Btc = 1,
    Usdc = 2,
    Nft = 3,
}

#[derive(Clone, Copy, Debug)]
pub struct PrizeType {
    pub asset: Asset,
    /// Value credited to the player's holdings, in cents.
    pub value_cents: u64,
    /// Instant buy-back price, in cents.
    pub sell_back_cents: u64,
    /// Win chance at a perfect aim, in milli.
    pub max_grip_milli: u64,
}

/// Same order and numbers as PRIZE_TYPES in the app.
pub const PRIZES: [PrizeType; 5] = [
    PrizeType { asset: Asset::Sol, value_cents: 25, sell_back_cents: 24, max_grip_milli: 600 },
    PrizeType { asset: Asset::Btc, value_cents: 100, sell_back_cents: 95, max_grip_milli: 350 },
    PrizeType { asset: Asset::Sol, value_cents: 500, sell_back_cents: 475, max_grip_milli: 120 },
    PrizeType { asset: Asset::Usdc, value_cents: 50, sell_back_cents: 50, max_grip_milli: 600 },
    PrizeType { asset: Asset::Nft, value_cents: 40, sell_back_cents: 40, max_grip_milli: 300 },
];

/// Fisher–Yates over prize indices, driven by 32 bytes of VRF randomness.
pub fn layout_from_randomness(r: &[u8; 32]) -> [u8; 5] {
    let mut out = [0u8, 1, 2, 3, 4];
    for i in (1..out.len()).rev() {
        let j = (r[i] as usize) % (i + 1);
        out.swap(i, j);
    }
    out
}

pub fn slot_under(x: u16) -> u16 {
    (x.min(PIT - 1)) / SLOT_W
}

/// 1000 when dead centre over a prize, 0 at the edge of its slot.
pub fn aim_milli(x: u16) -> u64 {
    let x = x.min(PIT) as i64;
    let slot = slot_under(x as u16) as i64;
    let centre = slot * SLOT_W as i64 + (SLOT_W as i64) / 2;
    let half = (SLOT_W as i64) / 2;
    let off = (x - centre).abs();
    (1000 - (off * 1000 / half)).max(0) as u64
}

pub fn grip_milli(prize: &PrizeType, aim: u64) -> u64 {
    prize.max_grip_milli * (MIN_AIM_FACTOR_MILLI + (1000 - MIN_AIM_FACTOR_MILLI) * aim / 1000) / 1000
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DropOutcome {
    pub won: bool,
    /// 0 grab, 1 lift, 2 chute; 3 when won.
    pub stages_passed: u8,
    pub roll_milli: u64,
    pub grip_milli: u64,
    pub aim_milli: u64,
    pub prize_idx: u8,
}

/// One roll decides the result, so the grip shown is the true win chance.
/// A loss picks the stage it fails at from how far the roll missed.
pub fn resolve_drop(layout: &[u8; 5], x: u16, randomness: &[u8; 32]) -> DropOutcome {
    let slot = slot_under(x) as usize;
    let prize_idx = layout[slot];
    let prize = &PRIZES[prize_idx as usize];
    let aim = aim_milli(x);
    let grip = grip_milli(prize, aim);
    // Roll in micro for resolution, from the first 8 bytes.
    let raw = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let roll_micro = raw % 1_000_000;
    let roll_milli = roll_micro / 1000;
    let won = roll_micro < grip * 1000;
    let stages_passed = if won {
        3
    } else {
        let span = (1_000_000 - grip * 1000).max(1);
        let miss = (roll_micro - grip * 1000) * 1000 / span; // 0..1000
        if miss > 550 {
            0
        } else if miss > 200 {
            1
        } else {
            2
        }
    };
    DropOutcome { won, stages_passed, roll_milli, grip_milli: grip, aim_milli: aim, prize_idx }
}

/// Change a payment rounds up to: next whole dollar, or a full dollar if exact.
pub fn round_up_cents(amount_cents: u64) -> u64 {
    let r = (100 - (amount_cents % 100)) % 100;
    if r == 0 {
        100
    } else {
        r
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aim_is_full_at_centre_and_zero_at_edges() {
        assert_eq!(aim_milli(100), 1000);
        assert_eq!(aim_milli(300), 1000);
        assert_eq!(aim_milli(0), 0);
        assert_eq!(aim_milli(150), 500);
        assert_eq!(aim_milli(1000), 0);
    }

    #[test]
    fn grip_matches_app_formula() {
        // BTC 35% at perfect aim, 35% * 0.35 at zero aim
        assert_eq!(grip_milli(&PRIZES[1], 1000), 350);
        assert_eq!(grip_milli(&PRIZES[1], 0), 122);
    }

    #[test]
    fn layout_is_a_permutation() {
        for seed in 0u8..=255 {
            let mut r = [0u8; 32];
            r.iter_mut().enumerate().for_each(|(i, b)| *b = seed.wrapping_mul(31).wrapping_add(i as u8 * 7));
            let mut l = layout_from_randomness(&r);
            l.sort();
            assert_eq!(l, [0, 1, 2, 3, 4]);
        }
    }

    #[test]
    fn roll_below_grip_wins() {
        let layout = [0, 1, 2, 3, 4];
        let mut r = [0u8; 32];
        // roll 0 always wins with any positive grip
        assert!(resolve_drop(&layout, 100, &r).won);
        // roll ~0.999 always loses, at the grab stage
        r[0..8].copy_from_slice(&999_999u64.to_le_bytes());
        let o = resolve_drop(&layout, 100, &r);
        assert!(!o.won);
        assert_eq!(o.stages_passed, 0);
    }

    #[test]
    fn round_up() {
        assert_eq!(round_up_cents(430), 70);
        assert_eq!(round_up_cents(500), 100);
        assert_eq!(round_up_cents(265), 35);
    }
}
