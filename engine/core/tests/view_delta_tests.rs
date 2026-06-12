mod support;

use blackbox::{
    PlayerCommand, encode_command_delta_json, encode_command_result_json,
    encode_view_revision_mismatch_json, encode_view_snapshot_json,
};

#[test]
fn damage_command_delta_contains_only_changed_view_fields() {
    let mut engine = support::load_full_scenario_engine();
    let previous = engine.get_current_view().unwrap();
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "touch_hazard".to_string(),
    });

    let encoded = encode_command_delta_json(&result, Some(&previous), 4, 5).unwrap();
    let wire: serde_json::Value = serde_json::from_str(&encoded).unwrap();
    let delta = wire["delta"].as_object().unwrap();

    // touch_hazard subtracts 2 HP and stays on the same node.
    // HP change causes stats and text to differ (hp is interpolated in text and
    // a conditional block appears at ≤ 8 HP). Events are not fired.
    assert_eq!(delta["player_stats"]["hp"].as_i64(), Some(8));
    assert!(
        delta.contains_key("text"),
        "text should be in delta (hp interpolation)"
    );
    assert!(
        !delta.contains_key("events"),
        "events should not be in delta"
    );
    assert!(
        !delta.contains_key("inventory"),
        "inventory should not be in delta"
    );
    assert!(!delta.contains_key("flags"), "flags should not be in delta");
}

#[test]
fn command_delta_is_smaller_than_full_command_snapshot() {
    let mut engine = support::load_full_scenario_engine();
    let previous = engine.get_current_view().unwrap();
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "touch_hazard".to_string(),
    });

    let full = encode_command_result_json(&result).unwrap();
    let delta = encode_command_delta_json(&result, Some(&previous), 0, 1).unwrap();

    assert!(
        delta.len() * 2 < full.len(),
        "expected delta ({}) to be less than half of full response ({})",
        delta.len(),
        full.len()
    );
}

#[test]
fn snapshot_and_revision_mismatch_envelopes_are_versioned() {
    let mut engine = support::load_full_scenario_engine();
    let view = engine.get_current_view().unwrap();
    let snapshot: serde_json::Value =
        serde_json::from_str(&encode_view_snapshot_json(&view, 9).unwrap()).unwrap();
    let mismatch: serde_json::Value =
        serde_json::from_str(&encode_view_revision_mismatch_json(9, 8).unwrap()).unwrap();

    assert_eq!(
        (
            snapshot["protocol"].as_u64(),
            snapshot["revision"].as_u64(),
            snapshot["view"]["node_id"].as_str(),
            mismatch["ok"].as_bool(),
            mismatch["error"]["type"].as_str(),
            mismatch["error"]["expected"].as_u64(),
            mismatch["error"]["received"].as_u64(),
        ),
        (
            Some(1),
            Some(9),
            Some("hub_intro"),
            Some(false),
            Some("viewRevisionMismatch"),
            Some(9),
            Some(8),
        )
    );
}
