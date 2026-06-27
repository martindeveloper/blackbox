#[path = "support.rs"]
mod support;

use blackbox::validation::validate_content;
use blackbox::view::RollRecord;
use blackbox::{
    EngineError, PlayerCommand, RollMode, SkillCheckOverride, StateCodec,
    encode_command_result_json,
};
use blackbox_format::JsonFormat;

fn load(scenario_inner: &str) -> blackbox::Engine {
    support::load_engine(scenario_inner)
}

fn choose(engine: &mut blackbox::Engine, choice_id: &str) -> blackbox::CommandResult {
    engine.submit_command(PlayerCommand::Choose {
        choice_id: choice_id.to_string(),
    })
}

#[test]
fn check_preview_shows_advantage_roll_mode() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 5,
                        "rollMode": "advantage",
                        "label": "Advantage check",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "fail": { "id": "fail", "choices": [{ "id": "end", "label": "End.", "goto": "fail" }] }
        }
    "#,
    );

    let view = engine.get_current_view().unwrap();
    let check = view.choices[0]
        .check
        .as_ref()
        .expect("should have check preview");
    assert_eq!(check.roll_mode, RollMode::Advantage);
    assert_eq!(check.stat, "logic");
}

#[test]
fn check_preview_shows_disadvantage_roll_mode() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "empathy",
                        "difficulty": 8,
                        "rollMode": "disadvantage",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "fail": { "id": "fail", "choices": [{ "id": "end", "label": "End.", "goto": "fail" }] }
        }
    "#,
    );

    let view = engine.get_current_view().unwrap();
    let check = view.choices[0]
        .check
        .as_ref()
        .expect("should have check preview");
    assert_eq!(check.roll_mode, RollMode::Disadvantage);
}

#[test]
fn check_preview_shows_normal_roll_mode_by_default() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 5,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "fail": { "id": "fail", "choices": [{ "id": "end", "label": "End.", "goto": "fail" }] }
        }
    "#,
    );

    let view = engine.get_current_view().unwrap();
    let check = view.choices[0]
        .check
        .as_ref()
        .expect("should have check preview");
    assert_eq!(check.roll_mode, RollMode::Normal);
    assert_eq!(check.sides, 20);
}

#[test]
fn check_preview_shows_custom_die_sides() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 5,
                        "sides": 8,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "fail": { "id": "fail", "choices": [{ "id": "end", "label": "End.", "goto": "fail" }] }
        }
    "#,
    );

    let view = engine.get_current_view().unwrap();
    let check = view.choices[0]
        .check
        .as_ref()
        .expect("should have check preview");
    assert_eq!(check.sides, 8);
}

#[test]
fn skill_check_uses_d20_when_sides_are_omitted() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 30,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    "#,
    );

    let result = choose(&mut engine, "go");
    assert!(matches!(
        result.rolls[0],
        RollRecord::SkillCheck {
            sides: Some(20),
            ..
        }
    ));
}

#[test]
fn skill_check_uses_custom_die_sides() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 7,
                        "sides": 6,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    "#,
    );

    let result = choose(&mut engine, "go");
    assert!(matches!(
        result.rolls[0],
        RollRecord::SkillCheck {
            sides: Some(6),
            roll: 1..=6,
            ..
        }
    ));
}

#[test]
fn skill_check_result_json_includes_die_sides() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 7,
                        "sides": 12,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    "#,
    );

    let result = choose(&mut engine, "go");
    let json = encode_command_result_json(&result).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed["rolls"][0]["sides"], 12);
}

#[test]
fn advantage_roll_record_carries_roll_mode() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 1,
                        "rollMode": "advantage",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "fail": { "id": "fail", "choices": [{ "id": "end", "label": "End.", "goto": "fail" }] }
        }
    "#,
    );

    let result = choose(&mut engine, "go");
    assert!(result.ok, "should succeed");
    let skill_roll = result
        .rolls
        .iter()
        .find(|r| matches!(r, RollRecord::SkillCheck { .. }))
        .expect("should have a skill check roll record");

    if let RollRecord::SkillCheck {
        roll_mode, success, ..
    } = skill_roll
    {
        assert_eq!(*roll_mode, RollMode::Advantage);
        assert!(success, "DC=1 must always succeed");
    }
}

#[test]
fn disadvantage_always_fails_against_impossible_dc_confirms_roll_mode() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 21,
                        "rollMode": "disadvantage",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "fail": { "id": "fail", "choices": [{ "id": "end", "label": "End.", "goto": "fail" }] }
        }
    "#,
    );

    let result = choose(&mut engine, "go");
    assert!(result.ok, "command should succeed even on check failure");
    let skill_roll = result
        .rolls
        .iter()
        .find(|r| matches!(r, RollRecord::SkillCheck { .. }))
        .expect("should have a skill check roll record");

    if let RollRecord::SkillCheck {
        roll_mode, success, ..
    } = skill_roll
    {
        assert_eq!(*roll_mode, RollMode::Disadvantage);
        assert!(!success, "DC=21 is unreachable");
    }
}

const MAX_ATTEMPTS_SCENARIO: &str = r#"
    "startNodeId": "start",
    "nodes": {
        "start": {
            "id": "start",
            "choices": [{
                "id": "try_it",
                "label": "Try.",
                "check": {
                    "stat": "logic",
                    "difficulty": 100,
                    "maxAttempts": 2,
                    "onSuccess": { "goto": "pass" },
                    "onFailure": { "goto": "start" },
                    "onExhausted": { "goto": "exhausted" }
                }
            }]
        },
        "pass":      { "id": "pass",      "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
        "exhausted": { "id": "exhausted", "choices": [{ "id": "end", "label": "End.", "goto": "exhausted" }] }
    }
"#;

#[test]
fn max_attempts_check_preview_shows_zero_attempts_initially() {
    let mut engine = load(MAX_ATTEMPTS_SCENARIO);
    let view = engine.get_current_view().unwrap();
    let check = view.choices[0].check.as_ref().expect("should have check");
    assert_eq!(check.max_attempts, Some(2));
    assert_eq!(check.attempts_used, 0);
}

#[test]
fn max_attempts_increments_after_each_failure() {
    let mut engine = load(MAX_ATTEMPTS_SCENARIO);

    let result = choose(&mut engine, "try_it");
    assert!(result.ok);
    let view = result.view.as_ref().unwrap();
    assert_eq!(view.node_id, "start", "onFailure should return to start");

    let check = view.choices[0].check.as_ref().expect("should have check");
    assert_eq!(check.attempts_used, 1, "one attempt consumed");
    assert_eq!(check.max_attempts, Some(2));
}

#[test]
fn max_attempts_fires_on_exhausted_after_limit_reached() {
    let mut engine = load(MAX_ATTEMPTS_SCENARIO);

    let r1 = choose(&mut engine, "try_it");
    assert!(r1.ok);
    assert_eq!(r1.view.as_ref().unwrap().node_id, "start");

    let r2 = choose(&mut engine, "try_it");
    assert!(r2.ok);
    assert_eq!(r2.view.as_ref().unwrap().node_id, "start");

    let check = r2.view.as_ref().unwrap().choices[0].check.as_ref().unwrap();
    assert_eq!(check.attempts_used, 2);

    let r3 = choose(&mut engine, "try_it");
    assert!(r3.ok);
    assert_eq!(
        r3.view.as_ref().unwrap().node_id,
        "exhausted",
        "third attempt should trigger onExhausted branch"
    );
    assert!(
        r3.rolls
            .iter()
            .all(|r| !matches!(r, RollRecord::SkillCheck { .. })),
        "exhausted path must not produce a skill check roll"
    );
}

#[test]
fn max_attempts_with_successful_check_does_not_exhaust() {
    let mut engine = load(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "try_it",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 1,
                        "maxAttempts": 2,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "start" },
                        "onExhausted": { "goto": "exhausted" }
                    }
                }]
            },
            "pass":      { "id": "pass",      "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "exhausted": { "id": "exhausted", "choices": [{ "id": "end", "label": "End.", "goto": "exhausted" }] }
        }
    "#,
    );

    let result = choose(&mut engine, "try_it");
    assert!(result.ok);
    assert_eq!(
        result.view.as_ref().unwrap().node_id,
        "pass",
        "DC=1 should succeed on first attempt"
    );
}

#[test]
fn validation_rejects_max_attempts_without_on_exhausted() {
    let json = support::scenario_json(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 10,
                        "maxAttempts": 3,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "start" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] }
        }
    "#,
    );

    let mut content = JsonFormat
        .decode_bundle_str(
            &json,
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            support::MINIMAL_ASSETS,
        )
        .unwrap();
    let err = validate_content(&mut content).unwrap_err();
    assert!(
        matches!(err, EngineError::ValidationError(ref msg) if msg.contains("onExhausted")),
        "expected onExhausted validation error, got: {err:?}"
    );
}

#[test]
fn validation_rejects_on_exhausted_without_max_attempts() {
    let json = support::scenario_json(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 10,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "start" },
                        "onExhausted": { "goto": "exhausted" }
                    }
                }]
            },
            "pass":      { "id": "pass",      "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "exhausted": { "id": "exhausted", "choices": [{ "id": "end", "label": "End.", "goto": "exhausted" }] }
        }
    "#,
    );

    let mut content = JsonFormat
        .decode_bundle_str(
            &json,
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            support::MINIMAL_ASSETS,
        )
        .unwrap();
    let err = validate_content(&mut content).unwrap_err();
    assert!(
        matches!(err, EngineError::ValidationError(ref msg) if msg.contains("maxAttempts")),
        "expected maxAttempts validation error, got: {err:?}"
    );
}

#[test]
fn validation_rejects_zero_max_attempts() {
    let json = support::scenario_json(
        r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "go",
                    "label": "Try.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 10,
                        "maxAttempts": 0,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "start" },
                        "onExhausted": { "goto": "exhausted" }
                    }
                }]
            },
            "pass":      { "id": "pass",      "choices": [{ "id": "end", "label": "End.", "goto": "pass" }] },
            "exhausted": { "id": "exhausted", "choices": [{ "id": "end", "label": "End.", "goto": "exhausted" }] }
        }
    "#,
    );

    let mut content = JsonFormat
        .decode_bundle_str(
            &json,
            support::MINIMAL_ITEMS,
            support::MINIMAL_CHARACTERS,
            support::MINIMAL_ASSETS,
        )
        .unwrap();
    let err = validate_content(&mut content).unwrap_err();
    assert!(
        matches!(err, EngineError::ValidationError(ref msg) if msg.contains("maxAttempts")),
        "expected maxAttempts=0 validation error, got: {err:?}"
    );
}

#[test]
fn max_attempts_state_is_preserved_through_save_restore() {
    let mut engine = load(MAX_ATTEMPTS_SCENARIO);

    let r1 = choose(&mut engine, "try_it");
    assert!(r1.ok);
    assert_eq!(r1.view.as_ref().unwrap().node_id, "start");

    let saved = JsonFormat.encode_state(engine.get_state()).unwrap();

    let mut engine2 = load(MAX_ATTEMPTS_SCENARIO);
    let state2 = JsonFormat.decode_state(&saved).unwrap();
    engine2.restore_state(state2).unwrap();

    let view2 = engine2.get_current_view().unwrap();
    let check2 = view2.choices[0].check.as_ref().unwrap();
    assert_eq!(
        check2.attempts_used, 1,
        "attempt count must survive save/restore"
    );

    let r2 = choose(&mut engine2, "try_it");
    assert!(r2.ok);

    let r3 = choose(&mut engine2, "try_it");
    assert!(r3.ok);
    assert_eq!(
        r3.view.as_ref().unwrap().node_id,
        "exhausted",
        "onExhausted must fire after save-restored attempt count hits limit"
    );
}

#[test]
fn skill_check_override_forces_success_and_failure_branches() {
    let scenario = r#"
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "hack",
                    "label": "Hack.",
                    "check": {
                        "stat": "logic",
                        "difficulty": 100,
                        "onSuccess": { "goto": "success" },
                        "onFailure": { "goto": "failure" }
                    }
                }]
            },
            "success": { "id": "success", "choices": [] },
            "failure": { "id": "failure", "choices": [] }
        }
    "#;

    let mut engine = load(scenario);
    engine.set_skill_check_override(Some(SkillCheckOverride::ForceSuccess));
    let success = choose(&mut engine, "hack");
    assert!(success.ok);
    assert_eq!(success.view.as_ref().unwrap().node_id, "success");

    let mut engine = load(scenario);
    engine.set_skill_check_override(Some(SkillCheckOverride::ForceFailure));
    let failure = choose(&mut engine, "hack");
    assert!(failure.ok);
    assert_eq!(failure.view.as_ref().unwrap().node_id, "failure");
}

#[test]
fn skill_check_override_forces_exhausted_without_prior_attempts() {
    let mut engine = load(MAX_ATTEMPTS_SCENARIO);

    engine.set_skill_check_override(Some(SkillCheckOverride::ForceExhausted));
    let result = choose(&mut engine, "try_it");
    assert!(result.ok);
    assert_eq!(result.view.as_ref().unwrap().node_id, "exhausted");
    assert!(
        engine.get_state().choice_attempts.is_empty(),
        "forced exhausted must not consume attempt budget"
    );
}

#[test]
fn skill_check_override_clears_after_submit() {
    let mut engine = load(MAX_ATTEMPTS_SCENARIO);

    engine.set_skill_check_override(Some(SkillCheckOverride::ForceSuccess));
    let first = choose(&mut engine, "try_it");
    assert!(first.ok);
    assert_eq!(first.view.as_ref().unwrap().node_id, "pass");

    let mut engine = load(MAX_ATTEMPTS_SCENARIO);
    let second = choose(&mut engine, "try_it");
    assert!(second.ok);
    assert_eq!(
        second.view.as_ref().unwrap().node_id,
        "start",
        "without override, impossible DC should fail back to start"
    );
}
