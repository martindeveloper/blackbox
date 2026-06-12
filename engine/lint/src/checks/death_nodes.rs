use std::collections::HashSet;

use blackbox::content::{ChoiceContent, Effect, GameContent, NodeContent};

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_death_node_coverage_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_death_node_coverage(content, report);
}

pub fn death_redirect_node_ids(content: &GameContent) -> HashSet<String> {
    let mut ids = HashSet::new();
    if let Some(id) = &content.death_node_id {
        ids.insert(id.clone());
    }
    for chapter in &content.chapters {
        if let Some(id) = &chapter.death_node_id {
            ids.insert(id.clone());
        }
    }
    ids
}

pub fn check_death_node_coverage(content: &GameContent, report: &mut LintReport) {
    if !content_has_hp_damage(content) {
        return;
    }

    if content.chapters.is_empty() {
        if content.death_node_id.is_none() {
            report.push(LintIssue::error(
                "missing-death-node",
                "scenario can reduce HP but has no deathNode — vitals failure has nowhere to redirect",
            ));
        }
        return;
    }

    for chapter in &content.chapters {
        if !chapter_is_loaded(content, &chapter.id) {
            continue;
        }
        if !chapter_has_hp_damage(content, &chapter.id) {
            continue;
        }

        let effective = chapter
            .death_node_id
            .as_ref()
            .or(content.death_node_id.as_ref());
        if effective.is_some() {
            continue;
        }

        report.push(LintIssue::error(
            "missing-death-node",
            format!(
                "chapter '{}' can reduce HP but has no deathNodeId and scenario has no deathNode — vitals failure has nowhere to redirect",
                chapter.id
            ),
        ));
    }
}

fn chapter_is_loaded(content: &GameContent, chapter_id: &str) -> bool {
    content
        .node_chapter
        .values()
        .any(|owner| owner == chapter_id)
}

fn content_has_hp_damage(content: &GameContent) -> bool {
    content.nodes.values().any(node_reduces_hp)
}

fn chapter_has_hp_damage(content: &GameContent, chapter_id: &str) -> bool {
    content.nodes.iter().any(|(node_id, node)| {
        content
            .node_chapter
            .get(node_id)
            .is_some_and(|owner| owner == chapter_id)
            && node_reduces_hp(node)
    })
}

fn node_reduces_hp(node: &NodeContent) -> bool {
    if effects_reduce_hp(&node.on_enter) {
        return true;
    }

    for choice in &node.choices {
        if choice_reduces_hp(choice) {
            return true;
        }
    }

    false
}

fn choice_reduces_hp(choice: &ChoiceContent) -> bool {
    if effects_reduce_hp(&choice.resolution.effects) {
        return true;
    }

    let Some(check) = &choice.resolution.check else {
        return false;
    };

    effects_reduce_hp(&check.on_success.effects) || effects_reduce_hp(&check.on_failure.effects)
}

fn effects_reduce_hp(effects: &[Effect]) -> bool {
    effects.iter().any(|effect| {
        matches!(
            effect,
            Effect::ModifyStat { stat, amount, .. } if stat == "hp" && amount.is_some_and(|amount| amount < 0)
        )
    })
}

#[cfg(test)]
mod tests {
    use blackbox_format::JsonFormat;

    use super::{check_death_node_coverage, death_redirect_node_ids};
    use crate::report::LintReport;

    const FORMAT: JsonFormat = JsonFormat;

    fn decode(scenario: &str, assets: &str) -> blackbox::GameContent {
        FORMAT
            .decode_bundle_str(
                &format!(
                    r#"{{"spec":"com.blackbox.scenario","formatVersion":1,{}}}"#,
                    scenario.trim_start_matches('{').trim_end_matches('}')
                ),
                r#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
                r#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{}}"#,
                assets,
            )
            .expect("decode bundle")
    }

    #[test]
    fn death_redirect_ids_include_scenario_death_node() {
        let content = decode(
            r#"{
                "deathNode": { "title": "Dead", "text": [], "choices": [] },
                "startNodeId": "start",
                "nodes": { "start": { "id": "start", "choices": [] } }
            }"#,
            r#"{"spec":"com.blackbox.assets.bundle","formatVersion":1}"#,
        );

        let ids = death_redirect_node_ids(&content);
        assert!(ids.contains("__death__"));
    }

    #[test]
    fn missing_death_node_is_reported_when_hp_damage_has_no_redirect() {
        let content = decode(
            r#"{
                "startNodeId": "start",
                "defaultStats": { "hp": 10, "max_hp": 10 },
                "nodes": {
                    "start": {
                        "id": "start",
                        "choices": [{
                            "id": "hurt",
                            "label": "Hurt",
                            "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -1 }],
                            "goto": "start"
                        }]
                    }
                }
            }"#,
            r#"{"spec":"com.blackbox.assets.bundle","formatVersion":1}"#,
        );

        let mut report = LintReport::default();
        check_death_node_coverage(&content, &mut report);

        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "missing-death-node")
        );
    }
}
