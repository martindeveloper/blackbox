use bumpalo::Bump;
use bumpalo::collections::String as BumpString;

use crate::content::{TextBlock, TextSegment};
use crate::error::EngineError;
use crate::expr::{self, ReadContext};
use crate::gate::evaluate_gate_readonly;
use crate::state::GameState;

/// Parse `{expr}` segments at load time. Literal braces are escaped as `{{` and `}}`.
pub(crate) fn compile_text_interpolation(
    text: &str,
    context: &str,
) -> Result<Vec<TextSegment>, EngineError> {
    let mut segments = Vec::new();
    let mut literal = String::new();
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '}' {
            if chars.peek() == Some(&'}') {
                chars.next();
                literal.push('}');
                continue;
            }
            literal.push('}');
            continue;
        }

        if ch != '{' {
            literal.push(ch);
            continue;
        }

        if chars.peek() == Some(&'{') {
            chars.next();
            literal.push('{');
            continue;
        }

        if !literal.is_empty() {
            segments.push(TextSegment::Literal(std::mem::take(&mut literal)));
        }

        let mut expr_str = String::new();
        for c in chars.by_ref() {
            if c == '}' {
                break;
            }
            expr_str.push(c);
        }

        let expr = expr::parse_expr(expr_str.trim())?;
        if !expr.is_pure() {
            return Err(EngineError::ValidationError(format!(
                "{context} must not call random() or dice()"
            )));
        }
        segments.push(TextSegment::Expr(expr));
    }

    if !literal.is_empty() || segments.is_empty() {
        segments.push(TextSegment::Literal(
            if segments.is_empty() && literal.is_empty() {
                text.to_string()
            } else {
                literal
            },
        ));
    }

    Ok(segments)
}

pub(crate) fn interpolate_compiled_text<'a>(
    bump: &'a Bump,
    state: &GameState,
    segments: &[TextSegment],
) -> Result<&'a str, EngineError> {
    let ctx = ReadContext { state };
    let mut out = BumpString::new_in(bump);

    for segment in segments {
        match segment {
            TextSegment::Literal(text) => out.push_str(text),
            TextSegment::Expr(expr) => {
                expr::append_readonly_display(&ctx, expr, &mut out)?;
            }
        }
    }

    Ok(out.into_bump_str())
}

pub fn resolve_text_blocks(
    bump: &Bump,
    state: &GameState,
    blocks: &[TextBlock],
) -> Result<Vec<TextBlock>, EngineError> {
    let ctx = ReadContext { state };
    let mut resolved = Vec::with_capacity(blocks.len());

    for block in blocks {
        let gate_passes = evaluate_gate_readonly(
            &ctx,
            block.compiled_when.as_ref(),
            block.compiled_unless.as_ref(),
        )?;

        let segments = if gate_passes {
            &block.compiled_text
        } else if !block.compiled_else_text.is_empty() {
            &block.compiled_else_text
        } else {
            continue;
        };

        let interpolated = interpolate_compiled_text(bump, state, segments)?;
        resolved.push(TextBlock {
            kind: block.kind.clone(),
            text: String::from(interpolated),
            else_text: None,
            when: None,
            unless: None,
            compiled_when: None,
            compiled_unless: None,
            compiled_text: Vec::new(),
            compiled_else_text: Vec::new(),
            speaker: block.speaker.clone(),
            emotion: block.emotion.clone(),
            side: block.side.clone(),
            actor: None,
        });
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use bumpalo::Bump;

    use crate::condition::Condition;
    use crate::content::TextBlock;
    use crate::gate::Gate;
    use crate::state::GameState;

    use super::{compile_text_interpolation, interpolate_compiled_text, resolve_text_blocks};

    fn state_with_hp(hp: i32) -> GameState {
        let stats = HashMap::from_iter([("hp".to_string(), hp), ("max_hp".to_string(), 10)]);
        GameState::new("start", None, &stats, &HashMap::default(), 1)
    }

    fn compile_text(text: &str) -> Vec<crate::content::TextSegment> {
        compile_text_interpolation(text, "test").unwrap()
    }

    #[test]
    fn interpolates_stat_shorthand() {
        let bump = Bump::new();
        let state = state_with_hp(7);
        let segments = compile_text("Vitals: {stat.hp}/{stat.max_hp}.");
        let text = interpolate_compiled_text(&bump, &state, &segments).unwrap();
        assert_eq!(text, "Vitals: 7/10.");
    }

    #[test]
    fn escapes_literal_braces() {
        let bump = Bump::new();
        let state = state_with_hp(10);
        let segments = compile_text("Use {{stat.hp}} for literal braces.");
        let text = interpolate_compiled_text(&bump, &state, &segments).unwrap();
        assert_eq!(text, "Use {stat.hp} for literal braces.");
    }

    #[test]
    fn rejects_impure_interpolation_expr() {
        let error = compile_text_interpolation("Roll {random(1, 6)}", "test").unwrap_err();
        assert!(matches!(
            error,
            crate::error::EngineError::ValidationError(_)
        ));
    }

    #[test]
    fn filters_conditional_blocks() {
        let bump = Bump::new();
        let state = state_with_hp(3);
        let blocks = vec![
            TextBlock {
                kind: "paragraph".to_string(),
                text: "Always shown.".to_string(),
                else_text: None,
                when: None,
                unless: None,
                compiled_when: None,
                compiled_unless: None,
                compiled_text: compile_text("Always shown."),
                compiled_else_text: Vec::new(),
                speaker: None,
                emotion: None,
                side: None,
                actor: None,
            },
            TextBlock {
                kind: "paragraph".to_string(),
                text: "Low HP warning.".to_string(),
                else_text: None,
                when: None,
                unless: None,
                compiled_when: Some(
                    Gate::Condition(Condition::StatLte {
                        stat: "hp".to_string(),
                        value: 5,
                        disabled_reason: None,
                    })
                    .to_expr()
                    .unwrap(),
                ),
                compiled_unless: None,
                compiled_text: compile_text("Low HP warning."),
                compiled_else_text: Vec::new(),
                speaker: None,
                emotion: None,
                side: None,
                actor: None,
            },
            TextBlock {
                kind: "paragraph".to_string(),
                text: "Healthy.".to_string(),
                else_text: None,
                when: None,
                unless: None,
                compiled_when: Some(
                    Gate::Condition(Condition::StatGte {
                        stat: "hp".to_string(),
                        value: 6,
                        disabled_reason: None,
                    })
                    .to_expr()
                    .unwrap(),
                ),
                compiled_unless: None,
                compiled_text: compile_text("Healthy."),
                compiled_else_text: Vec::new(),
                speaker: None,
                emotion: None,
                side: None,
                actor: None,
            },
        ];

        let resolved = resolve_text_blocks(&bump, &state, &blocks).unwrap();
        assert_eq!(resolved.len(), 2);
        assert_eq!(resolved[0].text, "Always shown.");
        assert_eq!(resolved[1].text, "Low HP warning.");
    }
}
