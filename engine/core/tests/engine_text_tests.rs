#[path = "support.rs"]
mod support;

use blackbox::PlayerCommand;
use blackbox::content::DialogueSide;

#[test]
fn interpolates_text_in_view() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    {
                        "kind": "paragraph",
                        "text": "HP {stat.hp}/{stat.max_hp}."
                    }
                ],
                "choices": [
                    { "id": "continue", "label": "Continue.", "goto": "start" }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let view = engine.get_current_view().unwrap();
    assert_eq!(view.text[0].text, "HP 10/10.");
}

#[test]
fn conditional_text_blocks_filter_by_state() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    { "kind": "paragraph", "text": "Always." },
                    {
                        "kind": "paragraph",
                        "text": "Low HP.",
                        "when": { "type": "statLte", "stat": "hp", "value": 5 }
                    }
                ],
                "choices": [
                    {
                        "id": "hurt",
                        "label": "Hurt.",
                        "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -6 }],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(json);
    assert_eq!(engine.get_current_view().unwrap().text.len(), 1);

    engine
        .submit_command(PlayerCommand::Choose {
            choice_id: "hurt".to_string(),
        })
        .view
        .expect("command should succeed");

    let view = engine.get_current_view().unwrap();
    assert_eq!(view.text.len(), 2);
    assert_eq!(view.text[1].text, "Low HP.");
}

#[test]
fn dialogue_model_surfaces_in_view() {
    let json = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    {
                        "kind": "dialogue",
                        "speaker": "SYNTHETIC",
                        "emotion": "cold",
                        "side": "left",
                        "text": "\"Status report.\""
                    },
                    {
                        "kind": "thought",
                        "speaker": "YOU",
                        "text": "It sounds almost human."
                    }
                ],
                "choices": [
                    { "id": "continue", "label": "Continue.", "goto": "start" }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(json);
    let view = engine.get_current_view().unwrap();

    assert_eq!(view.text[0].kind, "dialogue");
    assert_eq!(view.text[0].speaker.as_deref(), Some("SYNTHETIC"));
    assert_eq!(view.text[0].emotion.as_deref(), Some("cold"));
    assert_eq!(view.text[0].side, Some(DialogueSide::Left));
    assert_eq!(view.text[1].kind, "thought");
    assert_eq!(view.text[1].speaker.as_deref(), Some("YOU"));
}
