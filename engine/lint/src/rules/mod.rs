mod catalog;
mod characters;
mod library;
mod registry;
mod relationships;
mod source_bundle;
pub mod wire;

use std::path::{Path, PathBuf};

use blackbox::content::GameContent;

use crate::report::LintReport;

pub use registry::{RuleFilter, RulePhase, all_rules, run_rules};

/// Run only content-phase rules (bundle must be loaded).
pub fn lint_content(ctx: LintContext<'_>, report: &mut LintReport, filter: &RuleFilter) {
    run_rules(RulePhase::Content, &ctx, report, filter);
}

/// Shared context passed to every lint rule.
pub struct LintContext<'a> {
    pub scenario_path: &'a Path,
    pub data_root: &'a Path,
    /// Present only after the bundle loads successfully.
    pub content: Option<&'a GameContent>,
}

impl<'a> LintContext<'a> {
    pub fn with_content(self, content: &'a GameContent) -> Self {
        Self {
            content: Some(content),
            ..self
        }
    }
}

/// Run wire + source rules (no engine load), then content rules when `content` is available.
pub fn lint_scenario(ctx: &LintContext<'_>, filter: &RuleFilter) -> LintReport {
    let mut report = LintReport::default();

    run_rules(RulePhase::Wire, ctx, &mut report, filter);
    run_rules(RulePhase::Source, ctx, &mut report, filter);

    if ctx.content.is_some() {
        run_rules(RulePhase::Content, ctx, &mut report, filter);
    }

    report
}

pub fn resolve_data_root(target: &Path, data_root: Option<PathBuf>) -> PathBuf {
    if let Some(root) = data_root {
        return root;
    }

    if target.is_dir() && target.join("scenario.json").is_file() {
        return target.to_path_buf();
    }

    if target
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "scenario.json")
    {
        return target
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("data"));
    }

    if target.is_file() {
        return target
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("data"));
    }

    PathBuf::from("data")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn resolve_data_root_defaults_to_scenario_dir() {
        let target = Path::new("tests/fixtures/sample_scenario/scenario.json");
        let root = resolve_data_root(target, None);
        assert_eq!(root, PathBuf::from("tests/fixtures/sample_scenario"));
    }
}
