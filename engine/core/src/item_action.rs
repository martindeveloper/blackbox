use crate::choice_gate::{ChoiceGateResult, evaluate_choice_gate};
use crate::content::{GameContent, ItemAction};
use crate::error::EngineError;
use crate::state::GameState;

pub(crate) fn evaluate_item_action(
    state: &GameState,
    content: &GameContent,
    item_ref: &str,
    action: &ItemAction,
) -> Result<ChoiceGateResult, EngineError> {
    let _ = content
        .items
        .get(item_ref)
        .ok_or_else(|| EngineError::UnknownItem(item_ref.to_string()))?;

    evaluate_choice_gate(state, &action.gate)
}

pub(crate) fn apply_item_consumption(state: &mut GameState, item_ref: &str) {
    if let Some(count) = state.inventory.items.get_mut(item_ref) {
        if *count > 1 {
            *count -= 1;
        } else {
            state.inventory.items.remove(item_ref);
        }
    }
}

pub(crate) fn ensure_item_owned(state: &GameState, item_ref: &str) -> Result<(), EngineError> {
    let count = state.inventory.items.get(item_ref).copied().unwrap_or(0);
    if count == 0 {
        return Err(EngineError::ItemNotOwned {
            item_ref: item_ref.to_string(),
        });
    }
    Ok(())
}
