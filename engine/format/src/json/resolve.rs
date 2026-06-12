use rustc_hash::FxHashMap as HashMap;
use std::collections::HashSet;

use blackbox_engine::EngineError;
use blackbox_engine::Gate;
use blackbox_engine::content::{
    ChoiceContent, Effect, NodeContent, NodeMode, PreparedLibrary, TemplateBody, TextBlock,
};

use super::convert::{
    choice_content_from_wire, effect_from_wire, gate_from_wire, text_block_from_wire,
};
use super::decode::{decode_document, decode_json_document};
use super::wire::{
    ArrayMergeModeWire, EffectWire, InlineNodeContentWire, LibraryWire, MergeConfigWire,
    NodeContentWire, NodeModeWire, TextEntryWire,
};
use super::wire_schema::{LIBRARY_SPEC, validate_document_envelope};

pub(crate) fn decode_library_bytes(bytes: &[u8]) -> Result<PreparedLibrary, EngineError> {
    prepare_library(decode_library_wire(bytes)?)
}

pub(crate) fn ensure_prepared_library(
    content: &mut blackbox_engine::content::GameContent,
) -> Result<(), EngineError> {
    if content.prepared_library.is_some() {
        return Ok(());
    }
    let Some(source) = content.library_source.as_deref() else {
        return Ok(());
    };
    content.prepared_library = Some(decode_library_bytes(source)?);
    Ok(())
}

fn decode_library_wire(bytes: &[u8]) -> Result<LibraryWire, EngineError> {
    if let Ok(wire) = decode_document::<LibraryWire>(bytes, "library", LIBRARY_SPEC) {
        return Ok(wire);
    }
    decode_json_document(bytes, "library")
}

fn prepare_library(wire: LibraryWire) -> Result<PreparedLibrary, EngineError> {
    validate_document_envelope("library", &wire.spec, LIBRARY_SPEC, wire.format_version)?;

    // Compile named conditions first (with cycle detection) so they can be referenced
    // by snippets and templates processed afterwards.
    let mut conditions: HashMap<String, Gate> = HashMap::default();
    for cond_id in wire.conditions.keys() {
        prepare_condition(
            cond_id,
            &wire.conditions,
            &mut conditions,
            &mut HashSet::new(),
        )?;
    }
    let conds = Some(&conditions);

    let mut snippets = HashMap::default();
    for (id, block) in wire.snippets {
        snippets.insert(id, text_block_from_wire(block, conds)?);
    }

    let mut templates = HashMap::default();
    for template_id in wire.templates.keys() {
        prepare_template(
            template_id,
            &wire.templates,
            &snippets,
            &conditions,
            &mut templates,
            &mut HashSet::new(),
        )?;
    }

    Ok(PreparedLibrary {
        snippets,
        templates,
        conditions,
    })
}

fn prepare_condition(
    id: &str,
    raw: &HashMap<String, super::wire::GateWire>,
    done: &mut HashMap<String, Gate>,
    visiting: &mut HashSet<String>,
) -> Result<(), EngineError> {
    if done.contains_key(id) {
        return Ok(());
    }
    if !visiting.insert(id.to_string()) {
        return Err(EngineError::ValidationError(format!(
            "library condition '{id}' has a circular reference"
        )));
    }

    let wire = raw.get(id).ok_or_else(|| {
        EngineError::ValidationError(format!("library condition '{id}' not found"))
    })?;

    // Compile dependencies first (topological ordering) so that when gate_from_wire
    // encounters a ConditionRef it finds the referenced gate already in `done`.
    for dep_id in collect_condition_deps_from_gate(wire) {
        prepare_condition(&dep_id, raw, done, visiting)?;
    }

    let gate = gate_from_wire(wire.clone(), Some(done))?;
    done.insert(id.to_string(), gate);
    visiting.remove(id);
    Ok(())
}

/// Collect the IDs of all named conditions directly referenced by a gate wire.
fn collect_condition_deps_from_gate(gate: &super::wire::GateWire) -> Vec<String> {
    use super::wire::{GateNodeWire, GateWire};
    let mut deps = Vec::new();
    fn walk(gate: &GateWire, deps: &mut Vec<String>) {
        match gate {
            GateWire::All(list) => {
                for g in list {
                    walk(g, deps);
                }
            }
            GateWire::One(node) => match node {
                GateNodeWire::All { conditions } | GateNodeWire::Any { conditions } => {
                    for g in conditions {
                        walk(g, deps);
                    }
                }
                GateNodeWire::Not { condition } => walk(condition, deps),
                GateNodeWire::ConditionRef { id, .. } => deps.push(id.clone()),
                _ => {}
            },
        }
    }
    walk(gate, &mut deps);
    deps
}

pub(crate) fn resolve_node_content(
    node: NodeContentWire,
    library: Option<&PreparedLibrary>,
    context: &str,
) -> Result<NodeContent, EngineError> {
    let id = node.id.clone();
    merge_node_content(
        node.id,
        node.extends,
        node.merge,
        node.title,
        node.background_ref,
        node.mode,
        node.text,
        node.on_enter,
        node.choices,
        library,
        context,
        Some(&id),
    )
}

pub(crate) fn resolve_inline_node_content(
    inline: InlineNodeContentWire,
    library: Option<&PreparedLibrary>,
    context: &str,
) -> Result<NodeContent, EngineError> {
    merge_node_content(
        String::new(),
        inline.extends,
        inline.merge,
        inline.title,
        inline.background_ref,
        Some(inline.mode),
        inline.text,
        inline.on_enter,
        inline.choices,
        library,
        context,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
fn merge_node_content(
    id: String,
    extends: Option<String>,
    merge_cfg: MergeConfigWire,
    title: Option<String>,
    background_ref: Option<String>,
    mode: Option<NodeModeWire>,
    text: Vec<TextEntryWire>,
    on_enter: Vec<EffectWire>,
    choices: Vec<super::wire::ChoiceContentWire>,
    library: Option<&PreparedLibrary>,
    context: &str,
    node_id: Option<&str>,
) -> Result<NodeContent, EngineError> {
    let conds = library.map(|l| &l.conditions);

    let (text_entries, inherited_text, title, background_ref, mode, on_enter, choices) =
        if let Some(template_id) = extends {
            let Some(library) = library else {
                let who = node_id.unwrap_or("inline node");
                return Err(EngineError::ValidationError(format!(
                    "{context}: {who} uses $extends '{template_id}' but no library is loaded"
                )));
            };
            let Some(template) = library.templates.get(&template_id) else {
                let who = node_id.unwrap_or("inline node");
                return Err(EngineError::ValidationError(format!(
                    "{context}: {who} extends unknown template '{template_id}'"
                )));
            };
            (
                text,
                Some(template.text.as_slice()),
                title.or_else(|| template.title.clone()),
                background_ref.or_else(|| template.background_ref.clone()),
                mode.map(node_mode_from_wire)
                    .or(Some(template.mode.clone())),
                merge_effects(on_enter, &template.on_enter, merge_cfg.on_enter)?,
                merge_choice_list(choices, &template.choices, merge_cfg.choices, conds)?,
            )
        } else {
            (
                text,
                None,
                title,
                background_ref,
                mode.map(node_mode_from_wire),
                convert_effects(on_enter)?,
                convert_choices(choices, conds)?,
            )
        };

    let snippets = library.map(|library| &library.snippets);
    let text = finalize_text(
        text_entries,
        inherited_text,
        snippets,
        conds,
        merge_cfg.text,
        context,
    )?;

    Ok(NodeContent {
        id,
        title,
        background_ref,
        mode: mode.unwrap_or(NodeMode::Normal),
        text,
        on_enter,
        choices,
    })
}

fn convert_effects(effects: Vec<EffectWire>) -> Result<Vec<Effect>, EngineError> {
    effects.into_iter().map(effect_from_wire).collect()
}

fn convert_choices(
    choices: Vec<super::wire::ChoiceContentWire>,
    conds: super::convert::CondMap<'_>,
) -> Result<Vec<ChoiceContent>, EngineError> {
    choices
        .into_iter()
        .map(|c| choice_content_from_wire(c, conds))
        .collect()
}

/// Merge overlay effects with template effects according to the given merge mode.
fn merge_effects(
    overlay: Vec<EffectWire>,
    template: &[Effect],
    mode: ArrayMergeModeWire,
) -> Result<Vec<Effect>, EngineError> {
    match mode {
        ArrayMergeModeWire::Replace => {
            if overlay.is_empty() {
                Ok(template.to_vec())
            } else {
                convert_effects(overlay)
            }
        }
        ArrayMergeModeWire::Append => {
            let mut result = template.to_vec();
            result.extend(convert_effects(overlay)?);
            Ok(result)
        }
        ArrayMergeModeWire::Prepend => {
            let mut result = convert_effects(overlay)?;
            result.extend_from_slice(template);
            Ok(result)
        }
    }
}

/// Merge overlay choices with template choices according to the given merge mode.
fn merge_choice_list(
    overlay: Vec<super::wire::ChoiceContentWire>,
    template: &[ChoiceContent],
    mode: ArrayMergeModeWire,
    conds: super::convert::CondMap<'_>,
) -> Result<Vec<ChoiceContent>, EngineError> {
    match mode {
        ArrayMergeModeWire::Replace => {
            if overlay.is_empty() {
                Ok(template.to_vec())
            } else {
                convert_choices(overlay, conds)
            }
        }
        ArrayMergeModeWire::Append => {
            let mut result = template.to_vec();
            result.extend(convert_choices(overlay, conds)?);
            Ok(result)
        }
        ArrayMergeModeWire::Prepend => {
            let mut result = convert_choices(overlay, conds)?;
            result.extend_from_slice(template);
            Ok(result)
        }
    }
}

fn finalize_text(
    entries: Vec<TextEntryWire>,
    inherited: Option<&[TextBlock]>,
    snippets: Option<&HashMap<String, TextBlock>>,
    conds: super::convert::CondMap<'_>,
    mode: ArrayMergeModeWire,
    context: &str,
) -> Result<Vec<TextBlock>, EngineError> {
    let inherited_blocks = inherited.unwrap_or(&[]);
    match mode {
        ArrayMergeModeWire::Replace => {
            if entries.is_empty() {
                Ok(inherited_blocks.to_vec())
            } else {
                expand_text_entries(entries, snippets, conds, context)
            }
        }
        ArrayMergeModeWire::Append => {
            let mut result = inherited_blocks.to_vec();
            result.extend(expand_text_entries(entries, snippets, conds, context)?);
            Ok(result)
        }
        ArrayMergeModeWire::Prepend => {
            let mut result = expand_text_entries(entries, snippets, conds, context)?;
            result.extend_from_slice(inherited_blocks);
            Ok(result)
        }
    }
}

fn prepare_template(
    id: &str,
    raw: &HashMap<String, InlineNodeContentWire>,
    snippets: &HashMap<String, TextBlock>,
    conditions: &HashMap<String, Gate>,
    done: &mut HashMap<String, TemplateBody>,
    visiting: &mut HashSet<String>,
) -> Result<(), EngineError> {
    if done.contains_key(id) {
        return Ok(());
    }
    if !visiting.insert(id.to_string()) {
        return Err(EngineError::ValidationError(format!(
            "library template '{id}' $extends cycle detected"
        )));
    }

    let template = raw.get(id).ok_or_else(|| {
        EngineError::ValidationError(format!("library template '{id}' not found"))
    })?;

    let parent = if let Some(parent_id) = &template.extends {
        prepare_template(parent_id, raw, snippets, conditions, done, visiting)?;
        done.get(parent_id).cloned()
    } else {
        None
    };

    let conds = Some(conditions);
    let context = format!("library template '{id}'");
    let merge = template.merge;
    let parent_text = parent.as_ref().map(|b| b.text.as_slice());
    let text = finalize_text(
        template.text.clone(),
        parent_text,
        Some(snippets),
        conds,
        merge.text,
        &context,
    )?;
    let on_enter = merge_effects(
        template.on_enter.clone(),
        parent
            .as_ref()
            .map(|b| b.on_enter.as_slice())
            .unwrap_or(&[]),
        merge.on_enter,
    )?;
    let choices = merge_choice_list(
        template.choices.clone(),
        parent.as_ref().map(|b| b.choices.as_slice()).unwrap_or(&[]),
        merge.choices,
        conds,
    )?;

    done.insert(
        id.to_string(),
        TemplateBody {
            title: template
                .title
                .clone()
                .or_else(|| parent.as_ref().and_then(|body| body.title.clone())),
            background_ref: template
                .background_ref
                .clone()
                .or_else(|| parent.as_ref().and_then(|body| body.background_ref.clone())),
            mode: node_mode_from_wire(template.mode),
            text,
            on_enter,
            choices,
        },
    );
    visiting.remove(id);
    Ok(())
}

fn expand_text_entries(
    entries: Vec<TextEntryWire>,
    snippets: Option<&HashMap<String, TextBlock>>,
    conds: super::convert::CondMap<'_>,
    context: &str,
) -> Result<Vec<TextBlock>, EngineError> {
    let mut blocks = Vec::with_capacity(entries.len());
    for entry in entries {
        match entry
            .into_resolved()
            .map_err(EngineError::ValidationError)?
        {
            super::wire::ResolvedTextEntry::Block(block) => {
                blocks.push(text_block_from_wire(*block, conds)?);
            }
            super::wire::ResolvedTextEntry::Snippet(snippet_id, params) => {
                let Some(snippets) = snippets else {
                    return Err(EngineError::ValidationError(format!(
                        "{context}: unknown snippet '{snippet_id}'"
                    )));
                };
                let Some(snippet) = snippets.get(&snippet_id) else {
                    return Err(EngineError::ValidationError(format!(
                        "{context}: unknown snippet '{snippet_id}'"
                    )));
                };
                let block = if let Some(params) = params {
                    apply_snippet_params(snippet.clone(), &params)
                } else {
                    snippet.clone()
                };
                blocks.push(block);
            }
        }
    }
    Ok(blocks)
}

/// Substitute `{param.KEY}` placeholders in a cloned snippet's `text` and `else_text`.
/// The substitution is purely textual and runs before expression compilation, so param
/// values may themselves contain `{stat.x}` expressions that will be compiled normally.
fn apply_snippet_params(mut block: TextBlock, params: &HashMap<String, String>) -> TextBlock {
    block.text = substitute_params(&block.text, params);
    if let Some(else_text) = block.else_text.as_deref() {
        block.else_text = Some(substitute_params(else_text, params));
    }
    block
}

/// Replace every `{param.KEY}` occurrence in `text` with `params[KEY]`.
/// Unknown keys are left as-is so authors see them during testing.
fn substitute_params(text: &str, params: &HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (key, value) in params {
        let placeholder = format!("{{param.{key}}}");
        result = result.replace(&placeholder, value);
    }
    result
}

fn node_mode_from_wire(mode: NodeModeWire) -> NodeMode {
    match mode {
        NodeModeWire::Normal => NodeMode::Normal,
        NodeModeWire::GameOver => NodeMode::GameOver,
        NodeModeWire::Ending => NodeMode::Ending,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::wire::{
        ChoiceContentWire, ChoiceGateWire, ChoicePresentationWire, ChoiceResolutionSpecWire,
        GateWire, TextBlockWire,
    };

    fn sample_snippet() -> TextBlockWire {
        TextBlockWire {
            kind: "stage_direction".to_string(),
            text: "HP: {stat.hp}/{stat.max_hp}.".to_string(),
            r#else: None,
            when: None,
            unless: None,
            speaker: None,
            emotion: None,
            side: None,
            actor: None,
        }
    }

    fn sample_library() -> PreparedLibrary {
        decode_library_bytes(
            serde_json::to_string(&LibraryWire {
                spec: LIBRARY_SPEC.to_string(),
                format_version: 1,
                snippets: HashMap::from_iter([("hud_vitals".to_string(), sample_snippet())]),
                templates: HashMap::from_iter([(
                    "game_over".to_string(),
                    InlineNodeContentWire {
                        extends: None,
                        merge: Default::default(),
                        title: Some("Signal Lost".to_string()),
                        background_ref: None,
                        mode: NodeModeWire::GameOver,
                        text: vec![TextEntryWire::SnippetString("@hud_vitals".to_string())],
                        on_enter: vec![],
                        choices: vec![ChoiceContentWire {
                            presentation: ChoicePresentationWire {
                                id: "restart".to_string(),
                                label: "Restart.".to_string(),
                                sfx: None,
                            },
                            gate: ChoiceGateWire {
                                requires: GateWire::All(vec![]),
                                when: None,
                                unless: None,
                                disabled_reason: None,
                                when_disabled_reason: None,
                                unless_disabled_reason: None,
                            },
                            resolution: ChoiceResolutionSpecWire {
                                effects: vec![],
                                goto: None,
                                check: None,
                                action: None,
                            },
                        }],
                    },
                )]),
                conditions: HashMap::default(),
            })
            .expect("json")
            .as_bytes(),
        )
        .expect("library")
    }

    #[test]
    fn expands_snippet_reference_in_text() {
        let library = sample_library();
        let node = NodeContentWire {
            id: "intro".to_string(),
            extends: None,
            merge: Default::default(),
            title: None,
            background_ref: None,
            mode: None,
            text: vec![TextEntryWire::SnippetString("@hud_vitals".to_string())],
            on_enter: vec![],
            choices: vec![],
        };

        let resolved = resolve_node_content(node, Some(&library), "chapter test").expect("resolve");
        assert_eq!(resolved.text.len(), 1);
        assert_eq!(resolved.text[0].kind, "stage_direction");
    }

    #[test]
    fn extends_merges_template_and_overlay() {
        let library = sample_library();
        let node = NodeContentWire {
            id: "chapter_death".to_string(),
            extends: Some("game_over".to_string()),
            merge: Default::default(),
            title: None,
            background_ref: None,
            mode: None,
            text: vec![TextEntryWire::Block(Box::new(TextBlockWire {
                kind: "paragraph".to_string(),
                text: "You stop.".to_string(),
                r#else: None,
                when: None,
                unless: None,
                speaker: None,
                emotion: None,
                side: None,
                actor: None,
            }))],
            on_enter: vec![],
            choices: vec![],
        };

        let resolved = resolve_node_content(node, Some(&library), "chapter test").expect("resolve");
        assert_eq!(resolved.title.as_deref(), Some("Signal Lost"));
        assert_eq!(resolved.mode, NodeMode::GameOver);
        assert_eq!(resolved.text.len(), 1);
        assert_eq!(resolved.text[0].text, "You stop.");
        assert_eq!(resolved.choices.len(), 1);
    }

    #[test]
    fn decode_accepts_json_and_msgpack() {
        let wire = LibraryWire {
            spec: LIBRARY_SPEC.to_string(),
            format_version: 1,
            snippets: HashMap::from_iter([("hud_vitals".to_string(), sample_snippet())]),
            templates: HashMap::default(),
            conditions: HashMap::default(),
        };
        let json = serde_json::to_vec(&wire).expect("json");
        let msgpack = rmp_serde::to_vec_named(&wire).expect("msgpack");
        assert_eq!(decode_library_bytes(&json).expect("json").snippets.len(), 1);
        assert_eq!(
            decode_library_bytes(&msgpack)
                .expect("msgpack")
                .snippets
                .len(),
            1
        );
    }

    #[test]
    fn unknown_snippet_is_rejected() {
        let node = NodeContentWire {
            id: "intro".to_string(),
            extends: None,
            merge: Default::default(),
            title: None,
            background_ref: None,
            mode: None,
            text: vec![TextEntryWire::SnippetString("@missing".to_string())],
            on_enter: vec![],
            choices: vec![],
        };

        let error = resolve_node_content(node, None, "chapter test").unwrap_err();
        assert!(matches!(error, EngineError::ValidationError(_)));
    }

    #[test]
    fn named_condition_is_resolved() {
        use crate::json::wire::GateNodeWire;

        let wire = LibraryWire {
            spec: LIBRARY_SPEC.to_string(),
            format_version: 1,
            snippets: HashMap::default(),
            templates: HashMap::default(),
            conditions: HashMap::from_iter([(
                "grace_freed".to_string(),
                GateWire::One(GateNodeWire::Any {
                    conditions: vec![
                        GateWire::One(GateNodeWire::HasFlag {
                            flag: "ari_resolved_released".to_string(),
                            value: None,
                            disabled_reason: None,
                        }),
                        GateWire::One(GateNodeWire::HasFlag {
                            flag: "ari_resolved_grace".to_string(),
                            value: None,
                            disabled_reason: None,
                        }),
                    ],
                }),
            )]),
        };

        let library = decode_library_bytes(serde_json::to_vec(&wire).expect("json").as_slice())
            .expect("library");

        assert!(library.conditions.contains_key("grace_freed"));
        assert!(matches!(
            library.conditions["grace_freed"],
            blackbox_engine::Gate::Any(_)
        ));
    }

    #[test]
    fn extends_append_mode_concatenates_text() {
        let library = sample_library();
        let node = NodeContentWire {
            id: "chapter_death".to_string(),
            extends: Some("game_over".to_string()),
            merge: MergeConfigWire {
                text: ArrayMergeModeWire::Append,
                ..Default::default()
            },
            title: None,
            background_ref: None,
            mode: None,
            text: vec![TextEntryWire::Block(Box::new(TextBlockWire {
                kind: "paragraph".to_string(),
                text: "You stop.".to_string(),
                r#else: None,
                when: None,
                unless: None,
                speaker: None,
                emotion: None,
                side: None,
                actor: None,
            }))],
            on_enter: vec![],
            choices: vec![],
        };

        let resolved = resolve_node_content(node, Some(&library), "chapter test").expect("resolve");
        assert_eq!(resolved.text.len(), 2);
        assert_eq!(resolved.text[0].kind, "stage_direction"); // from template
        assert_eq!(resolved.text[1].text, "You stop."); // from overlay
    }

    #[test]
    fn snippet_params_are_substituted() {
        let wire = LibraryWire {
            spec: LIBRARY_SPEC.to_string(),
            format_version: 1,
            snippets: HashMap::from_iter([(
                "hud".to_string(),
                TextBlockWire {
                    kind: "stage_direction".to_string(),
                    text: "HP: {stat.hp}. {param.extra}".to_string(),
                    r#else: None,
                    when: None,
                    unless: None,
                    speaker: None,
                    emotion: None,
                    side: None,
                    actor: None,
                },
            )]),
            templates: HashMap::default(),
            conditions: HashMap::default(),
        };
        let library = decode_library_bytes(serde_json::to_vec(&wire).expect("json").as_slice())
            .expect("library");

        let node = NodeContentWire {
            id: "test".to_string(),
            extends: None,
            merge: Default::default(),
            title: None,
            background_ref: None,
            mode: None,
            text: vec![TextEntryWire::SnippetRef {
                snippet: "hud".to_string(),
                params: Some(HashMap::from_iter([(
                    "extra".to_string(),
                    "Conviction: {stat.conviction}".to_string(),
                )])),
            }],
            on_enter: vec![],
            choices: vec![],
        };

        let resolved = resolve_node_content(node, Some(&library), "test").expect("resolve");
        assert_eq!(resolved.text.len(), 1);
        assert_eq!(
            resolved.text[0].text,
            "HP: {stat.hp}. Conviction: {stat.conviction}"
        );
    }
}
