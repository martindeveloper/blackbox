#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

impl Severity {
    pub fn label(self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warning => "warn",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LintIssue {
    pub severity: Severity,
    pub code: &'static str,
    pub message: String,
    pub context: Option<String>,
    #[serde(rename = "chapterFile", skip_serializing_if = "Option::is_none")]
    pub chapter_file: Option<String>,
    #[serde(rename = "nodeId", skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
}

impl LintIssue {
    pub fn error(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(Severity::Error, code, message)
    }

    pub fn warning(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(Severity::Warning, code, message)
    }

    pub fn info(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(Severity::Info, code, message)
    }

    fn new(severity: Severity, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            severity,
            code,
            message: message.into(),
            context: None,
            chapter_file: None,
            node_id: None,
        }
    }

    pub fn with_context(mut self, context: impl Into<String>) -> Self {
        self.context = Some(context.into());
        self
    }

    /// Attach the chapter file and node id when the rule knows them directly.
    #[allow(dead_code)]
    pub fn with_location(
        mut self,
        chapter_file: impl Into<String>,
        node_id: impl Into<String>,
    ) -> Self {
        self.chapter_file = Some(chapter_file.into());
        self.node_id = Some(node_id.into());
        self
    }

    pub fn enrich_location(
        &mut self,
        content: Option<&blackbox::content::GameContent>,
        index: Option<&crate::location::NodeLocationIndex>,
    ) {
        use crate::location::{extract_node_id_from_message, parse_node_location};

        if (self.chapter_file.is_none() || self.node_id.is_none())
            && let Some(context) = self.context.as_deref()
        {
            let (file, node) = parse_node_location(context);
            if self.chapter_file.is_none() {
                self.chapter_file = file;
            }
            if self.node_id.is_none() {
                self.node_id = node;
            }
        }

        if self.node_id.is_none() {
            self.node_id = extract_node_id_from_message(&self.message);
        }

        if self.chapter_file.is_none()
            && let (Some(content), Some(index), Some(node_id)) =
                (content, index, self.node_id.as_deref())
        {
            self.chapter_file = index.chapter_file_for_node(content, node_id);
        }

        if self.chapter_file.is_none()
            && let Some(context) = &self.context
            && (context.ends_with(".json") || context.contains(".json:"))
        {
            self.chapter_file = Some(context.clone());
        }
    }
}

#[derive(Debug, Default)]
pub struct LintReport {
    pub issues: Vec<LintIssue>,
}

impl LintReport {
    pub fn push(&mut self, issue: LintIssue) {
        self.issues.push(issue);
    }

    pub fn extend(&mut self, issues: impl IntoIterator<Item = LintIssue>) {
        self.issues.extend(issues);
    }

    pub fn has_errors(&self) -> bool {
        self.issues
            .iter()
            .any(|issue| issue.severity == Severity::Error)
    }

    pub fn error_count(&self) -> usize {
        self.issues
            .iter()
            .filter(|issue| issue.severity == Severity::Error)
            .count()
    }

    pub fn warning_count(&self) -> usize {
        self.issues
            .iter()
            .filter(|issue| issue.severity == Severity::Warning)
            .count()
    }

    pub fn info_count(&self) -> usize {
        self.issues
            .iter()
            .filter(|issue| issue.severity == Severity::Info)
            .count()
    }

    pub fn enrich_locations(
        &mut self,
        content: Option<&blackbox::content::GameContent>,
        index: Option<&crate::location::NodeLocationIndex>,
    ) {
        for issue in &mut self.issues {
            issue.enrich_location(content, index);
        }
    }

    pub fn render(&self, w: &mut String, quiet: bool) {
        use std::fmt::Write as _;
        let mut issues = self.issues.clone();
        issues.sort_by(|left, right| {
            left.severity
                .cmp(&right.severity)
                .reverse()
                .then_with(|| left.code.cmp(right.code))
                .then_with(|| left.message.cmp(&right.message))
        });

        for issue in issues {
            if quiet && issue.severity != Severity::Error {
                continue;
            }

            let location = format_issue_location(&issue);
            let context = issue
                .context
                .as_deref()
                .map(|value| format!(" ({value})"))
                .unwrap_or_default();

            let _ = writeln!(
                w,
                "[{}] {}{}: {}{}",
                issue.severity.label(),
                issue.code,
                location,
                issue.message,
                context
            );
        }
    }
}

#[derive(serde::Serialize)]
pub struct JsonSummary {
    pub errors: usize,
    pub warnings: usize,
    pub info: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonLintScenario {
    pub path: String,
    pub data_root: String,
    pub issues: Vec<LintIssue>,
    pub summary: JsonSummary,
    pub result: &'static str,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonLintOutput {
    pub kind: &'static str,
    pub scenario_count: usize,
    pub scenarios: Vec<JsonLintScenario>,
    pub total: JsonSummary,
    pub result: &'static str,
}

pub fn result_str(report: &LintReport) -> &'static str {
    if report.has_errors() {
        "failed"
    } else if report.warning_count() > 0 {
        "passed with warnings"
    } else {
        "passed"
    }
}

pub fn make_summary(report: &LintReport) -> JsonSummary {
    JsonSummary {
        errors: report.error_count(),
        warnings: report.warning_count(),
        info: report.info_count(),
    }
}

fn format_issue_location(issue: &LintIssue) -> String {
    match (&issue.chapter_file, &issue.node_id) {
        (Some(file), Some(node)) => format!(" @ {file} · {node}"),
        (Some(file), None) => format!(" @ {file}"),
        (None, Some(node)) => format!(" @ node {node}"),
        (None, None) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::location::NodeLocationIndex;

    #[test]
    fn enrich_location_from_context_and_message() {
        let mut issue = LintIssue::warning("unknown-speaker", "speaker 'x' is unknown")
            .with_context("data/ch1.json node 'intro' text[0] speaker 'x'");
        issue.enrich_location(None, None);
        assert_eq!(issue.chapter_file.as_deref(), Some("data/ch1.json"));
        assert_eq!(issue.node_id.as_deref(), Some("intro"));

        let mut issue = LintIssue::warning(
            "unreachable",
            "node 'orphan' is not reachable from start 'start'",
        );
        issue.enrich_location(None, None);
        assert_eq!(issue.node_id.as_deref(), Some("orphan"));
    }

    #[test]
    fn cli_render_includes_location() {
        let mut report = LintReport::default();
        report.push(
            LintIssue::warning("unreachable", "node 'foo' is not reachable")
                .with_location("chapter_a.json", "foo"),
        );

        let mut out = String::new();
        report.render(&mut out, false);
        assert!(out.contains("@ chapter_a.json · foo"));
    }

    #[test]
    fn json_serializes_camel_case_location_fields() {
        let issue =
            LintIssue::error("validation", "bad goto").with_location("chapter_a.json", "start");
        let json = serde_json::to_value(&issue).expect("serialize");
        assert_eq!(json["chapterFile"], "chapter_a.json");
        assert_eq!(json["nodeId"], "start");
    }

    #[test]
    fn chapter_file_resolved_from_loaded_content() {
        let scenario = std::path::Path::new("tests/fixtures/sample_scenario/scenario.json");
        if !scenario.is_file() {
            return;
        }

        let content = crate::scenario_io::load_bundle_from_path(scenario).expect("load");
        let index = NodeLocationIndex::new(scenario);
        let start = content.start_node_id.clone();

        let mut issue =
            LintIssue::warning("unreachable", format!("node '{start}' is not reachable"));
        issue.enrich_location(Some(&content), Some(&index));
        assert!(issue.chapter_file.is_some());
        assert_eq!(issue.node_id.as_deref(), Some(start.as_str()));
    }
}
