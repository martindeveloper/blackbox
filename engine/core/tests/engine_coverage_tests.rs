#[path = "support.rs"]
mod support;

use blackbox::{DynamicValue, Engine, EngineError, PlayerCommand, StateCodec};
use blackbox_format::{JsonFormat, MsgpackFormat, encode_chapter_document};

const FORMAT: JsonFormat = JsonFormat;
const MSGPACK: MsgpackFormat = MsgpackFormat;

fn chapter_msgpack(json: &str) -> Vec<u8> {
    encode_chapter_document(json.as_bytes()).expect("encode chapter msgpack")
}

#[test]
fn continue_command_selects_continue_or_first_choice() {
    let with_continue = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "other",
                        "label": "Other",
                        "effects": [{ "type": "setFlag", "flag": "picked", "value": "other" }],
                        "goto": "start"
                    },
                    {
                        "id": "continue",
                        "label": "Continue",
                        "effects": [{ "type": "setFlag", "flag": "picked", "value": "continue" }],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(with_continue);
    let result = engine.submit_command(PlayerCommand::Continue);
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(
        result.view.unwrap().flags.get("picked"),
        Some(&DynamicValue::String("continue".to_string()))
    );

    let without_continue = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "first",
                        "label": "First",
                        "effects": [{ "type": "setFlag", "flag": "picked", "value": "first" }],
                        "goto": "start"
                    },
                    {
                        "id": "second",
                        "label": "Second",
                        "effects": [{ "type": "setFlag", "flag": "picked", "value": "second" }],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(without_continue);
    let result = engine.submit_command(PlayerCommand::Continue);
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(
        result.view.unwrap().flags.get("picked"),
        Some(&DynamicValue::String("first".to_string()))
    );
}

#[test]
fn when_gate_hides_choice() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "clever",
                        "label": "Solve the puzzle.",
                        "when": { "type": "statGte", "stat": "logic", "value": 10 },
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let view = engine.get_current_view().unwrap();
    let found = view.choices.iter().any(|c| c.id == "clever");
    assert!(
        !found,
        "choice with failing `when` should be absent from view"
    );
}

#[test]
fn has_flag_requirement_gates_choice() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "secret",
                        "label": "Open the hatch.",
                        "requires": [{ "type": "hasFlag", "flag": "hatch_unlocked" }],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let disabled = engine.get_current_view().unwrap();
    let locked = disabled.choices.iter().find(|c| c.id == "secret").unwrap();
    assert!(!locked.enabled);

    let unlocked = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "setFlag", "flag": "hatch_unlocked", "value": true }],
                "choices": [
                    {
                        "id": "secret",
                        "label": "Open the hatch.",
                        "requires": [{ "type": "hasFlag", "flag": "hatch_unlocked" }],
                        "goto": "next"
                    }
                ]
            },
            "next": { "id": "next", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(unlocked);
    let view = engine.get_current_view().unwrap();
    let choice = view.choices.iter().find(|c| c.id == "secret").unwrap();
    assert!(choice.enabled);
}

#[test]
fn restore_unknown_node_returns_error() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": { "id": "start", "choices": [] }
        }
    }"#;

    let engine = support::load_engine(scenario);
    let mut state = engine.get_state().clone();
    state.current_node_id = "missing".to_string();

    let mut restored = support::load_engine(scenario);
    let error = restored.restore_state(state).unwrap_err();
    assert!(matches!(error, EngineError::UnknownNode(id) if id == "missing"));
}

#[test]
fn on_enter_not_rerun_after_restore() {
    let scenario = r#"{
        "startNodeId": "a",
        "nodes": {
            "a": {
                "id": "a",
                "choices": [
                    {
                        "id": "go",
                        "label": "Go",
                        "goto": "b"
                    }
                ]
            },
            "b": {
                "id": "b",
                "onEnter": [{ "type": "addEvent", "eventId": "entered_b" }],
                "choices": []
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "go".to_string(),
    });
    assert!(result.ok);
    assert_eq!(
        result
            .view
            .unwrap()
            .events
            .iter()
            .filter(|event| *event == "entered_b")
            .count(),
        1
    );

    let save = FORMAT.encode_state(engine.get_state()).unwrap();
    let mut restored = support::load_engine(scenario);
    let view = restored
        .restore_state(FORMAT.decode_state(&save).unwrap())
        .unwrap();

    assert_eq!(view.node_id, "b");
    assert_eq!(
        view.events
            .iter()
            .filter(|event| *event == "entered_b")
            .count(),
        1,
        "onEnter should not run again after restore"
    );
}

#[test]
fn skill_check_failure_branch_with_outcome_effects() {
    let scenario = r#"{
        "startNodeId": "start",
        "randomSeed": 1,
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "hack",
                        "label": "Hack the panel.",
                        "check": {
                            "stat": "logic",
                            "difficulty": 30,
                            "onSuccess": { "goto": "success" },
                            "onFailure": {
                                "effects": [{ "type": "addEvent", "eventId": "alarm_tripped" }],
                                "goto": "failure"
                            }
                        }
                    }
                ]
            },
            "success": { "id": "success", "choices": [] },
            "failure": { "id": "failure", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hack".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let view = result.view.unwrap();
    assert_eq!(view.node_id, "failure");
    assert!(view.events.iter().any(|event| event == "alarm_tripped"));
    assert!(matches!(
        result.rolls[0],
        blackbox::RollRecord::SkillCheck { success: false, .. }
    ));
}

#[test]
fn skill_check_modifier_expression() {
    let scenario = r#"{
        "startNodeId": "start",
        "randomSeed": 1,
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "hack",
                        "label": "Hack the panel.",
                        "check": {
                            "stat": "logic",
                            "difficulty": 5,
                            "modifier": "2",
                            "onSuccess": { "goto": "success" },
                            "onFailure": { "goto": "failure" }
                        }
                    }
                ]
            },
            "success": { "id": "success", "choices": [] },
            "failure": { "id": "failure", "choices": [] }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hack".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    assert!(matches!(
        result.rolls[0],
        blackbox::RollRecord::SkillCheck {
            modifier: 5,
            success: true,
            ..
        }
    ));
}

#[test]
fn dice_expression_produces_dice_roll_record() {
    let scenario = r#"{
        "startNodeId": "start",
        "randomSeed": 42,
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "roll",
                        "label": "Roll a die.",
                        "effects": [
                            {
                                "type": "modifyStat",
                                "stat": "hp",
                                "amountExpr": { "call": "dice", "args": [6] }
                            }
                        ],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let before_hp = engine.get_current_view().unwrap().player_stats["hp"];
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "roll".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    assert_eq!(result.rolls.len(), 1);
    assert!(matches!(result.rolls[0], blackbox::RollRecord::Dice { .. }));

    let after_hp = result.view.unwrap().player_stats["hp"];
    let roll_total = match &result.rolls[0] {
        blackbox::RollRecord::Dice { total, .. } => *total,
        _ => panic!("expected dice roll"),
    };
    assert_eq!(after_hp, before_hp + roll_total);
}

#[test]
fn set_flag_value_expr() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "mark",
                        "label": "Mark",
                        "effects": [
                            {
                                "type": "setFlag",
                                "flag": "logic_score",
                                "valueExpr": "stat.logic"
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
        choice_id: "mark".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    assert_eq!(
        result.view.unwrap().flags.get("logic_score"),
        Some(&DynamicValue::Number(3))
    );
}

#[test]
fn remove_item_count_expr() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "addItem", "itemId": "bolt", "count": 3 }],
                "choices": [
                    {
                        "id": "use",
                        "label": "Use bolts",
                        "effects": [
                            {
                                "type": "removeItem",
                                "itemId": "bolt",
                                "countExpr": "2"
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
        choice_id: "use".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    assert_eq!(result.view.unwrap().inventory.get("bolt"), Some(&1));
}

#[test]
fn roll_store_flag_writes_flag() {
    let scenario = r#"{
        "startNodeId": "start",
        "randomSeed": 99,
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "roll",
                        "label": "Roll",
                        "effects": [{ "type": "roll", "sides": 6, "storeFlag": "last_roll" }],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "roll".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let view = result.view.unwrap();
    let roll_total = match &result.rolls[0] {
        blackbox::RollRecord::Roll { total, .. } => *total,
        _ => panic!("expected roll record"),
    };
    assert_eq!(
        view.flags.get("last_roll"),
        Some(&DynamicValue::Number(roll_total))
    );
}

#[test]
fn stat_normalize_clamps_negative_hp() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "hurt",
                        "label": "Take massive damage.",
                        "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -100 }],
                        "goto": "start"
                    }
                ]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hurt".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    assert_eq!(result.view.unwrap().player_stats["hp"], 0);
}

#[test]
fn zero_hp_redirects_to_death_node_when_configured() {
    let scenario = r#"{
        "startNodeId": "start",
        "deathNode": {
            "title": "Dead",
            "choices": [{
                "id": "restart",
                "label": "Restart.",
                "action": { "type": "restartGame", "startNodeId": "start" }
            }]
        },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "hurt",
                    "label": "Take massive damage.",
                    "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -10 }],
                    "goto": "start"
                }]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hurt".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let view = result.view.unwrap();
    assert_eq!(view.player_stats["hp"], 0);
    assert_eq!(view.node_id, "__death__");
    assert_eq!(view.mode, blackbox::content::NodeMode::GameOver);
}

#[test]
fn on_enter_play_sfx_surfaces_triggered_sfx() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "next",
                    "label": "Continue.",
                    "goto": "alarm"
                }]
            },
            "alarm": {
                "id": "alarm",
                "onEnter": [{ "type": "playSfx", "sfx": "click" }],
                "choices": [{ "id": "done", "label": "Done.", "goto": "alarm" }]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "next".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let triggered = result
        .triggered_sfx
        .expect("onEnter playSfx should surface triggered_sfx");
    assert_eq!(triggered.ref_id, "click");
    assert_eq!(triggered.src, "sfx/click.wav");
}

#[test]
fn zero_hp_stays_on_node_without_death_node_id() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "hurt",
                    "label": "Take massive damage.",
                    "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -10 }],
                    "goto": "start"
                }]
            }
        }
    }"#;

    let mut engine = support::load_engine(scenario);
    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hurt".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let view = result.view.unwrap();
    assert_eq!(view.player_stats["hp"], 0);
    assert_eq!(view.node_id, "start");
    assert_eq!(view.mode, blackbox::content::NodeMode::Normal);
}

#[test]
fn chapter_death_node_overrides_scenario_default() {
    let scenario = support::scenario_json(
        r#"
        "deathNode": {
            "title": "Default death",
            "choices": [{ "id": "restart", "label": "Restart.", "action": { "type": "restartGame", "startNodeId": "start_a" } }]
        },
        "chapters": [
            { "id": "a", "title": "A", "ref": "chapter_a.json" },
            { "id": "b", "title": "B", "ref": "chapter_b.json" }
        ]
        "#,
    );
    let chapter_a = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "a",
        "title": "A",
        "startNodeId": "start_a",
        "nodes": {
            "start_a": {
                "id": "start_a",
                "choices": [{
                    "id": "enter_b",
                    "label": "Go to B.",
                    "action": { "type": "gotoChapter", "chapterId": "b", "nodeId": "start_b" }
                }]
            }
        }
    }"#;
    let chapter_b = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "b",
        "title": "B",
        "startNodeId": "start_b",
        "deathNodeId": "tunnel_death",
        "nodes": {
            "start_b": {
                "id": "start_b",
                "choices": [{
                    "id": "hurt",
                    "label": "Take damage.",
                    "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -10 }],
                    "goto": "start_b"
                }]
            },
            "tunnel_death": {
                "id": "tunnel_death",
                "mode": "game_over",
                "choices": [{ "id": "restart", "label": "Restart.", "action": { "type": "restartGame", "startNodeId": "start_b" } }]
            }
        }
    }"#;

    let chapters: Vec<&[u8]> = vec![chapter_a.as_bytes(), chapter_b.as_bytes()];
    let mut engine = Engine::load_chaptered_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        chapters,
        &JsonFormat,
    )
    .unwrap();

    let enter = engine.submit_command(PlayerCommand::Choose {
        choice_id: "enter_b".to_string(),
    });
    assert!(enter.ok, "{:?}", enter.error);

    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hurt".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let view = result.view.unwrap();
    assert_eq!(view.node_id, "tunnel_death");
    assert_eq!(view.mode, blackbox::content::NodeMode::GameOver);
}

#[test]
fn chapter_without_death_node_uses_scenario_fallback() {
    let scenario = support::scenario_json(
        r#"
        "deathNode": {
            "title": "Default death",
            "choices": [{ "id": "restart", "label": "Restart.", "action": { "type": "restartGame", "startNodeId": "start_a" } }]
        },
        "chapters": [{ "id": "a", "title": "A", "ref": "chapter_a.json" }]
        "#,
    );
    let chapter_a = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "a",
        "title": "A",
        "startNodeId": "start_a",
        "nodes": {
            "start_a": {
                "id": "start_a",
                "choices": [{
                    "id": "hurt",
                    "label": "Take damage.",
                    "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -10 }],
                    "goto": "start_a"
                }]
            }
        }
    }"#;

    let chapters: Vec<&[u8]> = vec![chapter_a.as_bytes()];
    let mut engine = Engine::load_chaptered_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        chapters,
        &JsonFormat,
    )
    .unwrap();

    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "hurt".to_string(),
    });

    assert!(result.ok, "{:?}", result.error);
    let view = result.view.unwrap();
    assert_eq!(view.player_stats["hp"], 0);
    assert_eq!(view.node_id, "__death__");
    assert_eq!(view.mode, blackbox::content::NodeMode::GameOver);
}

#[test]
fn merge_chapter_after_unloading_start_chapter_succeeds() {
    let scenario = support::scenario_json(
        r#"
        "startNodeId": "start_a",
        "chapters": [
            { "id": "a", "title": "A", "ref": "chapter_a.json" },
            { "id": "b", "title": "B", "ref": "chapter_b.json" },
            { "id": "c", "title": "C", "ref": "chapter_c.json" }
        ]
        "#,
    );
    let chapter_a = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "a",
        "title": "A",
        "startNodeId": "start_a",
        "nodes": {
            "start_a": {
                "id": "start_a",
                "choices": [{
                    "id": "enter_b",
                    "label": "Go to B.",
                    "action": { "type": "gotoChapter", "chapterId": "b", "nodeId": "start_b" }
                }]
            }
        }
    }"#;
    let chapter_b = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "b",
        "title": "B",
        "startNodeId": "start_b",
        "nodes": {
            "start_b": {
                "id": "start_b",
                "choices": [{
                    "id": "enter_c",
                    "label": "Go to C.",
                    "action": { "type": "gotoChapter", "chapterId": "c", "nodeId": "start_c" }
                }]
            }
        }
    }"#;
    let chapter_c = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "c",
        "title": "C",
        "startNodeId": "start_c",
        "nodes": {
            "start_c": {
                "id": "start_c",
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "start_c" }]
            }
        }
    }"#;

    let chapters: Vec<&[u8]> = vec![chapter_a.as_bytes(), chapter_b.as_bytes()];
    let mut engine = Engine::load_chaptered_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        chapters,
        &JsonFormat,
    )
    .unwrap();

    let enter_b = engine.submit_command(PlayerCommand::Choose {
        choice_id: "enter_b".to_string(),
    });
    assert!(enter_b.ok, "{:?}", enter_b.error);
    engine.unload_chapter("a").expect("unload start chapter");

    engine
        .merge_chapter(chapter_msgpack(chapter_c), &MSGPACK)
        .expect("merge third chapter after start chapter unloaded");

    let result = engine.submit_command(PlayerCommand::Choose {
        choice_id: "enter_c".to_string(),
    });
    assert!(result.ok, "{:?}", result.error);
    assert_eq!(result.view.unwrap().node_id, "start_c");
}

#[test]
fn merge_chapter_can_be_retried_after_validation_failure() {
    let scenario = support::scenario_json(
        r#"
        "startNodeId": "start_a",
        "chapters": [
            { "id": "a", "title": "A", "ref": "chapter_a.json" },
            { "id": "b", "title": "B", "ref": "chapter_b.json" },
            { "id": "c", "title": "C", "ref": "chapter_c.json" }
        ]
        "#,
    );
    let chapter_a = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "a",
        "title": "A",
        "startNodeId": "start_a",
        "nodes": {
            "start_a": {
                "id": "start_a",
                "choices": [{
                    "id": "enter_b",
                    "label": "Go to B.",
                    "action": { "type": "gotoChapter", "chapterId": "b", "nodeId": "start_b" }
                }]
            }
        }
    }"#;
    let chapter_b = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "b",
        "title": "B",
        "startNodeId": "start_b",
        "nodes": {
            "start_b": {
                "id": "start_b",
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "start_b" }]
            }
        }
    }"#;
    let chapter_c = r#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "c",
        "title": "C",
        "startNodeId": "start_c",
        "nodes": {
            "start_c": {
                "id": "start_c",
                "choices": [{ "id": "stay", "label": "Stay.", "goto": "start_c" }]
            }
        }
    }"#;

    let mut engine = Engine::load_chaptered_bundle(
        scenario,
        support::MINIMAL_ITEMS,
        support::MINIMAL_CHARACTERS,
        support::MINIMAL_ASSETS,
        vec![chapter_a.as_bytes(), chapter_b.as_bytes()],
        &JsonFormat,
    )
    .unwrap();

    let enter_b = engine.submit_command(PlayerCommand::Choose {
        choice_id: "enter_b".to_string(),
    });
    assert!(enter_b.ok, "{:?}", enter_b.error);
    engine.unload_chapter("a").expect("unload start chapter");

    let first = engine.merge_chapter(chapter_msgpack(chapter_c), &MSGPACK);
    assert!(first.is_ok(), "{first:?}");

    let second = engine.merge_chapter(chapter_msgpack(chapter_c), &MSGPACK);
    assert!(matches!(
        second,
        Err(EngineError::ValidationError(message)) if message.contains("already loaded")
    ));
}
