mod support;

use blackbox::content::NodeMode;

#[test]
fn debug_goto_and_inventory_mutations_refresh_the_view() {
    let mut engine = support::load_engine_bundle(
        r#"{
            "startNodeId": "start",
            "nodes": {
                "start": { "id": "start", "choices": [] },
                "target": {
                    "id": "target",
                    "onEnter": [{ "type": "addItem", "itemId": "key", "count": 1 }],
                    "choices": []
                }
            }
        }"#,
        support::MINIMAL_ITEMS,
        support::CHARACTERS,
        support::ASSETS,
    );

    let view = engine.debug_goto_node("target").expect("goto target");
    assert_eq!(view.node_id, "target");
    assert_eq!(view.inventory.get("key"), Some(&1));

    let view = engine.debug_add_item("key", 2).expect("add item");
    assert_eq!(view.inventory.get("key"), Some(&3));

    let view = engine.debug_remove_item("key", 9).expect("remove item");
    assert_eq!(view.inventory.get("key"), None);
}

#[test]
fn debug_kill_uses_the_configured_death_redirect() {
    let mut engine = support::load_engine(
        r#"{
            "startNodeId": "start",
            "defaultStats": { "hp": 5 },
            "deathNode": {
                "title": "Dead",
                "text": [],
                "choices": []
            },
            "nodes": {
                "start": { "id": "start", "choices": [] }
            }
        }"#,
    );

    let view = engine.debug_kill_player().expect("kill player");
    assert_eq!(view.node_id, "__death__");
    assert_eq!(view.mode, NodeMode::GameOver);
    assert_eq!(view.player_stats["hp"], 0);
}
