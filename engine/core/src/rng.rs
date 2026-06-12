use crate::content::RollMode;
use crate::roll_log::RollLog;
use crate::state::GameState;
use crate::view::RollRecord;

pub const DEFAULT_RANDOM_SEED: u64 = 0xDEAD_BEEF_CAFE_BABE;

pub const DEFAULT_DIE_SIDES: u32 = 20;

pub fn next_raw(state: &mut GameState) -> u64 {
    state.random_counter = state.random_counter.wrapping_add(1);
    let mut x = state
        .random_seed
        .wrapping_add(state.random_counter.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    x.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

fn roll_offset(state: &mut GameState, span: u64) -> i32 {
    if span == 0 {
        0
    } else {
        (next_raw(state) % span) as i32
    }
}

pub fn roll_inclusive(
    state: &mut GameState,
    min: i32,
    max: i32,
    label: Option<String>,
    rolls: &mut RollLog,
) -> i32 {
    let (min, max) = if min <= max { (min, max) } else { (max, min) };
    let span = (max - min + 1) as u64;
    let value = min + roll_offset(state, span);
    rolls.push(RollRecord::Random {
        label,
        sides: Some((max - min + 1) as u32),
        roll: value,
        modifier: 0,
        total: value,
    });
    value
}

pub fn roll_die(
    state: &mut GameState,
    sides: u32,
    label: Option<String>,
    rolls: &mut RollLog,
) -> i32 {
    let sides = sides.max(1);
    let value = 1 + roll_offset(state, sides as u64);
    rolls.push(RollRecord::Roll {
        label,
        sides: Some(sides),
        roll: value,
        modifier: 0,
        total: value,
    });
    value
}

pub fn roll_dice_expr(
    state: &mut GameState,
    sides: u32,
    label: Option<String>,
    rolls: &mut RollLog,
) -> i32 {
    let sides = sides.max(1);
    let value = 1 + roll_offset(state, sides as u64);
    rolls.push(RollRecord::Dice {
        label,
        sides: Some(sides),
        roll: value,
        modifier: 0,
        total: value,
    });
    value
}

pub fn roll_skill_check(
    state: &mut GameState,
    stat: &str,
    difficulty: i32,
    label: Option<String>,
    modifier: i32,
    roll_mode: RollMode,
    rolls: &mut RollLog,
) -> (i32, bool) {
    let sides = DEFAULT_DIE_SIDES.max(1) as u64;
    let roll = match roll_mode {
        RollMode::Normal => 1 + roll_offset(state, sides),
        RollMode::Advantage => {
            let a = 1 + roll_offset(state, sides);
            let b = 1 + roll_offset(state, sides);
            a.max(b)
        }
        RollMode::Disadvantage => {
            let a = 1 + roll_offset(state, sides);
            let b = 1 + roll_offset(state, sides);
            a.min(b)
        }
    };
    let total = roll + modifier;
    let success = total >= difficulty;
    rolls.push(RollRecord::SkillCheck {
        label,
        stat: stat.to_string(),
        difficulty,
        roll,
        modifier,
        total,
        success,
        roll_mode,
    });
    (total, success)
}
