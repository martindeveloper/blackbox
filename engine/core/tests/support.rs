#![allow(dead_code)]

use blackbox::Engine;
use blackbox_format::{JsonFormat, decode_scenario_bundle_json};

pub const ITEMS: &str = include_str!("../../../tests/fixtures/engine_scenario/items.json");
pub const CHARACTERS: &str =
    include_str!("../../../tests/fixtures/engine_scenario/characters.json");
pub const ASSETS: &str = include_str!("../../../tests/assets/assets.json");
pub const SCENARIO: &str = include_str!("../../../tests/fixtures/engine_scenario/scenario.json");
pub const LIBRARY: &str = include_str!("../../../tests/fixtures/engine_scenario/library.json");
pub const CHAPTERS: &[&str] = &[
    include_str!("../../../tests/fixtures/engine_scenario/chapter_hub.json"),
    include_str!("../../../tests/fixtures/engine_scenario/chapter_passage.json"),
];

pub const MINIMAL_CHARACTERS: &str = r#"{
  "spec": "com.blackbox.characters",
  "formatVersion": 1,
  "characters": {}
}"#;

pub const MINIMAL_ITEMS: &str = r#"{
  "spec": "com.blackbox.items",
  "formatVersion": 1,
  "items": {
    "key": { "id": "key", "name": "Key", "description": "A key." },
    "bolt": { "id": "bolt", "name": "Bolt", "description": "A bolt." },
    "access_card": {
      "id": "access_card",
      "name": "Access Card",
      "description": "A test access card."
    }
  }
}"#;

pub const MINIMAL_ASSETS: &str = include_str!("../../../tests/assets/assets.json");

pub fn scenario_json(inner: &str) -> String {
    wire_json(inner, "com.blackbox.scenario", 1)
}

pub fn items_json(inner: &str) -> String {
    wire_json(inner, "com.blackbox.items", 1)
}

pub fn characters_json(inner: &str) -> String {
    wire_json(inner, "com.blackbox.characters", 1)
}

pub fn assets_json(inner: &str) -> String {
    wire_json(inner, "com.blackbox.assets.bundle", 1)
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

pub fn minimal_items_json(item_ids: &[&str]) -> String {
    let mut entries = Vec::new();
    for id in item_ids {
        entries.push(format!(
            r#""{id}": {{ "id": "{id}", "name": "{id}", "description": "Test item." }}"#
        ));
    }
    items_json(&format!(r#""items": {{{}}}"#, entries.join(", ")))
}

pub fn load_engine(scenario: &str) -> Engine {
    load_engine_bundle(scenario, MINIMAL_ITEMS, MINIMAL_CHARACTERS, MINIMAL_ASSETS)
}

pub fn load_engine_with_assets(scenario: &str, assets: &str) -> Engine {
    load_engine_bundle(
        scenario,
        &minimal_items_json(&[]),
        MINIMAL_CHARACTERS,
        &assets_json(assets),
    )
}

pub fn load_engine_bundle(scenario: &str, items: &str, characters: &str, assets: &str) -> Engine {
    Engine::load_bundle(
        scenario_json(scenario),
        items,
        characters,
        assets,
        &JsonFormat,
    )
    .unwrap()
}

pub fn load_scenario_engine(scenario: &str) -> Engine {
    let chapters: Vec<Vec<u8>> = CHAPTERS
        .iter()
        .map(|chapter| chapter.as_bytes().to_vec())
        .collect();
    let content = decode_scenario_bundle_json(
        scenario.as_bytes(),
        ITEMS.as_bytes(),
        CHARACTERS.as_bytes(),
        ASSETS.as_bytes(),
        None::<&[u8]>,
        Some(LIBRARY.as_bytes()),
        chapters,
    )
    .unwrap();
    Engine::new_game(content).unwrap()
}

pub fn load_full_scenario_engine() -> Engine {
    load_scenario_engine(SCENARIO)
}
