#[path = "support.rs"]
mod support;

use blackbox::{DynamicValue, PlayerCommand};

fn load(scenario_inner: &str) -> blackbox::Engine {
    support::load_engine(scenario_inner)
}

fn choose(engine: &mut blackbox::Engine, choice_id: &str) -> blackbox::CommandResult {
    engine.submit_command(PlayerCommand::Choose {
        choice_id: choice_id.to_string(),
    })
}

#[test]
fn redirect_forwards_on_arrival_when_gate_passes() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    { "id": "prep", "label": "Prep.", "effects": [{ "type": "setFlag", "flag": "act2", "value": true }], "goto": "hub" },
                    { "id": "raw", "label": "Go.", "goto": "hub" }
                ]
            },
            "hub": {
                "id": "hub",
                "redirect": [
                    { "when": { "type": "hasFlag", "flag": "act2" }, "goto": "act2_scene" }
                ],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "hub" }]
            },
            "act2_scene": { "id": "act2_scene", "choices": [] }
        }"#,
    );

    let result = choose(&mut engine, "prep");
    assert!(result.ok, "{:?}", result.error);
    let view = result.view.as_ref().unwrap();
    assert_eq!(view.node_id, "act2_scene");
    // The pass-through hub counts as visited.
    assert!(engine.get_state().has_visited("hub"));
}

#[test]
fn redirect_stays_put_when_no_rule_matches() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{ "id": "raw", "label": "Go.", "goto": "hub" }]
            },
            "hub": {
                "id": "hub",
                "redirect": [
                    { "when": { "type": "hasFlag", "flag": "act2" }, "goto": "act2_scene" }
                ],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "hub" }]
            },
            "act2_scene": { "id": "act2_scene", "choices": [] }
        }"#,
    );

    let result = choose(&mut engine, "raw");
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(result.view.as_ref().unwrap().node_id, "hub");
}

#[test]
fn redirect_first_matching_rule_wins_and_unless_gates_apply() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "both", "value": true }],
                "choices": [{ "id": "go", "label": "Go.", "goto": "hub" }]
            },
            "hub": {
                "id": "hub",
                "redirect": [
                    { "when": { "type": "hasFlag", "flag": "both" }, "unless": { "type": "hasFlag", "flag": "both" }, "goto": "wrong" },
                    { "when": { "type": "hasFlag", "flag": "both" }, "goto": "right" }
                ],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "hub" }]
            },
            "wrong": { "id": "wrong", "choices": [] },
            "right": { "id": "right", "choices": [] }
        }"#,
    );

    let result = choose(&mut engine, "go");
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(result.view.as_ref().unwrap().node_id, "right");
}

#[test]
fn redirect_chain_runs_on_enter_of_each_hop() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{ "id": "go", "label": "Go.", "goto": "hop_a" }]
            },
            "hop_a": {
                "id": "hop_a",
                "onEnter": [{ "type": "setFlag", "flag": "a_entered", "value": true }],
                "redirect": [{ "when": { "type": "hasFlag", "flag": "a_entered" }, "goto": "hop_b" }],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "hop_a" }]
            },
            "hop_b": {
                "id": "hop_b",
                "onEnter": [{ "type": "modifyStat", "stat": "hops", "amount": 1 }],
                "choices": []
            }
        }"#,
    );

    let result = choose(&mut engine, "go");
    assert!(result.ok, "{:?}", result.error);
    let view = result.view.as_ref().unwrap();
    assert_eq!(view.node_id, "hop_b");
    assert_eq!(view.player_stats.get("hops"), Some(&1));
    assert_eq!(
        engine.get_state().flags.get("a_entered"),
        Some(&DynamicValue::Bool(true))
    );
}

#[test]
fn redirect_applies_on_new_game_start_node() {
    let engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "skip_intro", "value": true }],
                "redirect": [{ "when": { "type": "hasFlag", "flag": "skip_intro" }, "goto": "scene" }],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "start" }]
            },
            "scene": { "id": "scene", "choices": [] }
        }"#,
    );

    assert_eq!(engine.get_state().current_node_id, "scene");
}

#[test]
fn redirect_loop_fails_the_command() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{ "id": "go", "label": "Go.", "goto": "ping" }]
            },
            "ping": {
                "id": "ping",
                "redirect": [{ "goto": "pong" }],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "ping" }]
            },
            "pong": {
                "id": "pong",
                "redirect": [{ "goto": "ping" }],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "pong" }]
            }
        }"#,
    );

    let result = choose(&mut engine, "go");
    assert!(!result.ok);
    let message = format!("{:?}", result.error);
    assert!(message.contains("redirect"), "unexpected error: {message}");
}

#[test]
fn redirect_to_unknown_node_is_a_validation_error() {
    let scenario = support::scenario_json(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "redirect": [{ "goto": "missing" }],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "start" }]
            }
        }"#,
    );
    let result = blackbox::Engine::load_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        &blackbox_format::JsonFormat,
    );
    assert!(result.is_err());
}

#[test]
fn redirect_accepts_array_form_gates() {
    let scenario = support::scenario_json(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": { "id": "start", "choices": [{ "id": "go", "label": "Go.", "goto": "hub" }] },
            "hub": {
                "id": "hub",
                "redirect": [{ "when": [{ "type": "statGte", "stat": "hp", "value": 1 }], "goto": "start" }],
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "hub" }]
            }
        }"#,
    );
    let result = blackbox::Engine::load_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        &blackbox_format::JsonFormat,
    );
    assert!(result.is_ok());
}

#[test]
fn on_command_hook_ticks_once_per_command() {
    let mut engine = load(
        r#"
        "hooks": {
            "onCommand": [{ "type": "modifyStat", "stat": "turns", "amount": 1 }]
        },
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    { "id": "wait", "label": "Wait.", "effects": [{ "type": "setFlag", "flag": "waited", "value": true }] },
                    { "id": "move", "label": "Move.", "goto": "next" }
                ]
            },
            "next": { "id": "next", "choices": [{ "id": "back", "label": "Back.", "goto": "start" }] }
        }"#,
    );

    assert_eq!(engine.get_state().player.stats.get("turns"), None);

    let result = choose(&mut engine, "wait");
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(engine.get_state().player.stats.get("turns"), Some(&1));

    let result = choose(&mut engine, "move");
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(engine.get_state().player.stats.get("turns"), Some(&2));
}

#[test]
fn on_node_enter_hook_runs_before_node_on_enter_on_every_arrival() {
    let mut engine = load(
        r#"
        "hooks": {
            "onNodeEnter": [{ "type": "modifyStat", "stat": "rooms", "amount": 1 }]
        },
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "rooms_at_start", "valueExpr": "stat.rooms" }],
                "choices": [
                    { "id": "wait", "label": "Wait.", "effects": [{ "type": "setFlag", "flag": "waited", "value": true }] },
                    { "id": "move", "label": "Move.", "goto": "next" }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }"#,
    );

    assert_eq!(engine.get_state().player.stats.get("rooms"), Some(&1));
    assert_eq!(
        engine.get_state().flags.get("rooms_at_start"),
        Some(&DynamicValue::Number(1))
    );

    let result = choose(&mut engine, "wait");
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(engine.get_state().player.stats.get("rooms"), Some(&1));

    let result = choose(&mut engine, "move");
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(engine.get_state().player.stats.get("rooms"), Some(&2));
}

#[test]
fn hooks_with_missing_asset_ref_fail_validation() {
    let scenario = support::scenario_json(
        r#"
        "hooks": { "onCommand": [{ "type": "playSfx", "sfx": "missing_sfx" }] },
        "startNodeId": "start",
        "nodes": { "start": { "id": "start", "choices": [] } }"#,
    );
    let result = blackbox::Engine::load_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        &blackbox_format::JsonFormat,
    );
    assert!(result.is_err());
}

#[test]
fn multiplication_and_division_work_in_effect_expressions() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "defaultStats": { "logic": 4, "hp": 10, "max_hp": 10 },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "calc",
                    "label": "Calc.",
                    "effects": [
                        { "type": "setFlag", "flag": "doubled_plus_one", "valueExpr": "stat.logic * 2 + 1" },
                        { "type": "setFlag", "flag": "halved", "valueExpr": "stat.logic / 2" }
                    ]
                }]
            }
        }"#,
    );

    let result = choose(&mut engine, "calc");
    assert!(result.ok, "{:?}", result.error);
    let state = engine.get_state();
    // Precedence: 4 * 2 + 1 = 9, not 4 * 3.
    assert_eq!(
        state.flags.get("doubled_plus_one"),
        Some(&DynamicValue::Number(9))
    );
    assert_eq!(state.flags.get("halved"), Some(&DynamicValue::Number(2)));
}

#[test]
fn division_by_zero_fails_the_command() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "boom",
                    "label": "Boom.",
                    "effects": [{ "type": "setFlag", "flag": "bad", "valueExpr": "10 / stat.missing" }]
                }]
            }
        }"#,
    );

    let result = choose(&mut engine, "boom");
    assert!(!result.ok);
}

#[test]
fn multiplication_works_in_text_interpolation() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "defaultStats": { "logic": 3, "hp": 10, "max_hp": 10 },
        "nodes": {
            "start": {
                "id": "start",
                "text": [{ "kind": "paragraph", "text": "Power level: {stat.logic * 100}." }],
                "choices": []
            }
        }"#,
    );

    let view = engine.get_current_view().unwrap();
    assert_eq!(view.text[0].text, "Power level: 300.");
}
