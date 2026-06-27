use blackbox::content::{GameContent, SkillCheckContent};
use blackbox::expr::{Expr, ExprValue};

use crate::report::{LintIssue, LintReport};
use crate::rules::LintContext;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NumberRange {
    min: i32,
    max: i32,
}

impl NumberRange {
    const fn exact(value: i32) -> Self {
        Self {
            min: value,
            max: value,
        }
    }

    const fn bool() -> Self {
        Self { min: 0, max: 1 }
    }

    const fn add(self, other: Self) -> Self {
        Self {
            min: self.min + other.min,
            max: self.max + other.max,
        }
    }

    const fn sub(self, other: Self) -> Self {
        Self {
            min: self.min - other.max,
            max: self.max - other.min,
        }
    }
}

pub fn check_skill_checks_rule(ctx: &LintContext<'_>, report: &mut LintReport) {
    let Some(content) = ctx.content else {
        return;
    };
    check_skill_checks(content, report);
}

pub fn check_skill_checks(content: &GameContent, report: &mut LintReport) {
    for node in content.nodes.values() {
        for choice in &node.choices {
            let Some(check) = &choice.resolution.check else {
                continue;
            };
            check_skill_check_balance(content, &node.id, &choice.presentation.id, check, report);
        }
    }
}

fn check_skill_check_balance(
    content: &GameContent,
    node_id: &str,
    choice_id: &str,
    check: &SkillCheckContent,
    report: &mut LintReport,
) {
    let Some(stat) = content.default_stats.get(&check.stat) else {
        return;
    };
    let Some(modifier) = modifier_range(check) else {
        return;
    };

    let sides = check.sides.max(1) as i32;
    let min_total = 1 + stat + modifier.min;
    let max_total = sides + stat + modifier.max;

    if max_total < check.difficulty {
        report.push(
            LintIssue::warning(
                "skill-check-impossible",
                format!(
                    "choice '{choice_id}' in node '{node_id}' skill check cannot succeed from default stat '{}': max total {max_total} is below difficulty {}",
                    check.stat, check.difficulty
                ),
            )
            .with_context(format!("node '{node_id}' choice '{choice_id}'")),
        );
    } else if min_total >= check.difficulty {
        report.push(
            LintIssue::warning(
                "skill-check-guaranteed",
                format!(
                    "choice '{choice_id}' in node '{node_id}' skill check cannot fail from default stat '{}': min total {min_total} meets difficulty {}",
                    check.stat, check.difficulty
                ),
            )
            .with_context(format!("node '{node_id}' choice '{choice_id}'")),
        );
    }
}

fn modifier_range(check: &SkillCheckContent) -> Option<NumberRange> {
    match &check.compiled_modifier {
        Some(expr) => expr_range(expr),
        None => Some(NumberRange::exact(0)),
    }
}

fn expr_range(expr: &Expr) -> Option<NumberRange> {
    match expr {
        Expr::Lit(ExprValue::Number(value)) => Some(NumberRange::exact(*value)),
        Expr::Lit(ExprValue::Bool(_)) => Some(NumberRange::bool()),
        Expr::Builtin(_) => Some(NumberRange::bool()),
        Expr::Var { var } => {
            if var.starts_with("flag.") || var.starts_with("visited.") || var.starts_with("atNode.")
            {
                Some(NumberRange::bool())
            } else {
                None
            }
        }
        Expr::Call { call, .. } if bool_call(call) => Some(NumberRange::bool()),
        Expr::Op { op, left, right } => {
            let right = right.as_deref();
            match (op.as_str(), expr_range(left), right.and_then(expr_range)) {
                ("+", Some(left), Some(right)) => Some(left.add(right)),
                ("-", Some(left), Some(right)) => Some(left.sub(right)),
                (
                    "==" | "eq" | "!=" | "neq" | ">" | "gt" | ">=" | "gte" | "<" | "lt" | "<="
                    | "lte",
                    _,
                    _,
                ) => Some(NumberRange::bool()),
                ("not" | "!", _, _) => Some(NumberRange::bool()),
                ("and" | "&&" | "or" | "||", _, _) => Some(NumberRange::bool()),
                _ => None,
            }
        }
        _ => None,
    }
}

fn bool_call(call: &str) -> bool {
    matches!(call, "hasFlag" | "hasItem" | "visited" | "atNode" | "not")
}
