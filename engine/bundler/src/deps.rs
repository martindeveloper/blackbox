use std::collections::{BTreeMap, BTreeSet};

use blackbox::content::{Effect, GameContent, NodeContent};

#[derive(Debug, Clone, Default)]
pub struct AssetSplit {
    pub shared_srcs: BTreeSet<String>,
    pub chapter_srcs: BTreeMap<String, BTreeSet<String>>,
}

pub fn split_assets_by_chapter(content: &GameContent) -> AssetSplit {
    let mut chapter_refs: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for chapter in &content.chapters {
        chapter_refs.insert(chapter.id.clone(), BTreeSet::new());
    }

    for (node_id, node) in &content.nodes {
        let Some(chapter_id) = content.node_chapter.get(node_id) else {
            continue;
        };
        let Some(refs) = chapter_refs.get_mut(chapter_id) else {
            continue;
        };
        collect_node_asset_refs(content, node, refs);
    }

    if let Some(default_sfx) = content.assets.default_choice_sfx.as_deref() {
        fan_out_asset_ref(&mut chapter_refs, default_sfx);
    }

    for item in content.items.items.values() {
        if let Some(icon_ref) = &item.icon_ref {
            fan_out_asset_ref(&mut chapter_refs, icon_ref);
        }
    }

    let mut src_chapters: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (chapter_id, refs) in &chapter_refs {
        for asset_ref in refs {
            let Some(src) = content.assets.src_for_ref(asset_ref) else {
                continue;
            };
            src_chapters
                .entry(src)
                .or_default()
                .insert(chapter_id.clone());
        }
    }

    let mut split = AssetSplit::default();
    for (src, chapters) in src_chapters {
        if chapters.len() > 1 {
            split.shared_srcs.insert(src);
        } else if let Some(chapter_id) = chapters.into_iter().next() {
            split
                .chapter_srcs
                .entry(chapter_id)
                .or_default()
                .insert(src);
        }
    }

    split
}

fn fan_out_asset_ref(chapter_refs: &mut BTreeMap<String, BTreeSet<String>>, asset_ref: &str) {
    for refs in chapter_refs.values_mut() {
        refs.insert(asset_ref.to_string());
    }
}

fn collect_node_asset_refs(content: &GameContent, node: &NodeContent, refs: &mut BTreeSet<String>) {
    if let Some(background_ref) = &node.background_ref {
        refs.insert(background_ref.clone());
    }

    for block in &node.text {
        if let Some(speaker) = &block.speaker
            && let Some(character) = content
                .characters
                .characters
                .values()
                .find(|character| character.id == *speaker || character.name == *speaker)
            && let Some(portrait_ref) = &character.portrait_ref
        {
            refs.insert(portrait_ref.clone());
        }
    }

    collect_effects_asset_refs(content, &node.on_enter, refs);

    for choice in &node.choices {
        if let Some(sfx) = &choice.presentation.sfx {
            refs.insert(sfx.clone());
        }
        collect_effects_asset_refs(content, &choice.resolution.effects, refs);
        if let Some(check) = &choice.resolution.check {
            collect_effects_asset_refs(content, &check.on_success.effects, refs);
            collect_effects_asset_refs(content, &check.on_failure.effects, refs);
        }
    }
}

fn collect_effects_asset_refs(
    content: &GameContent,
    effects: &[Effect],
    refs: &mut BTreeSet<String>,
) {
    for effect in effects {
        if let Effect::PlayMusic { track } = effect {
            refs.insert(track.clone());
        }
        if let Effect::PlaySfx { sfx } = effect {
            refs.insert(sfx.clone());
        }
        if let Effect::AddItem { item_id, .. } = effect
            && let Some(item) = content.items.get(item_id)
            && let Some(icon_ref) = &item.icon_ref
        {
            refs.insert(icon_ref.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scenario_io::{decode_scenario_bundle_files, read_scenario_bundle_files};
    use std::path::Path;

    #[test]
    fn default_choice_sfx_is_shared_across_chapters() {
        let scenario = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/sample_scenario/scenario.json");
        let files = read_scenario_bundle_files(&scenario).expect("read");
        let content = decode_scenario_bundle_files(&files).expect("decode");
        let split = split_assets_by_chapter(&content);

        assert!(split.shared_srcs.contains("sfx/click.wav"));
    }
}
