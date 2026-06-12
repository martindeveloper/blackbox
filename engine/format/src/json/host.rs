use serde::{Deserialize, Serialize};

use blackbox_engine::command::PlayerCommand;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum PlayerCommandWire {
    #[serde(rename = "choose")]
    Choose { choice_id: String },
    #[serde(rename = "continue")]
    Continue,
    #[serde(rename = "examine")]
    Examine { item_ref: String },
    #[serde(rename = "useItem")]
    UseItem {
        item_ref: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        action_id: Option<String>,
    },
}

pub(crate) fn command_from_wire(wire: PlayerCommandWire) -> PlayerCommand {
    match wire {
        PlayerCommandWire::Choose { choice_id } => PlayerCommand::Choose { choice_id },
        PlayerCommandWire::Continue => PlayerCommand::Continue,
        PlayerCommandWire::Examine { item_ref } => PlayerCommand::Examine { item_ref },
        PlayerCommandWire::UseItem {
            item_ref,
            action_id,
        } => PlayerCommand::UseItem {
            item_ref,
            action_id,
        },
    }
}
