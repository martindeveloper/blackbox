#[path = "support.rs"]
mod support;

use blackbox::PlayerCommand;

#[test]
fn unless_hides_text_block_when_condition_passes() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    { "kind": "paragraph", "text": "Always." },
                    {
                        "kind": "paragraph",
                        "text": "Hidden when armed.",
                        "unless": { "type": "hasItem", "itemId": "key", "count": 1 }
                    }
                ],
                "choices": [
                    {
                        "id": "arm",
                        "label": "Take key.",
                        "effects": [{ "type": "addItem", "itemId": "key", "count": 1 }],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(json);
    assert_eq!(engine.get_current_view().unwrap().text.len(), 2);

    engine
        .submit_command(PlayerCommand::Choose {
            choice_id: "arm".to_string(),
        })
        .view
        .expect("command should succeed");

    assert_eq!(engine.get_current_view().unwrap().text.len(), 1);
}

#[test]
fn when_array_hides_choice_when_any_condition_fails() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "secret",
                        "label": "Open.",
                        "when": [
                            { "type": "hasFlag", "flag": "trusted" },
                            { "type": "statGte", "stat": "logic", "value": 3 }
                        ],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let found = engine
        .get_current_view()
        .unwrap()
        .choices
        .into_iter()
        .any(|c| c.id == "secret");
    assert!(
        !found,
        "choice with failing `when` should be absent from view"
    );
}

#[test]
fn nested_any_gate_enables_choice() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "trusted", "value": true }],
                "choices": [
                    {
                        "id": "secret",
                        "label": "Open.",
                        "when": {
                            "type": "any",
                            "conditions": [
                                { "type": "statGte", "stat": "logic", "value": 10 },
                                { "type": "hasFlag", "flag": "trusted" }
                            ]
                        },
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let choice = engine
        .get_current_view()
        .unwrap()
        .choices
        .into_iter()
        .find(|c| c.id == "secret")
        .unwrap();
    assert!(choice.enabled);
}

#[test]
fn unless_hides_choice_when_condition_passes() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "addItem", "itemId": "key", "count": 1 }],
                "choices": [
                    {
                        "id": "pick",
                        "label": "Pick lock.",
                        "unless": { "type": "hasItem", "itemId": "key", "count": 1 },
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let found = engine
        .get_current_view()
        .unwrap()
        .choices
        .into_iter()
        .any(|c| c.id == "pick");
    assert!(
        !found,
        "choice with passing `unless` should be absent from view"
    );
}

#[test]
fn text_block_else_shows_alternate_when_gate_fails() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    {
                        "kind": "paragraph",
                        "text": "With the fragment.",
                        "else": "Without the fragment.",
                        "when": { "type": "hasItem", "itemId": "lullaby", "count": 1 }
                    }
                ],
                "choices": []
            }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let view = engine.get_current_view().unwrap();
    assert_eq!(view.text.len(), 1);
    assert_eq!(view.text[0].text, "Without the fragment.");
}

#[test]
fn requires_any_enables_choice_when_one_branch_passes() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "ari_released", "value": true }],
                "choices": [
                    {
                        "id": "callback",
                        "label": "Remember.",
                        "requires": {
                            "type": "any",
                            "conditions": [
                                { "type": "hasFlag", "flag": "ari_released" },
                                { "type": "hasFlag", "flag": "grace_chose" }
                            ]
                        },
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let choice = engine
        .get_current_view()
        .unwrap()
        .choices
        .into_iter()
        .find(|c| c.id == "callback")
        .unwrap();
    assert!(choice.enabled);
}

#[test]
fn per_condition_disabled_reason_reports_first_failure() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "stay",
                        "label": "Stay.",
                        "requires": [
                            {
                                "type": "hasItem",
                                "itemId": "facility_override_key",
                                "count": 1,
                                "disabledReason": "You need the facility override key."
                            },
                            {
                                "type": "statGte",
                                "stat": "empathy",
                                "value": 3,
                                "disabledReason": "You need more empathy to choose to remain."
                            }
                        ],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let choice = engine
        .get_current_view()
        .unwrap()
        .choices
        .into_iter()
        .find(|c| c.id == "stay")
        .unwrap();
    assert!(!choice.enabled);
    assert_eq!(
        choice.disabled_reason.as_deref(),
        Some("You need the facility override key.")
    );
}

#[test]
fn when_with_disabled_reason_shows_locked_choice() {
    // obsolete!(gate-v2): lone `when` + `disabledReason` (see choice_gate.rs).
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "press",
                        "label": "Ask.",
                        "when": { "type": "statGte", "stat": "conviction", "value": 3 },
                        "disabledReason": "Something in you is not ready to ask this yet.",
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let choice = engine
        .get_current_view()
        .unwrap()
        .choices
        .into_iter()
        .find(|c| c.id == "press")
        .unwrap();
    assert!(!choice.enabled);
    assert_eq!(
        choice.disabled_reason.as_deref(),
        Some("Something in you is not ready to ask this yet.")
    );
}
