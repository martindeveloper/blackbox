use crate::content::{
    ChoiceContent, Effect, GameContent, ItemAction, SkillCheckContent, TextBlock,
};
use crate::error::EngineError;
use crate::expr::{Expr, ExprInput};
use crate::gate::Gate;
use crate::text::compile_text_interpolation;

/// Compile all expressions at load time so runtime paths only evaluate ASTs.
pub fn compile_content(content: &mut GameContent) -> Result<(), EngineError> {
    for item in content.items.items.values_mut() {
        for action in &mut item.actions {
            compile_item_action(action, &item.id)?;
        }
    }

    for node in content.nodes.values_mut() {
        for block in &mut node.text {
            compile_text_block(block, &node.id)?;
        }
        for effect in &mut node.on_enter {
            compile_effect(effect)?;
        }
        for choice in &mut node.choices {
            compile_choice(choice)?;
        }
    }
    Ok(())
}

fn compile_text_block(block: &mut TextBlock, node_id: &str) -> Result<(), EngineError> {
    block.compiled_when = compile_optional_gate(
        block.when.take(),
        &format!("when on text block in node '{node_id}'"),
    )?;
    block.compiled_unless = compile_optional_gate(
        block.unless.take(),
        &format!("unless on text block in node '{node_id}'"),
    )?;
    block.compiled_text = compile_text_interpolation(
        &block.text,
        &format!("text interpolation in node '{node_id}'"),
    )?;
    if let Some(else_text) = &block.else_text {
        block.compiled_else_text = compile_text_interpolation(
            else_text,
            &format!("else text interpolation in node '{node_id}'"),
        )?;
    }
    Ok(())
}

fn compile_item_action(action: &mut ItemAction, item_id: &str) -> Result<(), EngineError> {
    let action_id = &action.id;

    if let Some(ref gate) = action.gate.requires {
        ensure_pure_gate_tree(
            gate,
            &format!("requires on item '{item_id}' action '{action_id}'"),
        )?;
        action.gate.compiled_requires = Some(gate.to_expr()?);
    }

    action.gate.compiled_when = compile_optional_gate(
        action.gate.when.take(),
        &format!("when on item '{item_id}' action '{action_id}'"),
    )?;
    action.gate.compiled_unless = compile_optional_gate(
        action.gate.unless.take(),
        &format!("unless on item '{item_id}' action '{action_id}'"),
    )?;

    for effect in &mut action.effects {
        compile_effect(effect)?;
    }

    Ok(())
}

fn compile_choice(choice: &mut ChoiceContent) -> Result<(), EngineError> {
    let choice_id = &choice.presentation.id;

    if let Some(ref gate) = choice.gate.requires {
        ensure_pure_gate_tree(gate, &format!("requires on choice '{choice_id}'"))?;
        choice.gate.compiled_requires = Some(gate.to_expr()?);
    }

    choice.gate.compiled_when = compile_optional_gate(
        choice.gate.when.take(),
        &format!("when on choice '{choice_id}'"),
    )?;
    choice.gate.compiled_unless = compile_optional_gate(
        choice.gate.unless.take(),
        &format!("unless on choice '{choice_id}'"),
    )?;

    for effect in &mut choice.resolution.effects {
        compile_effect(effect)?;
    }

    if let Some(check) = choice.resolution.check.as_mut() {
        compile_skill_check(check, choice_id)?;
    }

    Ok(())
}

fn compile_optional_gate(gate: Option<Gate>, context: &str) -> Result<Option<Expr>, EngineError> {
    match gate {
        Some(gate) => {
            ensure_pure_gate_tree(&gate, context)?;
            Ok(Some(gate.to_expr()?))
        }
        None => Ok(None),
    }
}

fn compile_skill_check(check: &mut SkillCheckContent, choice_id: &str) -> Result<(), EngineError> {
    check.compiled_modifier = match check.modifier.take() {
        Some(input) => Some(compile_input(
            input,
            &format!("modifier on skill check for choice '{choice_id}'"),
        )?),
        None => None,
    };

    for effect in &mut check.on_success.effects {
        compile_effect(effect)?;
    }
    for effect in &mut check.on_failure.effects {
        compile_effect(effect)?;
    }
    Ok(())
}

fn compile_effect(effect: &mut Effect) -> Result<(), EngineError> {
    match effect {
        Effect::SetFlag {
            value_expr,
            compiled_value_expr,
            ..
        } => {
            *compiled_value_expr = match value_expr.take() {
                Some(input) => Some(compile_input(input, "setFlag valueExpr")?),
                None => None,
            };
        }
        Effect::ModifyStat {
            amount_expr,
            compiled_amount_expr,
            ..
        } => {
            *compiled_amount_expr = match amount_expr.take() {
                Some(input) => Some(compile_input(input, "modifyStat amountExpr")?),
                None => None,
            };
        }
        Effect::AddItem {
            count_expr,
            compiled_count_expr,
            ..
        }
        | Effect::RemoveItem {
            count_expr,
            compiled_count_expr,
            ..
        } => {
            *compiled_count_expr = match count_expr.take() {
                Some(input) => Some(compile_input(input, "item countExpr")?),
                None => None,
            };
        }
        Effect::AddEvent { .. } => {}
        Effect::ModifyRelationship {
            amount_expr,
            compiled_amount_expr,
            ..
        } => {
            *compiled_amount_expr = match amount_expr.take() {
                Some(input) => Some(compile_input(input, "modifyRelationship amountExpr")?),
                None => None,
            };
        }
        Effect::PlayMusic { .. }
        | Effect::StopMusic
        | Effect::PlaySfx { .. }
        | Effect::Roll { .. }
        | Effect::SetActorPresent { .. } => {}
    }
    Ok(())
}

fn compile_input(input: ExprInput, context: &str) -> Result<Expr, EngineError> {
    input.into_expr().map_err(|error| match error {
        EngineError::ExpressionError(message) => {
            EngineError::ValidationError(format!("{context}: {message}"))
        }
        other => other,
    })
}

fn ensure_pure_gate_tree(gate: &Gate, context: &str) -> Result<(), EngineError> {
    if gate.is_pure() {
        Ok(())
    } else {
        Err(EngineError::ValidationError(format!(
            "{context} must not call random() or dice()"
        )))
    }
}
