use std::collections::HashSet;

use serde_json::Value;

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;
use crate::rules::source_bundle::{is_library_document, load_source_bundle, visit_content_nodes};

pub fn check_literal_quoted_text(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(bundle) = load_source_bundle(ctx.scenario_path, report) else {
        return;
    };

    let mut seen = HashSet::new();

    visit_content_nodes(&bundle.documents, |file, node_id, node| {
        if let Some(text_blocks) = node.get("text").and_then(Value::as_array) {
            for (index, block) in text_blocks.iter().enumerate() {
                let context = format!("{file} node '{node_id}' text[{index}]");
                check_text_block_fields(block, &context, &mut seen, report);
            }
        }
    });

    for (file, document) in &bundle.documents {
        if !is_library_document(document) {
            continue;
        }
        let Some(snippets) = document.get("snippets").and_then(Value::as_object) else {
            continue;
        };
        for (snippet_id, snippet) in snippets {
            let context = format!("{file} snippet '{snippet_id}'");
            check_text_block_fields(snippet, &context, &mut seen, report);
        }
    }
}

fn check_text_block_fields(
    block: &Value,
    context: &str,
    seen: &mut HashSet<String>,
    report: &mut LintReport,
) {
    if !block.is_object() {
        return;
    }

    if let Some(text) = block.get("text").and_then(Value::as_str) {
        suggest_literal_quotes(block, text, "text", context, seen, report);
    }

    if let Some(else_text) = block.get("else").and_then(Value::as_str) {
        suggest_literal_quotes(block, else_text, "else", context, seen, report);
    }
}

fn suggest_literal_quotes(
    block: &Value,
    text: &str,
    field: &str,
    context: &str,
    seen: &mut HashSet<String>,
    report: &mut LintReport,
) {
    if !is_literal_quoted_text(text) {
        return;
    }

    if style_includes_quoted(block) {
        return;
    }

    let issue_context = format!("{context} {field}");
    if !seen.insert(issue_context.clone()) {
        return;
    }

    let inner = strip_literal_quotes(text);
    report.push(
        LintIssue::info(
            "literal-quoted-text",
            format!(
                "{field} wraps content in literal quote characters; use \"style\": [\"quoted\"] and set \"{field}\" to {inner:?} instead of {text:?}"
            ),
        )
        .with_context(issue_context),
    );
}

fn is_literal_quoted_text(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() >= 2 && bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"'
}

fn strip_literal_quotes(text: &str) -> &str {
    &text[1..text.len() - 1]
}

fn style_includes_quoted(block: &Value) -> bool {
    block
        .get("style")
        .and_then(Value::as_array)
        .is_some_and(|styles| {
            styles.iter().any(|style| {
                style
                    .as_str()
                    .is_some_and(|value| value.trim().eq_ignore_ascii_case("quoted"))
            })
        })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn flags_literal_quotes_and_suggests_style() {
        let block = json!({
            "kind": "dialogue",
            "speaker": "AI",
            "text": "\"Present valid credentials.\""
        });
        let mut report = LintReport::default();
        let mut seen = HashSet::new();
        check_text_block_fields(
            &block,
            "chapter_test.json node 'intro' text[0]",
            &mut seen,
            &mut report,
        );

        assert!(
            report.issues.iter().any(|issue| {
                issue.code == "literal-quoted-text"
                    && issue.message.contains("style")
                    && issue.message.contains("Present valid credentials.")
            }),
            "expected literal-quoted-text suggestion, got: {:?}",
            report.issues
        );
    }

    #[test]
    fn skips_blocks_that_already_use_quoted_style() {
        assert!(!style_includes_quoted(&json!({})));
        assert!(style_includes_quoted(&json!({ "style": ["quoted"] })));
        assert!(style_includes_quoted(
            &json!({ "style": ["terminal", "quoted"] })
        ));
    }

    #[test]
    fn detects_wrapped_literal_quotes() {
        assert!(is_literal_quoted_text("\"Hello.\""));
        assert!(!is_literal_quoted_text("Hello."));
        assert!(!is_literal_quoted_text("\"Hello"));
    }
}
