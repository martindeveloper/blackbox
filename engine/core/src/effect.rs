use crate::condition::actor_flag_key;
use crate::content::Effect;
use crate::error::EngineError;
use crate::expr::{self, EvalContext, Expr, ExprValue};
use crate::logging;
use crate::relationship::modify_relationship;
use crate::rng::roll_die;
use crate::roll_log::RollLog;
use crate::state::GameState;
use crate::value::DynamicValue;

#[derive(Debug, Default, Clone)]
pub struct EffectSideEffects {
    pub triggered_sfx: Option<String>,
}

pub fn apply_effect(
    state: &mut GameState,
    effect: &Effect,
    rolls: &mut RollLog,
    side: &mut EffectSideEffects,
) -> Result<(), EngineError> {
    logging::debug_lazy("effect", || format!("apply {}", effect_kind(effect)));
    match effect {
        Effect::SetFlag {
            flag,
            value,
            compiled_value_expr,
            ..
        } => {
            let resolved =
                resolve_value(state, rolls, value.as_ref(), compiled_value_expr.as_ref())?;
            state.flags.insert(flag.clone(), resolved);
        }
        Effect::ModifyStat {
            stat,
            amount,
            compiled_amount_expr,
            ..
        } => {
            let delta = resolve_i32(state, rolls, *amount, compiled_amount_expr.as_ref())?;
            let entry = state.player.stats.entry(stat.clone()).or_insert(0);
            *entry += delta;
        }
        Effect::AddItem {
            item_id,
            count,
            compiled_count_expr,
            ..
        } => {
            let amount = resolve_u32(state, rolls, *count, compiled_count_expr.as_ref())?;
            let entry = state.inventory.items.entry(item_id.clone()).or_insert(0);
            *entry += amount;
        }
        Effect::RemoveItem {
            item_id,
            count,
            compiled_count_expr,
            ..
        } => {
            let amount = resolve_u32(state, rolls, *count, compiled_count_expr.as_ref())?;
            let entry = state.inventory.items.entry(item_id.clone()).or_insert(0);
            *entry = entry.saturating_sub(amount);
            if *entry == 0 {
                state.inventory.items.remove(item_id);
            }
        }
        Effect::AddEvent { event_id } => {
            state.add_event(event_id.clone());
        }
        Effect::PlayMusic { track } => {
            state.ambient_music = Some(track.clone());
        }
        Effect::StopMusic => {
            state.ambient_music = None;
        }
        Effect::PlaySfx { sfx } => {
            side.triggered_sfx = Some(sfx.clone());
        }
        Effect::Roll {
            sides,
            label,
            store_flag,
        } => {
            let roll = roll_die(state, *sides, label.clone(), rolls);
            if let Some(flag) = store_flag {
                state.flags.insert(flag.clone(), DynamicValue::Number(roll));
            }
        }
        Effect::ModifyRelationship {
            character_id,
            metric,
            amount,
            compiled_amount_expr,
            ..
        } => {
            let delta = resolve_i32(state, rolls, *amount, compiled_amount_expr.as_ref())?;
            modify_relationship(state, character_id, metric, delta);
        }
        Effect::SetActorPresent {
            character_id,
            value,
        } => {
            state
                .flags
                .insert(actor_flag_key(character_id), DynamicValue::Bool(*value));
        }
    }

    Ok(())
}

enum ResolvedField<T> {
    Literal(T),
    Expr(Expr),
}

fn resolve_i32(
    state: &mut GameState,
    rolls: &mut RollLog,
    amount: Option<i32>,
    amount_expr: Option<&Expr>,
) -> Result<i32, EngineError> {
    let field = field_from(
        amount,
        amount_expr,
        "modifyStat requires amount or amountExpr",
    )?;
    evaluate_i32_field(state, rolls, field)
}

fn resolve_u32(
    state: &mut GameState,
    rolls: &mut RollLog,
    count: Option<u32>,
    count_expr: Option<&Expr>,
) -> Result<u32, EngineError> {
    let value = evaluate_i32_field(
        state,
        rolls,
        field_from(
            count.map(|c| c as i32),
            count_expr,
            "item effect requires count or countExpr",
        )?,
    )?;
    if value < 0 {
        return Err(EngineError::ExpressionError(
            "item count must be non-negative".to_string(),
        ));
    }
    Ok(value as u32)
}

fn resolve_value(
    state: &mut GameState,
    rolls: &mut RollLog,
    value: Option<&DynamicValue>,
    value_expr: Option<&Expr>,
) -> Result<DynamicValue, EngineError> {
    match field_from(
        value.cloned(),
        value_expr,
        "setFlag requires value or valueExpr",
    )? {
        ResolvedField::Literal(value) => Ok(value),
        ResolvedField::Expr(expr) => {
            let mut ctx = EvalContext { state, rolls };
            let evaluated = expr::evaluate(&mut ctx, &expr)?;
            expr_value_to_dynamic(&evaluated)
        }
    }
}

fn field_from<T: Clone>(
    literal: Option<T>,
    expr: Option<&Expr>,
    missing: &'static str,
) -> Result<ResolvedField<T>, EngineError> {
    match (literal, expr) {
        (Some(value), None) => Ok(ResolvedField::Literal(value)),
        (None, Some(expr)) => Ok(ResolvedField::Expr(expr.clone())),
        (Some(_), Some(_)) => Err(EngineError::ValidationError(
            "effect field cannot set both literal and expression".to_string(),
        )),
        (None, None) => Err(EngineError::ValidationError(missing.to_string())),
    }
}

fn evaluate_i32_field(
    state: &mut GameState,
    rolls: &mut RollLog,
    field: ResolvedField<i32>,
) -> Result<i32, EngineError> {
    match field {
        ResolvedField::Literal(value) => Ok(value),
        ResolvedField::Expr(expr) => {
            let mut ctx = EvalContext { state, rolls };
            expr::evaluate_i32(&mut ctx, &expr)
        }
    }
}

fn expr_value_to_dynamic(value: &ExprValue) -> Result<DynamicValue, EngineError> {
    match value {
        ExprValue::Number(n) => Ok(DynamicValue::Number(*n)),
        ExprValue::Bool(b) => Ok(DynamicValue::Bool(*b)),
        ExprValue::String(s) => Ok(DynamicValue::String(s.clone())),
    }
}

fn effect_kind(effect: &Effect) -> &'static str {
    match effect {
        Effect::SetFlag { .. } => "setFlag",
        Effect::ModifyStat { .. } => "modifyStat",
        Effect::AddItem { .. } => "addItem",
        Effect::RemoveItem { .. } => "removeItem",
        Effect::AddEvent { .. } => "addEvent",
        Effect::PlayMusic { .. } => "playMusic",
        Effect::StopMusic => "stopMusic",
        Effect::PlaySfx { .. } => "playSfx",
        Effect::Roll { .. } => "roll",
        Effect::ModifyRelationship { .. } => "modifyRelationship",
        Effect::SetActorPresent { .. } => "setActorPresent",
    }
}
