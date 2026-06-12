use std::collections::HashSet;

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;
use crate::rules::source_bundle::{
    collect_referenced_characters, declared_characters_from_documents,
    is_declared_relationship_metric, load_source_bundle, parse_relationship_text_var,
    resolve_character, visit_all_string_contexts, visit_content_nodes, walk_gate_nodes,
};

pub fn check_unknown_speakers(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let mut seen = HashSet::new();

    visit_content_nodes(&bundle.documents, |file, node_id, node| {
        if let Some(text_blocks) = node.get("text").and_then(|value| value.as_array()) {
            for (index, block) in text_blocks.iter().enumerate() {
                let Some(speaker) = block.get("speaker").and_then(|value| value.as_str()) else {
                    continue;
                };
                if resolve_character(speaker, &bundle) {
                    continue;
                }
                let context = format!("{file} node '{node_id}' text[{index}] speaker '{speaker}'");
                if !seen.insert(context.clone()) {
                    continue;
                }
                report.push(
                    LintIssue::warning(
                        "unknown-speaker",
                        format!("speaker '{speaker}' does not match any character id or name"),
                    )
                    .with_context(context),
                );
            }
        }
    });
}

pub fn check_unused_characters(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let declared = declared_characters_from_documents(&bundle.documents);
    if declared.is_empty() {
        return;
    }

    let referenced = collect_referenced_characters(&bundle.documents);

    let mut unused: Vec<&str> = declared
        .iter()
        .filter(|character| {
            !character
                .aliases
                .iter()
                .any(|alias| referenced.contains(alias))
        })
        .map(|character| character.id.as_str())
        .collect();
    unused.sort_unstable();

    for character_id in unused {
        report.push(LintIssue::info(
            "unused-character",
            format!("character '{character_id}' is declared but never referenced"),
        ));
    }
}

pub fn check_unknown_character_refs(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let mut seen = HashSet::new();

    visit_all_string_contexts(&bundle.documents, &mut |context| {
        record_unknown_character(context, &bundle, &mut seen, report);
    });
}

pub fn check_unknown_text_relationships(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let mut seen = HashSet::new();

    visit_all_string_contexts(&bundle.documents, &mut |context| {
        if !context.contains(" text {relationship.") {
            return;
        }
        let segment = context
            .split(" text {")
            .nth(1)
            .and_then(|rest| rest.strip_suffix('}'));
        let Some(segment) = segment else {
            return;
        };
        let Some((character_id, metric)) = parse_relationship_text_var(segment) else {
            return;
        };

        if !seen.insert(context.to_string()) {
            return;
        }

        if !bundle.characters.contains(character_id) {
            report.push(LintIssue::warning(
                "unknown-text-relationship",
                format!(
                    "text references unknown character '{character_id}' in {{relationship.{character_id}.{metric}}}"
                ),
            )
            .with_context(context));
            return;
        }

        if !is_declared_relationship_metric(
            &bundle.declared_relationship_metrics,
            character_id,
            metric,
        ) {
            report.push(LintIssue::error(
                "unknown-text-relationship",
                format!(
                    "text references undeclared relationship metric '{metric}' on character '{character_id}' in {{relationship.{character_id}.{metric}}}"
                ),
            )
            .with_context(context));
        }
    });
}

pub fn check_unknown_actors(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let mut seen = HashSet::new();

    fn check_gate(
        gate: &serde_json::Value,
        context: &str,
        characters: &HashSet<String>,
        seen: &mut HashSet<String>,
        report: &mut LintReport,
    ) {
        walk_gate_nodes(gate, context, &mut |gate_type, node, ctx| {
            if gate_type == "actorPresent"
                && let Some(cid) = node.get("characterId").and_then(serde_json::Value::as_str)
                && !characters.contains(cid)
                && seen.insert(ctx.to_string())
            {
                report.push(
                    LintIssue::error(
                        "unknown-actor",
                        format!("unknown character '{cid}' in actorPresent gate"),
                    )
                    .with_context(ctx),
                );
            }
        });
    }

    fn check_actor_id(
        character_id: &str,
        context: String,
        characters: &HashSet<String>,
        seen: &mut HashSet<String>,
        report: &mut LintReport,
    ) {
        if !characters.contains(character_id) && seen.insert(context.clone()) {
            report.push(
                LintIssue::error(
                    "unknown-actor",
                    format!("unknown character '{character_id}' in actor reference"),
                )
                .with_context(context),
            );
        }
    }

    visit_content_nodes(&bundle.documents, |file, node_id, node| {
        let base = format!("{file} node '{node_id}'");

        if let Some(text_blocks) = node.get("text").and_then(serde_json::Value::as_array) {
            for (index, block) in text_blocks.iter().enumerate() {
                if let Some(actor_id) = block.get("actor").and_then(serde_json::Value::as_str) {
                    check_actor_id(
                        actor_id,
                        format!("{base} text[{index}] actor"),
                        &bundle.characters,
                        &mut seen,
                        report,
                    );
                }
                for field in ["when", "unless"] {
                    if let Some(gate) = block.get(field) {
                        check_gate(
                            gate,
                            &format!("{base} text[{index}] {field}"),
                            &bundle.characters,
                            &mut seen,
                            report,
                        );
                    }
                }
            }
        }

        for field in ["when", "unless", "requires"] {
            if let Some(gate) = node.get(field) {
                check_gate(
                    gate,
                    &format!("{base} {field}"),
                    &bundle.characters,
                    &mut seen,
                    report,
                );
            }
        }

        if let Some(choices) = node.get("choices").and_then(serde_json::Value::as_array) {
            for (i, choice) in choices.iter().enumerate() {
                let choice_id = choice
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("?");
                let ctx = format!("{base} choice '{choice_id}'[{i}]");
                for field in ["when", "unless", "requires"] {
                    if let Some(gate) = choice.get(field) {
                        check_gate(
                            gate,
                            &format!("{ctx} {field}"),
                            &bundle.characters,
                            &mut seen,
                            report,
                        );
                    }
                }
                if let Some(effects) = choice.get("effects").and_then(serde_json::Value::as_array) {
                    for effect in effects {
                        if effect.get("type").and_then(serde_json::Value::as_str)
                            == Some("setActorPresent")
                            && let Some(cid) = effect
                                .get("characterId")
                                .and_then(serde_json::Value::as_str)
                        {
                            check_actor_id(
                                cid,
                                format!("{ctx} setActorPresent"),
                                &bundle.characters,
                                &mut seen,
                                report,
                            );
                        }
                    }
                }
            }
        }

        for effects_key in ["onEnter", "effects"] {
            if let Some(effects) = node.get(effects_key).and_then(serde_json::Value::as_array) {
                for effect in effects {
                    if effect.get("type").and_then(serde_json::Value::as_str)
                        == Some("setActorPresent")
                        && let Some(cid) = effect
                            .get("characterId")
                            .and_then(serde_json::Value::as_str)
                    {
                        check_actor_id(
                            cid,
                            format!("{base} {effects_key} setActorPresent"),
                            &bundle.characters,
                            &mut seen,
                            report,
                        );
                    }
                }
            }
        }
    });
}

fn record_unknown_character(
    context: &str,
    bundle: &crate::rules::source_bundle::SourceBundle,
    seen: &mut HashSet<String>,
    report: &mut LintReport,
) {
    let Some(character_id) = extract_character_id_from_context(context) else {
        return;
    };

    if bundle.characters.contains(character_id) {
        return;
    }

    if !seen.insert(context.to_string()) {
        return;
    }

    report.push(LintIssue::error(
        "unknown-character-ref",
        format!("unknown character '{character_id}' in {context}"),
    ));
}

fn extract_character_id_from_context(context: &str) -> Option<&str> {
    let marker = "characterId='";
    let start = context.find(marker)? + marker.len();
    let rest = &context[start..];
    let end = rest.find('\'')?;
    Some(&rest[..end])
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};

    use serde_json::json;

    use super::*;
    use crate::report::LintReport;
    use crate::rules::source_bundle::{SourceBundle, visit_content_nodes};

    #[test]
    fn unknown_speaker_is_reported() {
        let documents = vec![(
            "chapter.json".to_string(),
            json!({
                "nodes": {
                    "start": {
                        "id": "start",
                        "text": [
                            { "kind": "dialogue", "speaker": "ghost_voice", "text": "Hello." }
                        ],
                        "choices": []
                    }
                }
            }),
        )];
        let bundle = SourceBundle {
            characters: HashSet::from(["player".to_string()]),
            character_names: HashSet::new(),
            catalog_flags: HashSet::new(),
            declared_relationship_metrics: HashMap::new(),
            library_snippets: HashSet::new(),
            library_templates: HashSet::new(),
            library_conditions: HashSet::new(),
            scenario_library_ref: None,
            documents,
        };

        let mut report = LintReport::default();
        let mut seen = HashSet::new();

        visit_content_nodes(&bundle.documents, |file, node_id, node| {
            if let Some(text_blocks) = node.get("text").and_then(|value| value.as_array()) {
                for (index, block) in text_blocks.iter().enumerate() {
                    let Some(speaker) = block.get("speaker").and_then(|value| value.as_str())
                    else {
                        continue;
                    };
                    if resolve_character(speaker, &bundle) {
                        continue;
                    }
                    let context =
                        format!("{file} node '{node_id}' text[{index}] speaker '{speaker}'");
                    if !seen.insert(context.clone()) {
                        continue;
                    }
                    report.push(
                        LintIssue::warning(
                            "unknown-speaker",
                            format!("speaker '{speaker}' does not match any character id or name"),
                        )
                        .with_context(context),
                    );
                }
            }
        });

        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "unknown-speaker"),
            "expected unknown-speaker warning, got: {:?}",
            report.issues
        );
    }
}
