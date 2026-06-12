#[path = "support.rs"]
mod support;

use blackbox::PlayerCommand;
use blackbox::encode_view_json;

fn guide_in_hub_dialogue() -> blackbox::GameView {
    let mut engine = support::load_scenario_engine(support::SCENARIO);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "ask_guide".to_string(),
    });
    assert!(result.ok, "ask_guide should succeed");
    let view = engine.get_current_view().unwrap();
    assert_eq!(view.node_id, "hub_dialogue");
    view
}

#[test]
fn character_subtitle_surfaces_in_view() {
    let view = guide_in_hub_dialogue();

    let guide = view
        .characters
        .iter()
        .find(|character| character.ref_id == "guide_npc")
        .expect("guide_npc should appear in scene characters");

    assert_eq!(guide.name, "GUIDE");
    assert_eq!(
        guide.subtitle.as_deref(),
        Some("Test NPC"),
        "subtitle from characters.json should pass through CharacterView"
    );
}

#[test]
fn character_subtitle_serializes_in_view_json_when_present() {
    let view = guide_in_hub_dialogue();
    let json = encode_view_json(&view).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

    let guide = parsed["characters"]
        .as_array()
        .expect("characters array")
        .iter()
        .find(|entry| entry["ref_id"] == "guide_npc")
        .expect("guide_npc in serialized view");

    assert_eq!(
        guide["subtitle"].as_str(),
        Some("Test NPC"),
        "view JSON should include subtitle when defined on the character"
    );
}

#[test]
fn character_subtitle_omitted_from_view_json_when_absent() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    {
                        "kind": "dialogue",
                        "speaker": "npc",
                        "text": "\"Status.\""
                    }
                ],
                "choices": []
            }
        }
    }"#;

    let characters = support::characters_json(
        r#"
        "characters": {
            "npc": {
                "id": "npc",
                "name": "NPC"
            }
        }
    "#,
    );

    let mut engine = support::load_engine_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        &characters,
        support::MINIMAL_ASSETS,
    );
    let view = engine.get_current_view().unwrap();

    let npc = view
        .characters
        .iter()
        .find(|character| character.ref_id == "npc")
        .expect("npc in scene");
    assert_eq!(npc.subtitle, None);

    let json = encode_view_json(&view).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    let npc_json = parsed["characters"]
        .as_array()
        .expect("characters array")
        .iter()
        .find(|entry| entry["ref_id"] == "npc")
        .expect("npc in serialized view");

    assert!(
        npc_json.get("subtitle").is_none(),
        "view JSON should omit subtitle when the character has none"
    );
}
