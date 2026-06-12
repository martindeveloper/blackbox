use std::path::Path;

use blackbox::EngineError;
use blackbox::content::GameContent;
use blackbox::validation::validate_content;

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

pub fn check_engine_validation_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_engine_validation(ctx.scenario_path, content, report);
}

pub fn check_engine_validation(
    scenario_path: &Path,
    content: &GameContent,
    report: &mut LintReport,
) {
    let mut content = content.clone();
    if let Err(error) = validate_content(&mut content) {
        let (code, message) = map_engine_error(error);
        report.push(
            LintIssue::error(code, message).with_context(scenario_path.display().to_string()),
        );
    }
}

fn map_engine_error(error: EngineError) -> (&'static str, String) {
    match error {
        EngineError::ContentDecodeError { message, .. } => ("syntax", message),
        EngineError::ValidationError(message) => ("validation", message),
        EngineError::ExpressionError(message) => ("expression", message),
        other => ("engine", other.to_string()),
    }
}
