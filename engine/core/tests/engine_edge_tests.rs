#[path = "support.rs"]
mod support;

use blackbox::validation::validate_content;
use blackbox::{EngineError, PlayerCommand, StateCodec};
use blackbox_format::JsonFormat;

const FORMAT: JsonFormat = JsonFormat;

#[test]
fn stat_gte_requirement_gates_choice() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "force",
                        "label": "Force the door.",
                        "requires": [{ "type": "statGte", "stat": "violence", "value": 2 }],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "force").unwrap();
    assert!(!choice.enabled);
}

#[test]
fn stat_lte_requirement_gates_choice() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "whisper",
                        "label": "Whisper.",
                        "requires": [{ "type": "statLte", "stat": "violence", "value": 0 }],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "whisper").unwrap();
    assert!(!choice.enabled);
}

#[test]
fn stat_eq_requirement_gates_choice() {
    let enabled = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "exact",
                        "label": "Exact logic.",
                        "requires": [{ "type": "statEq", "stat": "logic", "value": 3 }],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(enabled);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "exact").unwrap();
    assert!(choice.enabled);

    let disabled = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "exact",
                        "label": "Exact logic.",
                        "requires": [{ "type": "statEq", "stat": "logic", "value": 10 }],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(disabled);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "exact").unwrap();
    assert!(!choice.enabled);
}

#[test]
fn visited_requirement_gates_choice() {
    let scenario = r#"{
        "startNodeId": "hub",
        "nodes": {
            "hub": {
                "id": "hub",
                "choices": [
                    {
                        "id": "go",
                        "label": "Scout ahead.",
                        "goto": "other"
                    },
                    {
                        "id": "secret",
                        "label": "Use the side passage.",
                        "requires": [{ "type": "visited", "nodeId": "other" }],
                        "goto": "win"
                    }
                ]
            },
            "other": {
                "id": "other",
                "choices": [
                    {
                        "id": "back",
                        "label": "Return.",
                        "goto": "hub"
                    }
                ]
            },
            "win": { "id": "win", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let locked = engine.get_current_view().unwrap();
    let secret = locked.choices.iter().find(|c| c.id == "secret").unwrap();
    assert!(!secret.enabled);

    for choice_id in ["go", "back"] {
        let result = engine.submit_command(PlayerCommand::Choose {
            choice_id: choice_id.to_string(),
        });
        assert!(result.ok, "{choice_id}: {:?}", result.error);
    }

    let unlocked = engine.get_current_view().unwrap();
    let secret = unlocked.choices.iter().find(|c| c.id == "secret").unwrap();
    assert!(secret.enabled);
}

#[test]
fn has_flag_value_requirement_gates_choice() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "stealth",
                        "label": "Sneak through.",
                        "requires": [
                            { "type": "hasFlag", "flag": "mode", "value": "stealth" }
                        ],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let locked = engine.get_current_view().unwrap();
    let choice = locked.choices.iter().find(|c| c.id == "stealth").unwrap();
    assert!(!choice.enabled);

    let unlocked = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "mode", "value": "stealth" }],
                "choices": [
                    {
                        "id": "stealth",
                        "label": "Sneak through.",
                        "requires": [
                            { "type": "hasFlag", "flag": "mode", "value": "stealth" }
                        ],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(unlocked);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "stealth").unwrap();
    assert!(choice.enabled);
}

#[test]
fn auto_disabled_reason_for_structured_requirement() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "need_card",
                        "label": "Swipe card.",
                        "requires": [
                            { "type": "hasItem", "itemId": "access_card", "count": 1 }
                        ],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "need_card").unwrap();

    assert!(!choice.enabled);
    assert_eq!(
        choice.disabled_reason.as_deref(),
        Some("Requires item: access_card ×1")
    );
}

#[test]
fn add_event_stores_event_id() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "note",
                        "label": "Record event.",
                        "effects": [
                            {
                                "type": "addEvent",
                                "eventId": "stat_noted"
                            }
                        ],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "note".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    assert!(
        result
            .view
            .unwrap()
            .events
            .iter()
            .any(|event| event == "stat_noted")
    );
}

#[test]
fn rejects_duplicate_choice_id() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "dup",
                        "label": "One",
                        "goto": "next"
                    },
                    {
                        "id": "dup",
                        "label": "Two",
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut content = FORMAT
        .decode_bundle_str(
            &support::scenario_json(json),
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            support::MINIMAL_ASSETS,
        )
        .unwrap();
    let error = validate_content(&mut content).unwrap_err();
    assert!(
        matches!(&error, EngineError::ValidationError(message) if message.contains("duplicate choice id")),
        "unexpected error: {error:?}"
    );
}

#[test]
fn rejects_missing_default_choice_sfx() {
    let assets = r#"{
        "defaultChoiceSfx": "missing_click",
        "music": {},
        "sfx": {},
        "textures": {}
    }"#;
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "go",
                        "label": "Go",
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let assets = support::assets_json(assets);
    let mut content = FORMAT
        .decode_bundle_str(
            &support::scenario_json(json),
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            &assets,
        )
        .unwrap();
    let error = validate_content(&mut content).unwrap_err();
    assert!(matches!(
        error,
        EngineError::ValidationError(message) if message.contains("default choice sfx")
    ));
}

#[test]
fn rejects_missing_per_choice_sfx() {
    let assets = r#"{
        "sfx": { "click": { "src": "sfx/click.wav" } },
        "music": {},
        "textures": {}
    }"#;
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "go",
                        "label": "Go",
                        "sfx": "missing_click",
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let assets = support::assets_json(assets);
    let mut content = FORMAT
        .decode_bundle_str(
            &support::scenario_json(json),
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            &assets,
        )
        .unwrap();
    let error = validate_content(&mut content).unwrap_err();
    assert!(matches!(
        error,
        EngineError::ValidationError(message) if message.contains("missing sfx")
    ));
}

#[test]
fn rejects_node_key_id_mismatch() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "wrong_id",
                "choices": []
            }
        }
    }"#;

    let mut content = FORMAT
        .decode_bundle_str(
            &support::scenario_json(json),
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            support::MINIMAL_ASSETS,
        )
        .unwrap();
    let error = validate_content(&mut content).unwrap_err();
    assert!(
        matches!(&error, EngineError::ValidationError(message) if message.contains("does not match node id")),
        "unexpected error: {error:?}"
    );
}

#[test]
fn rejects_empty_choice_id() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "",
                        "label": "Bad",
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut content = FORMAT
        .decode_bundle_str(
            &support::scenario_json(json),
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            support::MINIMAL_ASSETS,
        )
        .unwrap();
    let error = validate_content(&mut content).unwrap_err();
    assert!(
        matches!(&error, EngineError::ValidationError(message) if message.contains("choice id must not be empty")),
        "unexpected error: {error:?}"
    );
}

#[test]
fn rejects_effect_with_literal_and_expression() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "bad",
                        "label": "Bad effect.",
                        "effects": [
                            {
                                "type": "setFlag",
                                "flag": "x",
                                "value": true,
                                "valueExpr": "1"
                            }
                        ],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "bad".to_string(),
    });

    assert!(!result.ok);
    assert!(matches!(
        result.error,
        Some(EngineError::ValidationError(message)) if message.contains("cannot set both literal and expression")
    ));
}

#[test]
fn content_decode_error_on_invalid_json() {
    let error = FORMAT
        .decode_bundle_str(
            "{ not json",
            support::ITEMS,
            support::CHARACTERS,
            support::ASSETS,
        )
        .unwrap_err();
    assert!(matches!(error, EngineError::ContentDecodeError { .. }));
}

#[test]
fn state_decode_error_on_invalid_json() {
    let error = FORMAT.decode_state(b"{ not json").unwrap_err();
    assert!(matches!(error, EngineError::StateDecodeError { .. }));
}

#[test]
fn state_encode_round_trip_stays_valid_json() {
    let engine = support::load_engine(
        r#"{
            "startNodeId": "start",
            "nodes": { "start": { "id": "start", "choices": [] } }
        }"#,
    );

    let encoded = FORMAT.encode_state(engine.get_state()).unwrap();
    let decoded = FORMAT.decode_state(&encoded).unwrap();
    assert_eq!(decoded.current_node_id, "start");
}
