use crate::content::{
    RollMode, SkillCheckContent, SkillCheckOutcome, SkillCheckResolution, SkillCheckTier,
};
use crate::effect::{EffectSideEffects, apply_effect};
use crate::error::EngineError;
use crate::expr::{self, EvalContext};
use crate::rng::{SkillCheckRoll, roll_check_die, roll_skill_check};
use crate::roll_log::RollLog;
use crate::state::GameState;
use crate::transition::ChoiceResolution;
use crate::view::RollRecord;

/// Deterministic skill-check outcome for simulation and tests.
///
/// When set on [`crate::Engine`], the next choice with a check skips rolling
/// and applies the corresponding branch directly. For tiered checks,
/// `ForceSuccess` resolves to the best tier and `ForceFailure` to the
/// catch-all tier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SkillCheckOverride {
    ForceSuccess,
    ForceFailure,
    ForceExhausted,
}

/// `choice_id` is the presentation id of the choice that owns this check.
/// Combined with `state.current_node_id` it forms the attempt-tracking key.
pub fn resolve_skill_check(
    state: &mut GameState,
    choice_id: &str,
    check: &SkillCheckContent,
    rolls: &mut RollLog,
    side: &mut EffectSideEffects,
    override_outcome: Option<SkillCheckOverride>,
) -> Result<ChoiceResolution, EngineError> {
    if let Some(override_outcome) = override_outcome {
        return resolve_skill_check_override(state, check, rolls, side, override_outcome);
    }

    if let Some(max) = check.max_attempts {
        let key = format!("{}:{}", state.current_node_id, choice_id);
        let attempts_used = state.choice_attempts.get(&key).copied().unwrap_or(0);
        if attempts_used >= max {
            let exhausted = check.on_exhausted.as_ref().expect(
                "maxAttempts set but onExhausted missing (should have been caught by validation)",
            );
            return apply_skill_outcome(state, exhausted, rolls, side);
        }
        *state.choice_attempts.entry(key).or_insert(0) += 1;
    }

    let stat_bonus = *state.player.stats.get(&check.stat).unwrap_or(&0);
    let extra_modifier = if let Some(expr) = &check.compiled_modifier {
        let mut ctx = EvalContext { state, rolls };
        expr::evaluate_i32(&mut ctx, expr)?
    } else {
        0
    };

    let modifier = stat_bonus + extra_modifier;
    let label = check
        .label
        .clone()
        .unwrap_or_else(|| format!("{} check", check.stat));

    match &check.resolution {
        SkillCheckResolution::Binary {
            difficulty,
            on_success,
            on_failure,
        } => {
            let (_, success) = roll_skill_check(
                state,
                SkillCheckRoll {
                    stat: &check.stat,
                    difficulty: *difficulty,
                    label: Some(label),
                    modifier,
                    sides: check.sides,
                    roll_mode: check.roll_mode,
                },
                rolls,
            );

            let outcome = if success { on_success } else { on_failure };
            apply_skill_outcome(state, outcome, rolls, side)
        }
        SkillCheckResolution::Tiered { tiers } => {
            let sides = check.sides.max(1);
            let roll = roll_check_die(state, sides, check.roll_mode);
            let total = roll + modifier;
            let tier = match_tier(tiers, total);
            rolls.push(RollRecord::SkillCheck {
                label: Some(label),
                stat: check.stat.clone(),
                difficulty: None,
                tier: Some(tier_display_name(tiers, tier)),
                sides: Some(sides),
                roll,
                modifier,
                total,
                success: tier.counts_as_success(),
                roll_mode: check.roll_mode,
            });
            apply_skill_outcome(state, &tier.outcome, rolls, side)
        }
    }
}

/// First tier (author order, best-first) whose `min` the total meets; the final
/// catch-all (no `min`) always matches. Validation guarantees the shape.
fn match_tier(tiers: &[SkillCheckTier], total: i32) -> &SkillCheckTier {
    tiers
        .iter()
        .find(|tier| tier.min.is_none_or(|min| total >= min))
        .expect("tiered check has a catch-all tier (enforced by validation)")
}

fn tier_display_name(tiers: &[SkillCheckTier], tier: &SkillCheckTier) -> String {
    if let Some(label) = &tier.label {
        return label.clone();
    }
    let index = tiers
        .iter()
        .position(|candidate| std::ptr::eq(candidate, tier))
        .unwrap_or(0);
    format!("tier {index}")
}

fn resolve_skill_check_override(
    state: &mut GameState,
    check: &SkillCheckContent,
    rolls: &mut RollLog,
    side: &mut EffectSideEffects,
    override_outcome: SkillCheckOverride,
) -> Result<ChoiceResolution, EngineError> {
    let outcome = match override_outcome {
        SkillCheckOverride::ForceSuccess => match &check.resolution {
            SkillCheckResolution::Binary { on_success, .. } => on_success,
            SkillCheckResolution::Tiered { tiers } => {
                &tiers.first().expect("tiers non-empty").outcome
            }
        },
        SkillCheckOverride::ForceFailure => match &check.resolution {
            SkillCheckResolution::Binary { on_failure, .. } => on_failure,
            SkillCheckResolution::Tiered { tiers } => {
                &tiers.last().expect("tiers non-empty").outcome
            }
        },
        SkillCheckOverride::ForceExhausted => check.on_exhausted.as_ref().ok_or_else(|| {
            EngineError::ValidationError(
                "skill check override ForceExhausted requires maxAttempts and onExhausted"
                    .to_string(),
            )
        })?,
    };

    record_forced_skill_check(check, override_outcome, rolls);
    apply_skill_outcome(state, outcome, rolls, side)
}

fn record_forced_skill_check(
    check: &SkillCheckContent,
    override_outcome: SkillCheckOverride,
    rolls: &mut RollLog,
) {
    let label = check
        .label
        .clone()
        .unwrap_or_else(|| format!("{} check (forced)", check.stat));
    let sides = check.sides.max(1);
    let (success, roll) = match override_outcome {
        SkillCheckOverride::ForceSuccess => (true, sides as i32),
        SkillCheckOverride::ForceFailure => (false, 1),
        SkillCheckOverride::ForceExhausted => (false, 0),
    };
    rolls.push(RollRecord::SkillCheck {
        label: Some(label),
        stat: check.stat.clone(),
        difficulty: check.difficulty(),
        tier: None,
        sides: Some(sides),
        roll,
        modifier: 0,
        total: roll,
        success,
        roll_mode: RollMode::Normal,
    });
}

fn apply_skill_outcome(
    state: &mut GameState,
    outcome: &SkillCheckOutcome,
    rolls: &mut RollLog,
    side: &mut EffectSideEffects,
) -> Result<ChoiceResolution, EngineError> {
    for effect in &outcome.effects {
        apply_effect(state, effect, rolls, side)?;
    }

    Ok(outcome.resolution())
}
