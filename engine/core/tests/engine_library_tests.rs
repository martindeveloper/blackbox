#[path = "support.rs"]
mod support;

use blackbox::{Engine, content::NodeMode};
use blackbox_format::decode_scenario_bundle_json;

const LIBRARY: &str = r#"{
    "spec": "com.blackbox.library",
    "formatVersion": 1,
    "snippets": {
        "hud_vitals": {
            "kind": "stage_direction",
            "text": "HP: {stat.hp}/{stat.max_hp}."
        },
        "hud_parameterized": {
            "kind": "stage_direction",
            "text": "HP: {stat.hp}/{stat.max_hp}. {param.extra}"
        }
    },
    "templates": {
        "game_over_tpl": {
            "title": "Signal Lost",
            "mode": "game_over",
            "onEnter": [{ "type": "stopMusic" }],
            "text": ["@hud_vitals"],
            "choices": [
                {
                    "id": "restart",
                    "label": "Restart.",
                    "action": { "type": "restartGame", "startNodeId": "intro" }
                }
            ]
        }
    },
    "conditions": {
        "low_hp": {
            "type": "statLte",
            "stat": "hp",
            "value": 3
        },
        "is_wounded": {
            "type": "not",
            "condition": { "type": "condition", "id": "low_hp" }
        }
    }
}"#;

const CHAPTER: &str = r#"{
    "spec": "com.blackbox.chapter",
    "formatVersion": 1,
    "id": "test",
    "title": "Test",
    "startNodeId": "intro",
    "nodes": {
        "intro": {
            "id": "intro",
            "text": [
                "@hud_vitals",
                { "kind": "paragraph", "text": "Hello." },
                {
                    "kind": "paragraph",
                    "text": "Low HP warning.",
                    "when": { "type": "condition", "id": "low_hp" }
                },
                {
                    "kind": "dialogue",
                    "speaker": "ally",
                    "actor": "ally",
                    "text": "Ally speaks."
                }
            ],
            "choices": [
                { "id": "continue", "label": "Continue.", "goto": "intro" }
            ]
        },
        "death": {
            "id": "death",
            "$extends": "game_over_tpl",
            "text": [{ "kind": "paragraph", "text": "You died." }]
        },
        "death_append": {
            "id": "death_append",
            "$extends": "game_over_tpl",
            "$merge": { "onEnter": "append" },
            "onEnter": [{ "type": "playSfx", "sfx": "click" }]
        },
        "hud_with_params": {
            "id": "hud_with_params",
            "text": [
                { "$snippet": "hud_parameterized", "params": { "extra": "Empathy {stat.empathy}" } }
            ],
            "choices": [
                { "id": "back", "label": "Back.", "goto": "intro" }
            ]
        }
    }
}"#;

const CHARACTERS_WITH_ALLY: &str = r#"{
    "spec": "com.blackbox.characters",
    "formatVersion": 1,
    "characters": {
        "ally": { "id": "ally", "name": "Ally" }
    }
}"#;

const SCENARIO: &str = r#"{
    "spec": "com.blackbox.scenario",
    "formatVersion": 1,
    "libraryRef": "library.json",
    "chapters": [
        { "id": "test", "title": "Test", "ref": "chapter.json" }
    ]
}"#;

fn load_content() -> blackbox::content::GameContent {
    decode_scenario_bundle_json(
        SCENARIO,
        support::MINIMAL_ITEMS,
        CHARACTERS_WITH_ALLY,
        support::MINIMAL_ASSETS,
        None::<&[u8]>,
        Some(LIBRARY),
        vec![CHAPTER],
    )
    .expect("library bundle should load")
}

fn load_engine_with_library() -> Engine {
    Engine::new_game(load_content()).expect("engine should start")
}

#[test]
fn snippet_text_is_interpolated_in_view() {
    let mut engine = load_engine_with_library();
    let view = engine.get_current_view().expect("view");
    assert!(view.text.len() >= 2);
    assert_eq!(view.text[0].kind, "stage_direction");
    assert_eq!(view.text[0].text, "HP: 10/10.");
    assert_eq!(view.text[1].text, "Hello.");
}

#[test]
fn extends_node_surfaces_game_over_mode() {
    let content = load_content();
    let death = content.nodes.get("death").expect("death node");
    assert_eq!(death.mode, NodeMode::GameOver);
    assert_eq!(death.title.as_deref(), Some("Signal Lost"));
    assert_eq!(death.choices[0].presentation.label, "Restart.");
}

#[test]
fn named_condition_filters_text_block_at_full_hp() {
    let mut engine = load_engine_with_library();
    let view = engine.get_current_view().expect("view");
    assert!(!view.text.iter().any(|b| b.text == "Low HP warning."));
}

#[test]
fn named_condition_shows_text_block_when_met() {
    let content = decode_scenario_bundle_json(
        r#"{"spec":"com.blackbox.scenario","formatVersion":1,"libraryRef":"library.json","defaultStats":{"hp":2,"max_hp":10},"chapters":[{"id":"test","title":"Test","ref":"chapter.json"}]}"#,
        support::MINIMAL_ITEMS,
        CHARACTERS_WITH_ALLY,
        support::MINIMAL_ASSETS,
        None::<&[u8]>,
        Some(LIBRARY),
        vec![CHAPTER],
    )
    .expect("load");
    let mut engine = Engine::new_game(content).expect("start");
    let view = engine.get_current_view().expect("view");
    assert!(
        view.text.iter().any(|b| b.text == "Low HP warning."),
        "expected low HP block; got {:?}",
        view.text.iter().map(|b| &b.text).collect::<Vec<_>>()
    );
}

#[test]
fn named_condition_referencing_another_named_condition_compiles() {
    let content = load_content();
    assert!(content.nodes.contains_key("intro"));
}

#[test]
fn parameterized_snippet_substitutes_param_in_text() {
    let content = load_content();
    let node = content.nodes.get("hud_with_params").expect("node");
    assert_eq!(node.text.len(), 1);
    assert_eq!(
        node.text[0].text,
        "HP: {stat.hp}/{stat.max_hp}. Empathy {stat.empathy}"
    );
}

#[test]
fn parameterized_snippet_param_is_literal_text() {
    let content = load_content();
    let node = content.nodes.get("hud_with_params").expect("node");
    assert_eq!(node.text.len(), 1);
    assert!(
        node.text[0].text.contains("Empathy {stat.empathy}"),
        "expected interpolation expression in text; got: {}",
        node.text[0].text,
    );
}

#[test]
fn extends_append_onenter_concatenates_effects() {
    let content = load_content();
    let node = content
        .nodes
        .get("death_append")
        .expect("death_append node");
    assert_eq!(
        node.on_enter.len(),
        2,
        "expected [stopMusic, playSfx], got {} effects",
        node.on_enter.len()
    );
}

#[test]
fn extends_replace_onenter_keeps_only_overlay() {
    let content = load_content();
    let death = content.nodes.get("death").expect("death node");
    assert_eq!(death.on_enter.len(), 1);
}

#[test]
fn actor_block_is_hidden_when_flag_absent() {
    let mut engine = load_engine_with_library();
    let view = engine.get_current_view().expect("view");
    assert!(
        !view.text.iter().any(|b| b.text == "Ally speaks."),
        "actor block should be hidden; got {:?}",
        view.text.iter().map(|b| &b.text).collect::<Vec<_>>()
    );
}

#[test]
fn actor_block_is_shown_when_flag_set() {
    let lib = r#"{
        "spec": "com.blackbox.library",
        "formatVersion": 1,
        "snippets": {},
        "templates": {},
        "conditions": {}
    }"#;
    let chapter = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "test",
        "title": "Test",
        "startNodeId": "intro",
        "nodes": {
            "intro": {
                "id": "intro",
                "onEnter": [{ "type": "setActorPresent", "characterId": "ally", "value": true }],
                "text": [
                    {
                        "kind": "dialogue",
                        "speaker": "ally",
                        "actor": "ally",
                        "text": "Ally speaks."
                    }
                ],
                "choices": [
                    { "id": "done", "label": "Done.", "goto": "intro" }
                ]
            }
        }
    }"#;
    let content = decode_scenario_bundle_json(
        SCENARIO,
        support::MINIMAL_ITEMS,
        CHARACTERS_WITH_ALLY,
        support::MINIMAL_ASSETS,
        None::<&[u8]>,
        Some(lib),
        vec![chapter],
    )
    .expect("load");
    let mut engine = Engine::new_game(content).expect("start");
    let view = engine.get_current_view().expect("view");
    assert!(
        view.text.iter().any(|b| b.text == "Ally speaks."),
        "actor block should be shown; got {:?}",
        view.text.iter().map(|b| &b.text).collect::<Vec<_>>()
    );
}
