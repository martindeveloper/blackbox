use std::sync::Arc;

use blackbox::content::{CatalogEntry, MetaCatalog};
use blackbox::validation::validate_content;
use blackbox_format::JsonFormat;

use crate::checks::{
    items::check_items, references::check_references, skill_checks::check_skill_checks,
};
use crate::graph::analyze_reachability;
use crate::refs::collect_content_refs;
use crate::report::LintReport;

const FORMAT: JsonFormat = JsonFormat;

const MINIMAL_ITEMS: &str = r#"{
  "spec": "com.blackbox.items",
  "formatVersion": 1,
  "items": {
    "key": {
      "id": "key",
      "name": "Key",
      "description": "A key.",
      "actions": [
        {
          "id": "use_key",
          "label": "Use key",
          "goto": "unlocked"
        }
      ]
    }
  }
}"#;

const EMPTY_CHARACTERS: &str = r#"{
  "spec": "com.blackbox.characters",
  "formatVersion": 1,
  "characters": {}
}"#;

const EMPTY_ASSETS: &str = r#"{
  "spec": "com.blackbox.assets.bundle",
  "formatVersion": 1
}"#;

#[test]
fn rejects_unsupported_wire_spec() {
    let scenario = r#"{
        "spec": "wrong",
        "formatVersion": 1,
        "startNodeId": "start",
        "nodes": { "start": { "id": "start", "choices": [] } }
    }"#;

    let error = FORMAT
        .decode_bundle_str(
            scenario,
            r#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            EMPTY_CHARACTERS,
            EMPTY_ASSETS,
        )
        .unwrap_err();

    assert!(matches!(error, blackbox::EngineError::ValidationError(_)));
}

fn scenario_json(inner: &str) -> String {
    wire_json(inner, "com.blackbox.scenario", 1)
}

fn items_json(inner: &str) -> String {
    wire_json(inner, "com.blackbox.items", 1)
}

fn wire_json(inner: &str, spec: &str, version: u32) -> String {
    let trimmed = inner.trim();
    let mut value: serde_json::Value = if trimmed.starts_with('{') {
        serde_json::from_str(trimmed).expect("valid json object")
    } else {
        let wrapped = format!("{{{}}}", trimmed.trim_end_matches(','));
        serde_json::from_str(&wrapped).expect("valid json object fields")
    };
    let obj = value.as_object_mut().expect("object root");
    obj.entry("spec")
        .or_insert_with(|| serde_json::Value::String(spec.into()));
    obj.entry("formatVersion")
        .or_insert(serde_json::Value::from(version));
    serde_json::to_string(obj).expect("serialize wire document")
}

fn decode(scenario: &str, items: &str) -> blackbox::GameContent {
    let mut content = FORMAT
        .decode_bundle_str(
            &scenario_json(scenario),
            &items_json(items),
            EMPTY_CHARACTERS,
            EMPTY_ASSETS,
        )
        .expect("scenario should decode");
    validate_content(&mut content).expect("scenario should validate");
    content
}

#[test]
fn reachability_follows_item_actions() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "take_key",
                        "label": "Take key",
                        "effects": [{ "type": "addItem", "itemId": "key", "count": 1 }],
                        "goto": "hall"
                    }
                ]
            },
            "hall": { "id": "hall", "choices": [] },
            "unlocked": { "id": "unlocked", "choices": [] }
        }
    }"#;

    let analysis = analyze_reachability(&decode(scenario, MINIMAL_ITEMS));
    assert!(analysis.reachable_nodes.contains("unlocked"));
    assert!(analysis.obtainable_items.contains("key"));
}

#[test]
fn reachability_follows_open_load_menu_goto() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "load",
                        "label": "Load",
                        "goto": "resume",
                        "action": { "type": "openLoadMenu" }
                    }
                ]
            },
            "resume": { "id": "resume", "choices": [] }
        }
    }"#;

    let analysis = analyze_reachability(&decode(scenario, r#"{ "items": {} }"#));
    assert!(analysis.reachable_nodes.contains("resume"));
}

#[test]
fn reachability_handles_many_independent_item_branches() {
    let choices = (0..24)
        .map(|i| {
            format!(
                r#"{{
                    "id": "take_item_{i}",
                    "label": "Take item {i}",
                    "effects": [{{ "type": "addItem", "itemId": "item_{i}", "count": 1 }}],
                    "goto": "start"
                }}"#
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let item_defs = (0..24)
        .map(|i| {
            format!(
                r#""item_{i}": {{
                    "id": "item_{i}",
                    "name": "Item {i}",
                    "description": "An item."
                }}"#
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let scenario = format!(
        r#"{{
            "startNodeId": "start",
            "nodes": {{
                "start": {{
                    "id": "start",
                    "choices": [{choices}]
                }}
            }}
        }}"#
    );
    let items = format!(r#"{{ "items": {{ {item_defs} }} }}"#);

    let analysis = analyze_reachability(&decode(&scenario, &items));

    assert_eq!(analysis.reachable_nodes.len(), 1);
    assert_eq!(analysis.obtainable_items.len(), 24);
}

#[test]
fn roll_store_flag_counts_as_set() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "roll",
                        "label": "Roll",
                        "effects": [{ "type": "roll", "sides": 6, "storeFlag": "dice_result" }],
                        "goto": "next"
                    }
                ]
            },
            "next": {
                "id": "next",
                "choices": [
                    {
                        "id": "need_roll",
                        "label": "Need roll",
                        "requires": [{ "type": "hasFlag", "flag": "dice_result" }],
                        "goto": "end"
                    }
                ]
            },
            "end": { "id": "end", "choices": [] }
        }
    }"#;

    let refs = collect_content_refs(&decode(scenario, r#"{ "items": {} }"#));
    assert!(refs.flags_set.contains("dice_result"));
    assert!(
        !refs
            .flags_read
            .difference(&refs.flags_set)
            .any(|flag| flag == "dice_result")
    );
}

#[test]
fn skill_check_impossible_is_reported() {
    let scenario = r#"{
        "startNodeId": "start",
        "defaultStats": { "logic": 3 },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "try",
                    "label": "Try",
                    "check": {
                        "stat": "logic",
                        "difficulty": 12,
                        "sides": 6,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    }"#;

    let mut report = LintReport::default();
    check_skill_checks(&decode(scenario, r#"{ "items": {} }"#), &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "skill-check-impossible"),
        "expected impossible check warning, got: {:?}",
        report.issues
    );
}

#[test]
fn skill_check_guaranteed_is_reported() {
    let scenario = r#"{
        "startNodeId": "start",
        "defaultStats": { "logic": 3 },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "try",
                    "label": "Try",
                    "check": {
                        "stat": "logic",
                        "difficulty": 4,
                        "sides": 6,
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    }"#;

    let mut report = LintReport::default();
    check_skill_checks(&decode(scenario, r#"{ "items": {} }"#), &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "skill-check-guaranteed"),
        "expected guaranteed check warning, got: {:?}",
        report.issues
    );
}

#[test]
fn skill_check_impossible_accounts_for_dynamic_modifier_range() {
    let scenario = r#"{
        "startNodeId": "start",
        "defaultStats": { "logic": 3 },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "try",
                    "label": "Try",
                    "check": {
                        "stat": "logic",
                        "difficulty": 13,
                        "sides": 6,
                        "modifier": "(hasFlag('a')) + (hasFlag('b')) + (relationship('elian','trust') >= 3)",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    }"#;

    let mut report = LintReport::default();
    check_skill_checks(&decode(scenario, r#"{ "items": {} }"#), &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "skill-check-impossible"),
        "expected impossible check warning, got: {:?}",
        report.issues
    );
}

#[test]
fn skill_check_guaranteed_accounts_for_dynamic_modifier_range() {
    let scenario = r#"{
        "startNodeId": "start",
        "defaultStats": { "empathy": 8 },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "try",
                    "label": "Try",
                    "check": {
                        "stat": "empathy",
                        "difficulty": 7,
                        "sides": 12,
                        "modifier": "(hasFlag('helped')) - (hasFlag('hurt')) - (relationship('tessa','trust') < 0)",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    }"#;

    let mut report = LintReport::default();
    check_skill_checks(&decode(scenario, r#"{ "items": {} }"#), &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "skill-check-guaranteed"),
        "expected guaranteed check warning, got: {:?}",
        report.issues
    );
}

#[test]
fn skill_check_balance_skips_unbounded_numeric_modifier() {
    let scenario = r#"{
        "startNodeId": "start",
        "defaultStats": { "logic": 3 },
        "nodes": {
            "start": {
                "id": "start",
                "choices": [{
                    "id": "try",
                    "label": "Try",
                    "check": {
                        "stat": "logic",
                        "difficulty": 99,
                        "sides": 6,
                        "modifier": "itemCount('clue')",
                        "onSuccess": { "goto": "pass" },
                        "onFailure": { "goto": "fail" }
                    }
                }]
            },
            "pass": { "id": "pass", "choices": [] },
            "fail": { "id": "fail", "choices": [] }
        }
    }"#;

    let mut report = LintReport::default();
    check_skill_checks(&decode(scenario, r#"{ "items": {} }"#), &mut report);

    assert!(
        report.issues.is_empty(),
        "expected unbounded modifier to be skipped, got: {:?}",
        report.issues
    );
}

#[test]
fn item_unobtainable_is_reported() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "need_key",
                        "label": "Need key",
                        "requires": [{ "type": "hasItem", "itemId": "key", "count": 1 }],
                        "goto": "end"
                    }
                ]
            },
            "end": { "id": "end", "choices": [] }
        }
    }"#;

    let content = decode(
        scenario,
        r#"{
          "items": {
            "key": { "id": "key", "name": "Key", "description": "A key." }
          }
        }"#,
    );
    let mut report = LintReport::default();
    check_items(&content, &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "item-unobtainable")
    );
}

fn catalog_entry(title: &str) -> CatalogEntry {
    CatalogEntry {
        title: Some(title.to_string()),
        description: None,
        internal: false,
    }
}

#[test]
fn event_not_in_catalog_is_reported() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "choices": [
                    {
                        "id": "go",
                        "label": "Go",
                        "effects": [{ "type": "addEvent", "eventId": "ghost_event" }],
                        "goto": "end"
                    }
                ]
            },
            "end": { "id": "end", "choices": [] }
        }
    }"#;

    let content = decode(scenario, r#"{ "items": {} }"#);
    let mut report = LintReport::default();
    check_references(&content, &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "event-not-in-catalog"),
        "should warn when addEvent references an event not in catalog"
    );
}

#[test]
fn catalog_event_never_fired_is_reported() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": { "id": "start", "choices": [] }
        }
    }"#;

    let mut content = decode(scenario, r#"{ "items": {} }"#);
    let mut catalog = MetaCatalog::default();
    catalog
        .events
        .insert("orphan_event".to_string(), catalog_entry("Orphan"));
    content.meta = Arc::new(catalog);

    let mut report = LintReport::default();
    check_references(&content, &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "catalog-event-never-fired"),
        "should warn when a catalog event is never fired by any addEvent"
    );
}

#[test]
fn catalog_flag_never_set_is_reported() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": { "id": "start", "choices": [] }
        }
    }"#;

    let mut content = decode(scenario, r#"{ "items": {} }"#);
    let mut catalog = MetaCatalog::default();
    catalog
        .flags
        .insert("orphan_flag".to_string(), catalog_entry("Orphan flag"));
    content.meta = Arc::new(catalog);

    let mut report = LintReport::default();
    check_references(&content, &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "catalog-flag-never-set"),
        "should warn when a catalog flag is never set by any setFlag effect"
    );
}

#[test]
fn text_interpolation_validates_unknown_item() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [
                    { "kind": "paragraph", "text": "You have {item.missing_item} items." }
                ],
                "choices": []
            }
        }
    }"#;

    let content = decode(scenario, r#"{ "items": {} }"#);
    let mut report = LintReport::default();
    check_references(&content, &mut report);

    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.code == "unknown-text-item")
    );
}

#[test]
fn play_sfx_effect_counts_as_sfx_reference() {
    let scenario = r#"{
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "onEnter": [{ "type": "playSfx", "sfx": "alarm" }],
                "choices": []
            }
        }
    }"#;
    let assets = r#"{
        "sfx": {
            "alarm": { "src": "sfx/alarm.wav" }
        }
    }"#;

    let content = FORMAT
        .decode_bundle_str(
            &scenario_json(scenario),
            r#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            EMPTY_CHARACTERS,
            &wire_json(assets, "com.blackbox.assets.bundle", 1),
        )
        .expect("decode scenario with playSfx");

    let refs = collect_content_refs(&content);
    assert!(refs.sfx_ids.contains("alarm"));
}
