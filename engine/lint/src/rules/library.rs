use std::collections::HashSet;

use serde_json::Value;

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;
use crate::rules::source_bundle::{
    is_library_document, load_source_bundle, snippet_id_from_text_entry, visit_content_nodes,
    walk_gate_nodes,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum LibraryRefKind {
    Snippet,
    Extends,
    ConditionRef,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct LibraryRefUsage {
    context: String,
    kind: LibraryRefKind,
    id: String,
}

pub fn check_library_refs(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let refs = collect_library_refs(&bundle.documents);
    let has_library = bundle.scenario_library_ref.is_some();
    let mut seen = HashSet::new();

    for usage in refs {
        if !seen.insert(usage.clone()) {
            continue;
        }

        match usage.kind {
            LibraryRefKind::Snippet => {
                if !has_library {
                    report.push(
                        LintIssue::error(
                            "library-ref-missing",
                            format!(
                                "snippet '@{}' is referenced but scenario has no libraryRef",
                                usage.id
                            ),
                        )
                        .with_context(usage.context),
                    );
                    continue;
                }
                if !bundle.library_snippets.contains(&usage.id) {
                    report.push(
                        LintIssue::error(
                            "unknown-snippet",
                            format!("unknown snippet '@{}' (not defined in library)", usage.id),
                        )
                        .with_context(usage.context),
                    );
                }
            }
            LibraryRefKind::Extends => {
                if !has_library {
                    report.push(
                        LintIssue::error(
                            "library-ref-missing",
                            format!(
                                "node extends template '{}' but scenario has no libraryRef",
                                usage.id
                            ),
                        )
                        .with_context(usage.context),
                    );
                    continue;
                }
                if !bundle.library_templates.contains(&usage.id) {
                    report.push(
                        LintIssue::error(
                            "unknown-template",
                            format!(
                                "unknown template '{}' ($extends not defined in library)",
                                usage.id
                            ),
                        )
                        .with_context(usage.context),
                    );
                }
            }
            LibraryRefKind::ConditionRef => {
                if !has_library {
                    report.push(
                        LintIssue::error(
                            "library-ref-missing",
                            format!(
                                "condition ref '{}' is used but scenario has no libraryRef",
                                usage.id
                            ),
                        )
                        .with_context(usage.context),
                    );
                    continue;
                }
                if !bundle.library_conditions.contains(&usage.id) {
                    report.push(
                        LintIssue::error(
                            "unknown-condition",
                            format!(
                                "unknown named condition '{}' (not defined in library conditions)",
                                usage.id
                            ),
                        )
                        .with_context(usage.context),
                    );
                }
            }
        }
    }

    check_template_snippet_refs(&bundle.documents, &bundle.library_snippets, report);
}

fn collect_library_refs(documents: &[(String, Value)]) -> Vec<LibraryRefUsage> {
    let mut refs = Vec::new();

    visit_content_nodes(documents, |file, node_id, node| {
        let base = format!("{file} node '{node_id}'");
        collect_snippet_refs_from_text(
            node.get("text").and_then(Value::as_array),
            &base,
            &mut refs,
        );
        if let Some(template_id) = node.get("$extends").and_then(Value::as_str) {
            refs.push(LibraryRefUsage {
                context: format!("{base} $extends"),
                kind: LibraryRefKind::Extends,
                id: template_id.to_string(),
            });
        }
        collect_condition_refs_from_node(node, &base, &mut refs);
    });

    for (file, value) in documents {
        if let Some(death_node) = value.get("deathNode") {
            let base = format!("{file} node '__death__'");
            collect_snippet_refs_from_text(
                death_node.get("text").and_then(Value::as_array),
                &base,
                &mut refs,
            );
            if let Some(template_id) = death_node.get("$extends").and_then(Value::as_str) {
                refs.push(LibraryRefUsage {
                    context: format!("{base} $extends"),
                    kind: LibraryRefKind::Extends,
                    id: template_id.to_string(),
                });
            }
            collect_condition_refs_from_node(death_node, &base, &mut refs);
        }
    }

    refs
}

/// Walk all gate fields in a node looking for `{ "type": "condition", "id": "..." }` refs.
fn collect_condition_refs_from_node(node: &Value, base: &str, refs: &mut Vec<LibraryRefUsage>) {
    for field in ["when", "unless", "requires"] {
        if let Some(gate) = node.get(field) {
            collect_condition_refs_from_gate(gate, &format!("{base} {field}"), refs);
        }
    }
    if let Some(text) = node.get("text").and_then(Value::as_array) {
        for (i, block) in text.iter().enumerate() {
            for field in ["when", "unless"] {
                if let Some(gate) = block.get(field) {
                    collect_condition_refs_from_gate(
                        gate,
                        &format!("{base} text[{i}] {field}"),
                        refs,
                    );
                }
            }
        }
    }
    if let Some(choices) = node.get("choices").and_then(Value::as_array) {
        for (i, choice) in choices.iter().enumerate() {
            let choice_id = choice.get("id").and_then(Value::as_str).unwrap_or("?");
            let ctx = format!("{base} choice '{choice_id}'[{i}]");
            for field in ["when", "unless", "requires"] {
                if let Some(gate) = choice.get(field) {
                    collect_condition_refs_from_gate(gate, &format!("{ctx} {field}"), refs);
                }
            }
        }
    }
}

fn collect_condition_refs_from_gate(gate: &Value, context: &str, refs: &mut Vec<LibraryRefUsage>) {
    walk_gate_nodes(gate, context, &mut |gate_type, node, ctx| {
        if gate_type == "condition"
            && let Some(id) = node.get("id").and_then(Value::as_str)
        {
            refs.push(LibraryRefUsage {
                context: ctx.to_string(),
                kind: LibraryRefKind::ConditionRef,
                id: id.to_string(),
            });
        }
    });
}

fn collect_snippet_refs_from_text(
    text: Option<&Vec<Value>>,
    base: &str,
    refs: &mut Vec<LibraryRefUsage>,
) {
    let Some(text) = text else {
        return;
    };
    for (index, entry) in text.iter().enumerate() {
        let Some(snippet_id) = snippet_id_from_text_entry(entry) else {
            continue;
        };
        refs.push(LibraryRefUsage {
            context: format!("{base} text[{index}]"),
            kind: LibraryRefKind::Snippet,
            id: snippet_id,
        });
    }
}

fn check_template_snippet_refs(
    documents: &[(String, Value)],
    library_snippets: &HashSet<String>,
    report: &mut LintReport,
) {
    let mut seen = HashSet::new();

    for (file, value) in documents {
        if !is_library_document(value) {
            continue;
        }
        let Some(templates) = value.get("templates").and_then(Value::as_object) else {
            continue;
        };
        for (template_id, template) in templates {
            let Some(text) = template.get("text").and_then(Value::as_array) else {
                continue;
            };
            for (index, entry) in text.iter().enumerate() {
                let Some(snippet_id) = snippet_id_from_text_entry(entry) else {
                    continue;
                };
                let context = format!("{file} template '{template_id}' text[{index}]");
                if !seen.insert(format!("{context}:{snippet_id}")) {
                    continue;
                }
                if !library_snippets.contains(&snippet_id) {
                    report.push(
                        LintIssue::error(
                            "unknown-snippet",
                            format!(
                                "unknown snippet '@{snippet_id}' (not defined in library templates/snippets)"
                            ),
                        )
                        .with_context(context),
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};

    use serde_json::json;

    use super::*;
    use crate::report::LintReport;
    use crate::rules::source_bundle::SourceBundle;

    fn sample_bundle(
        documents: Vec<(String, Value)>,
        library_snippets: HashSet<String>,
        library_templates: HashSet<String>,
    ) -> SourceBundle {
        SourceBundle {
            characters: HashSet::new(),
            character_names: HashSet::new(),
            catalog_flags: HashSet::new(),
            declared_relationship_metrics: HashMap::new(),
            library_snippets,
            library_templates,
            library_conditions: HashSet::new(),
            scenario_library_ref: Some("library.json".to_string()),
            documents,
        }
    }

    #[test]
    fn unknown_snippet_in_chapter_is_reported() {
        let bundle = sample_bundle(
            vec![
                (
                    "library.json".to_string(),
                    json!({
                        "spec": "com.blackbox.library",
                        "formatVersion": 1,
                        "snippets": {},
                        "templates": {}
                    }),
                ),
                (
                    "chapter.json".to_string(),
                    json!({
                        "nodes": {
                            "intro": {
                                "id": "intro",
                                "text": ["@missing"],
                                "choices": []
                            }
                        }
                    }),
                ),
            ],
            HashSet::new(),
            HashSet::new(),
        );

        let refs = collect_library_refs(&bundle.documents);
        let mut report = LintReport::default();
        let mut seen = HashSet::new();
        for usage in refs {
            if !seen.insert(usage.clone()) {
                continue;
            }
            if usage.kind == LibraryRefKind::Snippet && !bundle.library_snippets.contains(&usage.id)
            {
                report.push(
                    LintIssue::error(
                        "unknown-snippet",
                        format!("unknown snippet '@{}'", usage.id),
                    )
                    .with_context(usage.context),
                );
            }
        }

        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "unknown-snippet"),
            "expected unknown-snippet, got {:?}",
            report.issues
        );
    }

    #[test]
    fn unknown_template_extends_is_reported() {
        let bundle = sample_bundle(
            vec![
                (
                    "library.json".to_string(),
                    json!({
                        "spec": "com.blackbox.library",
                        "formatVersion": 1,
                        "snippets": {},
                        "templates": {}
                    }),
                ),
                (
                    "chapter.json".to_string(),
                    json!({
                        "nodes": {
                            "death": {
                                "id": "death",
                                "$extends": "missing_tpl",
                                "choices": []
                            }
                        }
                    }),
                ),
            ],
            HashSet::new(),
            HashSet::new(),
        );

        let refs = collect_library_refs(&bundle.documents);
        assert!(
            refs.iter()
                .any(|usage| usage.kind == LibraryRefKind::Extends && usage.id == "missing_tpl")
        );
    }

    #[test]
    fn template_snippet_must_exist_in_library() {
        let documents = vec![(
            "library.json".to_string(),
            json!({
                "spec": "com.blackbox.library",
                "formatVersion": 1,
                "snippets": {},
                "templates": {
                    "game_over": {
                        "text": ["@hud_vitals"]
                    }
                }
            }),
        )];
        let mut report = LintReport::default();
        check_template_snippet_refs(&documents, &HashSet::new(), &mut report);
        assert!(
            report
                .issues
                .iter()
                .any(|issue| issue.code == "unknown-snippet"),
            "expected unknown-snippet in template, got {:?}",
            report.issues
        );
    }
}
