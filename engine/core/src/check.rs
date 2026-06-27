use crate::content::{RollMode, SkillCheckContent, SkillCheckOutcome};
use crate::effect::{EffectSideEffects, apply_effect};
use crate::error::EngineError;
use crate::expr::{self, EvalContext};
use crate::rng::roll_skill_check;
use crate::roll_log::RollLog;
use crate::state::GameState;
use crate::transition::ChoiceResolution;
use crate::view::RollRecord;

/// Deterministic skill-check outcome for simulation and tests.
///
/// When set on [`crate::Engine`], the next choice with a check skips rolling
/// and applies the corresponding branch directly.
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
    let (_, success) = roll_skill_check(
        state,
        &check.stat,
        check.difficulty,
        Some(label),
        modifier,
        check.sides,
        check.roll_mode,
        rolls,
    );

    let outcome = if success {
        &check.on_success
    } else {
        &check.on_failure
    };

    apply_skill_outcome(state, outcome, rolls, side)
}

fn resolve_skill_check_override(
    state: &mut GameState,
    check: &SkillCheckContent,
    rolls: &mut RollLog,
    side: &mut EffectSideEffects,
    override_outcome: SkillCheckOverride,
) -> Result<ChoiceResolution, EngineError> {
    let outcome = match override_outcome {
        SkillCheckOverride::ForceSuccess => &check.on_success,
        SkillCheckOverride::ForceFailure => &check.on_failure,
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
        difficulty: check.difficulty,
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
