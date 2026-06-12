use crate::content::{ChoiceContent, ChoiceGate};
use crate::error::EngineError;
use crate::expr::{self, ReadContext};
use crate::gate::{GateEval, evaluate_requirement_gate};
use crate::obsolete;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ChoiceGateResult {
    pub enabled: bool,
    /// True when `when`/`unless` fails without a contextual disabled reason —
    /// choice is omitted from the view entirely, matching text blocks.
    /// `requires` failures and contextual gates with reasons leave hidden = false.
    pub hidden: bool,
    pub disabled_reason: Option<String>,
}

fn when_failure_reason(gate: &ChoiceGate) -> Option<String> {
    if let Some(reason) = gate.when_disabled_reason.clone() {
        return Some(reason);
    }

    obsolete!(
        "gate-v2",
        "lone `when` gates should use `whenDisabledReason`; `disabledReason` was overloaded",
        legacy_disabled_reason_for_lone_when_gate(gate)
    )
}

fn unless_failure_reason(gate: &ChoiceGate) -> Option<String> {
    if let Some(reason) = gate.unless_disabled_reason.clone() {
        return Some(reason);
    }

    obsolete!(
        "gate-v2",
        "lone `unless` gates should use `unlessDisabledReason`; `disabledReason` was overloaded",
        legacy_disabled_reason_for_lone_unless_gate(gate)
    )
}

/// Pre–gate-v2 content paired `when` with `disabledReason` (no `whenDisabledReason`).
fn legacy_disabled_reason_for_lone_when_gate(gate: &ChoiceGate) -> Option<String> {
    if gate.requires.is_none() && gate.compiled_when.is_some() && gate.compiled_unless.is_none() {
        gate.disabled_reason.clone()
    } else {
        None
    }
}

/// Pre–gate-v2 content paired `unless` with `disabledReason` (no `unlessDisabledReason`).
fn legacy_disabled_reason_for_lone_unless_gate(gate: &ChoiceGate) -> Option<String> {
    if gate.requires.is_none() && gate.compiled_when.is_none() && gate.compiled_unless.is_some() {
        gate.disabled_reason.clone()
    } else {
        None
    }
}

pub(crate) fn evaluate_gate(
    state: &crate::state::GameState,
    choice: &ChoiceContent,
) -> Result<ChoiceGateResult, EngineError> {
    evaluate_choice_gate(state, &choice.gate)
}

pub(crate) fn evaluate_choice_gate(
    state: &crate::state::GameState,
    gate: &ChoiceGate,
) -> Result<ChoiceGateResult, EngineError> {
    let ctx = ReadContext { state };

    if let Some(requires) = &gate.requires
        && let GateEval::Fail { reason } =
            evaluate_requirement_gate(&ctx, requires, gate.disabled_reason.as_deref())?
    {
        return Ok(ChoiceGateResult {
            enabled: false,
            hidden: false,
            disabled_reason: reason,
        });
    }

    if let Some(when_expr) = &gate.compiled_when
        && !expr::evaluate_readonly_bool(&ctx, when_expr)?
    {
        if let Some(reason) = when_failure_reason(gate) {
            return Ok(ChoiceGateResult {
                enabled: false,
                hidden: false,
                disabled_reason: Some(reason),
            });
        }
        return Ok(ChoiceGateResult {
            enabled: false,
            hidden: true,
            disabled_reason: None,
        });
    }

    if let Some(unless_expr) = &gate.compiled_unless
        && expr::evaluate_readonly_bool(&ctx, unless_expr)?
    {
        if let Some(reason) = unless_failure_reason(gate) {
            return Ok(ChoiceGateResult {
                enabled: false,
                hidden: false,
                disabled_reason: Some(reason),
            });
        }
        return Ok(ChoiceGateResult {
            enabled: false,
            hidden: true,
            disabled_reason: None,
        });
    }

    Ok(ChoiceGateResult {
        enabled: true,
        hidden: false,
        disabled_reason: None,
    })
}

pub(crate) fn materialize_disabled_reason(gate: &ChoiceGateResult) -> Option<String> {
    if gate.enabled {
        return None;
    }
    gate.disabled_reason
        .clone()
        .or_else(|| Some("Choice is not available".to_string()))
}
