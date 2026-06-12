use std::fmt::Write;

use crate::error::EngineError;
use crate::relationship::relationship_score;
use crate::rng::{roll_dice_expr, roll_inclusive};
use crate::roll_log::RollLog;
use crate::state::GameState;
use crate::value::DynamicValue;

use super::ast::{BuiltinVar, Expr, ExprValue};

pub struct EvalContext<'a> {
    pub state: &'a mut GameState,
    pub rolls: &'a mut RollLog,
}

pub struct ReadContext<'a> {
    pub state: &'a GameState,
}

enum EvalMode<'a> {
    Read(&'a GameState),
    Mut(&'a mut EvalContext<'a>),
}

impl EvalMode<'_> {
    fn state(&self) -> &GameState {
        match self {
            EvalMode::Read(state) => state,
            EvalMode::Mut(ctx) => &*ctx.state,
        }
    }
}

pub fn evaluate_bool<'a>(ctx: &'a mut EvalContext<'a>, expr: &Expr) -> Result<bool, EngineError> {
    as_bool(&evaluate(ctx, expr)?)
}

pub fn evaluate_i32<'a>(ctx: &'a mut EvalContext<'a>, expr: &Expr) -> Result<i32, EngineError> {
    as_i32(&evaluate(ctx, expr)?)
}

pub fn evaluate_readonly_bool(ctx: &ReadContext<'_>, expr: &Expr) -> Result<bool, EngineError> {
    as_bool(&evaluate_readonly(ctx, expr)?)
}

pub fn evaluate<'a>(ctx: &'a mut EvalContext<'a>, expr: &Expr) -> Result<ExprValue, EngineError> {
    evaluate_unified(&mut EvalMode::Mut(ctx), expr)
}

pub fn evaluate_readonly(ctx: &ReadContext<'_>, expr: &Expr) -> Result<ExprValue, EngineError> {
    evaluate_unified(&mut EvalMode::Read(ctx.state), expr)
}

/// Append the display form of a readonly expression into `out` without an intermediate `String`.
pub fn append_readonly_display<W: Write>(
    ctx: &ReadContext<'_>,
    expr: &Expr,
    out: &mut W,
) -> Result<(), EngineError> {
    match expr {
        Expr::Lit(ExprValue::String(text)) => out
            .write_str(text)
            .map_err(|error| EngineError::ExpressionError(error.to_string())),
        Expr::Lit(ExprValue::Number(value)) => write_display_number(out, *value),
        Expr::Lit(ExprValue::Bool(value)) => out
            .write_str(if *value { "true" } else { "false" })
            .map_err(|error| EngineError::ExpressionError(error.to_string())),
        Expr::Builtin(builtin) => append_builtin_display(ctx.state, builtin, out),
        Expr::Var { var } => append_var_display(ctx.state, var, out),
        _ => {
            let value = evaluate_readonly(ctx, expr)?;
            append_expr_value_display(&value, out)
        }
    }
}

fn evaluate_unified(mode: &mut EvalMode<'_>, expr: &Expr) -> Result<ExprValue, EngineError> {
    if matches!(mode, EvalMode::Read(_)) && !expr.is_pure() {
        return Err(EngineError::ExpressionError(
            "expression requires mutable evaluation".to_string(),
        ));
    }

    match expr {
        Expr::Lit(value) => Ok(value.clone()),
        Expr::Builtin(builtin) => Ok(resolve_builtin_read(mode.state(), builtin)),
        Expr::Var { var } => resolve_var_read(mode.state(), var),
        Expr::Call { call, args } => evaluate_call(mode, call, args),
        Expr::Op { op, left, right } => evaluate_op(mode, op, left, right.as_deref()),
    }
}

fn evaluate_call(
    mode: &mut EvalMode<'_>,
    name: &str,
    args: &[Expr],
) -> Result<ExprValue, EngineError> {
    match name {
        "random" => {
            let min = arg_i32(mode, args, 0, "random")?;
            let max = arg_i32(mode, args, 1, "random")?;
            let EvalMode::Mut(ctx) = mode else {
                return Err(EngineError::ExpressionError(
                    "expression requires mutable evaluation".to_string(),
                ));
            };
            let value = roll_inclusive(
                ctx.state,
                min,
                max,
                Some(format!("random({min}, {max})")),
                ctx.rolls,
            );
            Ok(ExprValue::Number(value))
        }
        "dice" => {
            let sides = arg_i32(mode, args, 0, "dice")? as u32;
            let EvalMode::Mut(ctx) = mode else {
                return Err(EngineError::ExpressionError(
                    "expression requires mutable evaluation".to_string(),
                ));
            };
            let value = roll_dice_expr(ctx.state, sides, Some(format!("dice({sides})")), ctx.rolls);
            Ok(ExprValue::Number(value))
        }
        _ => {
            let evaluated = eval_args(mode, args)?;
            exec_pure_call(mode.state(), name, &evaluated)
        }
    }
}

fn eval_args(mode: &mut EvalMode<'_>, args: &[Expr]) -> Result<Vec<ExprValue>, EngineError> {
    args.iter().map(|arg| evaluate_unified(mode, arg)).collect()
}

fn evaluate_op(
    mode: &mut EvalMode<'_>,
    op: &str,
    left: &Expr,
    right: Option<&Expr>,
) -> Result<ExprValue, EngineError> {
    match op {
        "not" | "!" => {
            let value = as_bool(&evaluate_unified(mode, left)?)?;
            Ok(ExprValue::Bool(!value))
        }
        "and" | "&&" => {
            let right = right.ok_or_else(|| {
                EngineError::ExpressionError(format!("operator '{op}' requires a right operand"))
            })?;
            Ok(ExprValue::Bool(
                as_bool(&evaluate_unified(mode, left)?)?
                    && as_bool(&evaluate_unified(mode, right)?)?,
            ))
        }
        "or" | "||" => {
            let right = right.ok_or_else(|| {
                EngineError::ExpressionError(format!("operator '{op}' requires a right operand"))
            })?;
            Ok(ExprValue::Bool(
                as_bool(&evaluate_unified(mode, left)?)?
                    || as_bool(&evaluate_unified(mode, right)?)?,
            ))
        }
        _ => {
            let right = right.ok_or_else(|| {
                EngineError::ExpressionError(format!("operator '{op}' requires a right operand"))
            })?;
            let left_value = evaluate_unified(mode, left)?;
            let right_value = evaluate_unified(mode, right)?;
            compare_or_math(op, &left_value, &right_value)
        }
    }
}

fn exec_pure_call(
    state: &GameState,
    name: &str,
    args: &[ExprValue],
) -> Result<ExprValue, EngineError> {
    match name {
        "stat" => {
            let stat = arg_string_val(args, 0, "stat")?;
            Ok(ExprValue::Number(
                *state.player.stats.get(&stat).unwrap_or(&0),
            ))
        }
        "hasItem" => {
            let item_id = arg_string_val(args, 0, "hasItem")?;
            let count = if args.len() > 1 {
                arg_i32_val(args, 1, "hasItem")? as u32
            } else {
                1
            };
            let have = *state.inventory.items.get(&item_id).unwrap_or(&0);
            Ok(ExprValue::Bool(have >= count))
        }
        "itemCount" => {
            let item_id = arg_string_val(args, 0, "itemCount")?;
            Ok(ExprValue::Number(
                *state.inventory.items.get(&item_id).unwrap_or(&0) as i32,
            ))
        }
        "hasFlag" => {
            let flag = arg_string_val(args, 0, "hasFlag")?;
            let Some(actual) = state.flags.get(&flag).cloned() else {
                return Ok(ExprValue::Bool(false));
            };
            if args.len() > 1 {
                let expected = &args[1];
                Ok(ExprValue::Bool(values_equal(
                    expected,
                    &dynamic_value_to_expr_lit(&actual)?,
                )))
            } else {
                Ok(ExprValue::Bool(true))
            }
        }
        "visited" => {
            let node_id = arg_string_val(args, 0, "visited")?;
            Ok(ExprValue::Bool(state.has_visited(&node_id)))
        }
        "atNode" => {
            let node_id = arg_string_val(args, 0, "atNode")?;
            Ok(ExprValue::Bool(state.current_node_id == node_id))
        }
        "relationship" => {
            let character_id = arg_string_val(args, 0, "relationship")?;
            let metric_name = arg_string_val(args, 1, "relationship")?;
            Ok(ExprValue::Number(relationship_score(
                &state.relationships,
                &character_id,
                &metric_name,
            )))
        }
        "not" => Ok(ExprValue::Bool(!as_bool(&args[0])?)),
        _ => Err(EngineError::ExpressionError(format!(
            "unknown function: {name}"
        ))),
    }
}

fn compare_or_math(
    op: &str,
    left: &ExprValue,
    right: &ExprValue,
) -> Result<ExprValue, EngineError> {
    match op {
        "==" | "eq" => Ok(ExprValue::Bool(values_equal(left, right))),
        "!=" | "neq" => Ok(ExprValue::Bool(!values_equal(left, right))),
        ">" | "gt" => Ok(ExprValue::Bool(as_i32(left)? > as_i32(right)?)),
        ">=" | "gte" => Ok(ExprValue::Bool(as_i32(left)? >= as_i32(right)?)),
        "<" | "lt" => Ok(ExprValue::Bool(as_i32(left)? < as_i32(right)?)),
        "<=" | "lte" => Ok(ExprValue::Bool(as_i32(left)? <= as_i32(right)?)),
        "+" => Ok(ExprValue::Number(as_i32(left)? + as_i32(right)?)),
        "-" => Ok(ExprValue::Number(as_i32(left)? - as_i32(right)?)),
        "*" => Ok(ExprValue::Number(as_i32(left)? * as_i32(right)?)),
        "/" => {
            let divisor = as_i32(right)?;
            if divisor == 0 {
                return Err(EngineError::ExpressionError("division by zero".to_string()));
            }
            Ok(ExprValue::Number(as_i32(left)? / divisor))
        }
        _ => Err(EngineError::ExpressionError(format!(
            "unknown operator: {op}"
        ))),
    }
}

fn resolve_builtin_read(state: &GameState, builtin: &BuiltinVar) -> ExprValue {
    match builtin {
        BuiltinVar::Visited(node_id) => ExprValue::Bool(state.has_visited(node_id)),
        BuiltinVar::AtNode(node_id) => ExprValue::Bool(state.current_node_id == *node_id),
        BuiltinVar::HasFlag(flag) => ExprValue::Bool(state.flags.contains_key(flag)),
    }
}

fn append_builtin_display<W: Write>(
    state: &GameState,
    builtin: &BuiltinVar,
    out: &mut W,
) -> Result<(), EngineError> {
    let text = match builtin {
        BuiltinVar::Visited(node_id) => {
            if state.has_visited(node_id) {
                "true"
            } else {
                "false"
            }
        }
        BuiltinVar::AtNode(node_id) => {
            if state.current_node_id == *node_id {
                "true"
            } else {
                "false"
            }
        }
        BuiltinVar::HasFlag(flag) => {
            if state.flags.contains_key(flag) {
                "true"
            } else {
                "false"
            }
        }
    };
    out.write_str(text)
        .map_err(|error| EngineError::ExpressionError(error.to_string()))
}

fn resolve_var_read(state: &GameState, name: &str) -> Result<ExprValue, EngineError> {
    if let Some(stat) = name.strip_prefix("stat.") {
        let value = *state.player.stats.get(stat).unwrap_or(&0);
        return Ok(ExprValue::Number(value));
    }

    if let Some(item) = name.strip_prefix("item.") {
        let count = *state.inventory.items.get(item).unwrap_or(&0);
        return Ok(ExprValue::Number(count as i32));
    }

    if let Some(flag) = name.strip_prefix("flag.") {
        let Some(value) = state.flags.get(flag) else {
            return Ok(ExprValue::Bool(false));
        };
        return dynamic_value_to_expr_lit(value);
    }

    if let Some(rest) = name.strip_prefix("relationship.") {
        let (character_id, metric_name) = rest.rsplit_once('.').ok_or_else(|| {
            EngineError::ExpressionError(format!(
                "relationship variable must be relationship.<characterId>.<metric>: {name}"
            ))
        })?;
        return Ok(ExprValue::Number(relationship_score(
            &state.relationships,
            character_id,
            metric_name,
        )));
    }

    Err(EngineError::ExpressionError(format!(
        "unknown variable: {name}"
    )))
}

fn arg_i32(
    mode: &mut EvalMode<'_>,
    args: &[Expr],
    index: usize,
    name: &str,
) -> Result<i32, EngineError> {
    let expr = args.get(index).ok_or_else(|| {
        EngineError::ExpressionError(format!("{name}() missing argument {index}"))
    })?;
    as_i32(&evaluate_unified(mode, expr)?)
}

fn arg_i32_val(args: &[ExprValue], index: usize, name: &str) -> Result<i32, EngineError> {
    let value = args.get(index).ok_or_else(|| {
        EngineError::ExpressionError(format!("{name}() missing argument {index}"))
    })?;
    as_i32(value)
}

fn arg_string_val(args: &[ExprValue], index: usize, name: &str) -> Result<String, EngineError> {
    let value = args.get(index).ok_or_else(|| {
        EngineError::ExpressionError(format!("{name}() missing argument {index}"))
    })?;
    as_string(value)
}

pub fn as_bool(value: &ExprValue) -> Result<bool, EngineError> {
    match value {
        ExprValue::Bool(b) => Ok(*b),
        ExprValue::Number(n) => Ok(*n != 0),
        ExprValue::String(s) => Ok(!s.is_empty()),
    }
}

pub fn as_i32(value: &ExprValue) -> Result<i32, EngineError> {
    match value {
        ExprValue::Number(n) => Ok(*n),
        ExprValue::Bool(b) => Ok(if *b { 1 } else { 0 }),
        ExprValue::String(_) => Err(EngineError::ExpressionError(
            "expected number, got string".to_string(),
        )),
    }
}

pub fn as_string(value: &ExprValue) -> Result<String, EngineError> {
    match value {
        ExprValue::String(s) => Ok(s.clone()),
        ExprValue::Number(n) => Ok(n.to_string()),
        ExprValue::Bool(b) => Ok(b.to_string()),
    }
}

pub fn dynamic_value_to_expr_lit(value: &DynamicValue) -> Result<ExprValue, EngineError> {
    match value {
        DynamicValue::Bool(b) => Ok(ExprValue::Bool(*b)),
        DynamicValue::Number(n) => Ok(ExprValue::Number(*n)),
        DynamicValue::String(s) => Ok(ExprValue::String(s.clone())),
    }
}

fn write_display_number<W: Write>(out: &mut W, value: i32) -> Result<(), EngineError> {
    write!(out, "{value}").map_err(|error| EngineError::ExpressionError(error.to_string()))
}

fn append_expr_value_display<W: Write>(value: &ExprValue, out: &mut W) -> Result<(), EngineError> {
    match value {
        ExprValue::String(text) => out
            .write_str(text)
            .map_err(|error| EngineError::ExpressionError(error.to_string())),
        ExprValue::Number(number) => write_display_number(out, *number),
        ExprValue::Bool(boolean) => out
            .write_str(if *boolean { "true" } else { "false" })
            .map_err(|error| EngineError::ExpressionError(error.to_string())),
    }
}

fn append_var_display<W: Write>(
    state: &GameState,
    name: &str,
    out: &mut W,
) -> Result<(), EngineError> {
    if let Some(stat) = name.strip_prefix("stat.") {
        let value = *state.player.stats.get(stat).unwrap_or(&0);
        return write_display_number(out, value);
    }

    if let Some(item) = name.strip_prefix("item.") {
        let count = *state.inventory.items.get(item).unwrap_or(&0);
        return write_display_number(out, count as i32);
    }

    if let Some(flag) = name.strip_prefix("flag.") {
        let Some(value) = state.flags.get(flag) else {
            return out
                .write_str("false")
                .map_err(|error| EngineError::ExpressionError(error.to_string()));
        };
        return append_dynamic_value_display(value, out);
    }

    if let Some(rest) = name.strip_prefix("relationship.") {
        let (character_id, metric_name) = rest.rsplit_once('.').ok_or_else(|| {
            EngineError::ExpressionError(format!(
                "relationship variable must be relationship.<characterId>.<metric>: {name}"
            ))
        })?;
        let score = relationship_score(&state.relationships, character_id, metric_name);
        return write_display_number(out, score);
    }

    Err(EngineError::ExpressionError(format!(
        "unknown variable: {name}"
    )))
}

fn append_dynamic_value_display<W: Write>(
    value: &DynamicValue,
    out: &mut W,
) -> Result<(), EngineError> {
    match value {
        DynamicValue::Bool(boolean) => out
            .write_str(if *boolean { "true" } else { "false" })
            .map_err(|error| EngineError::ExpressionError(error.to_string())),
        DynamicValue::Number(number) => write_display_number(out, *number),
        DynamicValue::String(text) => out
            .write_str(text)
            .map_err(|error| EngineError::ExpressionError(error.to_string())),
    }
}

fn values_equal(left: &ExprValue, right: &ExprValue) -> bool {
    match (left, right) {
        (ExprValue::Bool(a), ExprValue::Bool(b)) => a == b,
        (ExprValue::Number(a), ExprValue::Number(b)) => a == b,
        (ExprValue::String(a), ExprValue::String(b)) => a == b,
        (ExprValue::Number(a), ExprValue::Bool(b)) => (*a != 0) == *b,
        (ExprValue::Bool(a), ExprValue::Number(b)) => *a == (*b != 0),
        _ => false,
    }
}
