use crate::error::EngineError;
use crate::expr::{self, BuiltinVar, Expr, ExprValue};
use crate::value::DynamicValue;

#[derive(Debug, Clone, PartialEq)]
pub enum Condition {
    HasItem {
        item_id: String,
        count: u32,
        disabled_reason: Option<String>,
    },
    HasFlag {
        flag: String,
        value: Option<DynamicValue>,
        disabled_reason: Option<String>,
    },
    StatGte {
        stat: String,
        value: i32,
        disabled_reason: Option<String>,
    },
    StatLte {
        stat: String,
        value: i32,
        disabled_reason: Option<String>,
    },
    StatEq {
        stat: String,
        value: i32,
        disabled_reason: Option<String>,
    },
    Visited {
        node_id: String,
        disabled_reason: Option<String>,
    },
    AtNode {
        node_id: String,
        disabled_reason: Option<String>,
    },
    RelationshipGte {
        character_id: String,
        metric: String,
        value: i32,
        disabled_reason: Option<String>,
    },
    RelationshipLte {
        character_id: String,
        metric: String,
        value: i32,
        disabled_reason: Option<String>,
    },
    RelationshipEq {
        character_id: String,
        metric: String,
        value: i32,
        disabled_reason: Option<String>,
    },
    /// Character is currently present/active in the scene.
    /// Compiles to `hasFlag("_actor_<id>", true)` at runtime.
    ActorPresent {
        character_id: String,
        disabled_reason: Option<String>,
    },
}

impl Condition {
    pub fn disabled_reason(&self) -> Option<&str> {
        match self {
            Condition::HasItem {
                disabled_reason, ..
            }
            | Condition::HasFlag {
                disabled_reason, ..
            }
            | Condition::StatGte {
                disabled_reason, ..
            }
            | Condition::StatLte {
                disabled_reason, ..
            }
            | Condition::StatEq {
                disabled_reason, ..
            }
            | Condition::Visited {
                disabled_reason, ..
            }
            | Condition::AtNode {
                disabled_reason, ..
            }
            | Condition::RelationshipGte {
                disabled_reason, ..
            }
            | Condition::RelationshipLte {
                disabled_reason, ..
            }
            | Condition::RelationshipEq {
                disabled_reason, ..
            }
            | Condition::ActorPresent {
                disabled_reason, ..
            } => disabled_reason.as_deref(),
        }
    }
}

impl Condition {
    pub fn to_expr(&self) -> Result<Expr, EngineError> {
        match self {
            Condition::HasItem { item_id, count, .. } => Ok(Expr::Call {
                call: "hasItem".to_string(),
                args: vec![
                    Expr::Lit(ExprValue::String(item_id.clone())),
                    Expr::Lit(ExprValue::Number(*count as i32)),
                ],
            }),
            Condition::HasFlag { flag, value, .. } => match value {
                Some(expected) => Ok(Expr::Call {
                    call: "hasFlag".to_string(),
                    args: vec![
                        Expr::Lit(ExprValue::String(flag.clone())),
                        Expr::Lit(expr::dynamic_value_to_expr_lit(expected)?),
                    ],
                }),
                None => Ok(Expr::Builtin(BuiltinVar::HasFlag(flag.clone()))),
            },
            Condition::StatGte { stat, value, .. } => stat_compare_expr(stat, "gte", *value),
            Condition::StatLte { stat, value, .. } => stat_compare_expr(stat, "lte", *value),
            Condition::StatEq { stat, value, .. } => stat_compare_expr(stat, "eq", *value),
            Condition::Visited { node_id, .. } => {
                Ok(Expr::Builtin(BuiltinVar::Visited(node_id.clone())))
            }
            Condition::AtNode { node_id, .. } => {
                Ok(Expr::Builtin(BuiltinVar::AtNode(node_id.clone())))
            }
            Condition::RelationshipGte {
                character_id,
                metric,
                value,
                ..
            } => relationship_compare_expr(character_id, metric, "gte", *value),
            Condition::RelationshipLte {
                character_id,
                metric,
                value,
                ..
            } => relationship_compare_expr(character_id, metric, "lte", *value),
            Condition::RelationshipEq {
                character_id,
                metric,
                value,
                ..
            } => relationship_compare_expr(character_id, metric, "eq", *value),
            Condition::ActorPresent { character_id, .. } => Ok(Expr::Call {
                call: "hasFlag".to_string(),
                args: vec![
                    Expr::Lit(ExprValue::String(actor_flag_key(character_id))),
                    Expr::Lit(ExprValue::Bool(true)),
                ],
            }),
        }
    }
}

/// Synthetic flag key used to track actor presence in `GameState.flags`.
/// Prefix is reserved — authors must not write raw `setFlag`/`hasFlag` against it.
pub fn actor_flag_key(character_id: &str) -> String {
    format!("_actor_{character_id}")
}

fn stat_compare_expr(stat: &str, op: &str, value: i32) -> Result<Expr, EngineError> {
    Ok(Expr::Op {
        op: op.to_string(),
        left: Box::new(Expr::Var {
            var: format!("stat.{stat}"),
        }),
        right: Some(Box::new(Expr::Lit(ExprValue::Number(value)))),
    })
}

pub fn condition_failure_reason(condition: &Condition, fallback: Option<&str>) -> String {
    condition
        .disabled_reason()
        .map(str::to_string)
        .or_else(|| fallback.map(str::to_string))
        .unwrap_or_else(|| describe_failure(condition))
}

pub fn describe_failure(condition: &Condition) -> String {
    match condition {
        Condition::HasItem { item_id, count, .. } => format!("Requires item: {item_id} ×{count}"),
        Condition::HasFlag { flag, .. } => format!("Requires flag: {flag}"),
        Condition::StatGte { stat, value, .. } => format!("Requires {stat} ≥ {value}"),
        Condition::StatLte { stat, value, .. } => format!("Requires {stat} ≤ {value}"),
        Condition::StatEq { stat, value, .. } => format!("Requires {stat} = {value}"),
        Condition::Visited { node_id, .. } => format!("Requires visiting: {node_id}"),
        Condition::AtNode { node_id, .. } => format!("Requires being at: {node_id}"),
        Condition::RelationshipGte {
            character_id,
            metric,
            value,
            ..
        } => format!("Requires {character_id} {metric} ≥ {value}"),
        Condition::RelationshipLte {
            character_id,
            metric,
            value,
            ..
        } => format!("Requires {character_id} {metric} ≤ {value}"),
        Condition::RelationshipEq {
            character_id,
            metric,
            value,
            ..
        } => format!("Requires {character_id} {metric} = {value}"),
        Condition::ActorPresent { character_id, .. } => {
            format!("Requires {character_id} to be present")
        }
    }
}

fn relationship_compare_expr(
    character_id: &str,
    metric: &str,
    op: &str,
    value: i32,
) -> Result<Expr, EngineError> {
    Ok(Expr::Op {
        op: op.to_string(),
        left: Box::new(Expr::Var {
            var: format!("relationship.{character_id}.{metric}"),
        }),
        right: Some(Box::new(Expr::Lit(ExprValue::Number(value)))),
    })
}
