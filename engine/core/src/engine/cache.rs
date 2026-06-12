use crate::choice_gate::{evaluate_gate, materialize_disabled_reason};
use crate::error::EngineError;
use crate::item_action::evaluate_item_action;

use super::Engine;

#[derive(Debug, Clone)]
pub(super) struct ItemActionGateEntry {
    pub item_ref: String,
    pub action_id: String,
    pub label: String,
    pub enabled: bool,
    pub disabled_reason: Option<String>,
}

impl Engine {
    pub(super) fn clear_gate_caches(&mut self) {
        self.gate_cache.clear();
        self.item_action_cache.clear();
    }

    pub(super) fn ensure_gate_cache_for_id(&mut self, node_id: &str) -> Result<(), EngineError> {
        let choice_count = self.require_node(node_id)?.choices.len();
        if self.gate_cache.len() != choice_count {
            self.repopulate_gate_cache(node_id)?;
        }
        Ok(())
    }

    pub(super) fn ensure_item_action_cache(&mut self) -> Result<(), EngineError> {
        let expected = self.expected_item_action_count();
        if self.item_action_cache.len() != expected {
            self.repopulate_item_action_cache()?;
        }
        Ok(())
    }

    pub(super) fn refresh_caches_for_node(&mut self, node_id: &str) -> Result<(), EngineError> {
        self.repopulate_gate_cache(node_id)?;
        self.repopulate_item_action_cache()?;
        Ok(())
    }

    fn expected_item_action_count(&self) -> usize {
        self.state
            .inventory
            .items
            .iter()
            .filter(|(_, count)| **count > 0)
            .filter_map(|(item_ref, _)| {
                self.content
                    .items
                    .get(item_ref)
                    .map(|item| item.actions.len())
            })
            .sum()
    }

    fn repopulate_gate_cache(&mut self, node_id: &str) -> Result<(), EngineError> {
        let choice_count = self.require_node(node_id)?.choices.len();
        self.gate_cache.clear();
        self.gate_cache.reserve(choice_count);
        for index in 0..choice_count {
            let choice = &self.require_node(node_id)?.choices[index];
            self.gate_cache.push(evaluate_gate(&self.state, choice)?);
        }
        Ok(())
    }

    fn repopulate_item_action_cache(&mut self) -> Result<(), EngineError> {
        self.item_action_cache.clear();
        for (item_ref, count) in &self.state.inventory.items {
            if *count == 0 {
                continue;
            }
            let Some(item) = self.content.items.get(item_ref) else {
                continue;
            };
            for action in &item.actions {
                let gate = evaluate_item_action(&self.state, &self.content, item_ref, action)?;
                let disabled_reason = if gate.enabled {
                    None
                } else {
                    materialize_disabled_reason(&gate)
                        .or_else(|| Some("Action is not available".to_string()))
                };
                self.item_action_cache.push(ItemActionGateEntry {
                    item_ref: item_ref.clone(),
                    action_id: action.id.clone(),
                    label: action.label.clone(),
                    enabled: gate.enabled,
                    disabled_reason,
                });
            }
        }
        self.item_action_cache.sort_by(|left, right| {
            left.item_ref
                .cmp(&right.item_ref)
                .then_with(|| left.action_id.cmp(&right.action_id))
        });
        Ok(())
    }
}
