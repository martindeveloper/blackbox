use crate::condition::{Condition, condition_failure_reason};
use crate::error::EngineError;
use crate::expr::{self, Expr, ExprValue};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GateEval {
    Pass,
    Fail { reason: Option<String> },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Gate {
    All(Vec<Gate>),
    Any(Vec<Gate>),
    Not(Box<Gate>),
    Condition(Condition),
}

impl Gate {
    pub fn to_expr(&self) -> Result<Expr, EngineError> {
        match self {
            Gate::All(gates) => fold_bool_op("and", gates),
            Gate::Any(gates) => fold_bool_op("or", gates),
            Gate::Not(inner) => Ok(Expr::Op {
                op: "not".to_string(),
                left: Box::new(inner.to_expr()?),
                right: None,
            }),
            Gate::Condition(condition) => condition.to_expr(),
        }
    }

    pub fn is_pure(&self) -> bool {
        match self {
            Gate::All(gates) | Gate::Any(gates) => gates.iter().all(Gate::is_pure),
            Gate::Not(inner) => inner.is_pure(),
            Gate::Condition(_) => true,
        }
    }
}

fn fold_bool_op(op: &str, gates: &[Gate]) -> Result<Expr, EngineError> {
    if gates.is_empty() {
        let value = op == "and";
        return Ok(Expr::Lit(ExprValue::Bool(value)));
    }

    let mut iter = gates.iter();
    let mut expr = iter.next().expect("non-empty").to_expr()?;
    for gate in iter {
        expr = Expr::Op {
            op: op.to_string(),
            left: Box::new(expr),
            right: Some(Box::new(gate.to_expr()?)),
        };
    }
    Ok(expr)
}

pub fn evaluate_gate_readonly(
    ctx: &expr::ReadContext<'_>,
    when: Option<&Expr>,
    unless: Option<&Expr>,
) -> Result<bool, EngineError> {
    if let Some(expr) = when
        && !expr::evaluate_readonly_bool(ctx, expr)?
    {
        return Ok(false);
    }

    if let Some(expr) = unless
        && expr::evaluate_readonly_bool(ctx, expr)?
    {
        return Ok(false);
    }

    Ok(true)
}

pub fn evaluate_requirement_gate(
    ctx: &expr::ReadContext<'_>,
    gate: &Gate,
    fallback_reason: Option<&str>,
) -> Result<GateEval, EngineError> {
    match gate {
        Gate::All(gates) => {
            for child in gates {
                if let GateEval::Fail { reason } =
                    evaluate_requirement_gate(ctx, child, fallback_reason)?
                {
                    return Ok(GateEval::Fail { reason });
                }
            }
            Ok(GateEval::Pass)
        }
        Gate::Any(gates) => {
            let mut last_reason = None;
            for child in gates {
                match evaluate_requirement_gate(ctx, child, None)? {
                    GateEval::Pass => return Ok(GateEval::Pass),
                    GateEval::Fail { reason } => {
                        if last_reason.is_none() {
                            last_reason = reason;
                        }
                    }
                }
            }
            Ok(GateEval::Fail {
                reason: last_reason.or_else(|| fallback_reason.map(str::to_string)),
            })
        }
        Gate::Not(inner) => match evaluate_requirement_gate(ctx, inner, None)? {
            GateEval::Pass => Ok(GateEval::Fail {
                reason: fallback_reason.map(str::to_string),
            }),
            GateEval::Fail { .. } => Ok(GateEval::Pass),
        },
        Gate::Condition(condition) => {
            let expr = condition.to_expr()?;
            if expr::evaluate_readonly_bool(ctx, &expr)? {
                Ok(GateEval::Pass)
            } else {
                Ok(GateEval::Fail {
                    reason: Some(condition_failure_reason(condition, fallback_reason)),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::condition::Condition;

    #[test]
    fn not_has_item_compiles() {
        let gate = Gate::Not(Box::new(Gate::Condition(Condition::HasItem {
            item_id: "key".to_string(),
            count: 1,
            disabled_reason: None,
        })));
        let expr = gate.to_expr().unwrap();
        assert!(matches!(expr, Expr::Op { op, .. } if op == "not"));
        assert!(gate.is_pure());
    }

    #[test]
    fn top_level_all_folded_as_and() {
        let gate = Gate::All(vec![
            Gate::Condition(Condition::StatGte {
                stat: "logic".to_string(),
                value: 3,
                disabled_reason: None,
            }),
            Gate::Condition(Condition::HasItem {
                item_id: "key".to_string(),
                count: 1,
                disabled_reason: None,
            }),
        ]);
        let expr = gate.to_expr().unwrap();
        assert!(matches!(expr, Expr::Op { op, .. } if op == "and"));
    }
}
