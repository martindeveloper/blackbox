use std::collections::HashSet;

use crate::compile::compile_content;
use crate::condition::Condition;
use crate::content::{ChoiceAction, Effect, GameContent, NodeMode, SkillCheckOutcome};
use crate::error::EngineError;
use crate::gate::Gate;
use crate::logging;
use crate::relationship::validate_relationship_metric;

const ACTOR_FLAG_PREFIX: &str = "_actor_";

fn chapter_is_loaded(content: &GameContent, chapter_id: &str) -> bool {
    content
        .node_chapter
        .values()
        .any(|owner| owner == chapter_id)
}

fn all_chapters_loaded(content: &GameContent) -> bool {
    content.chapters.is_empty()
        || content
            .chapters
            .iter()
            .all(|chapter| chapter_is_loaded(content, &chapter.id))
}

fn defer_missing_node_check(content: &GameContent) -> bool {
    !content.chapters.is_empty() && !all_chapters_loaded(content)
}

fn require_known_node(
    content: &GameContent,
    target: &str,
    message: String,
) -> Result<(), EngineError> {
    if content.nodes.contains_key(target) || defer_missing_node_check(content) {
        Ok(())
    } else {
        Err(EngineError::ValidationError(message))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ValidationOptions {
    pub error_on_missing_assets: bool,
}

impl Default for ValidationOptions {
    fn default() -> Self {
        Self {
            error_on_missing_assets: true,
        }
    }
}

pub fn validate_content(content: &mut GameContent) -> Result<(), EngineError> {
    validate_content_with_options(content, ValidationOptions::default())
}

pub fn validate_content_with_options(
    content: &mut GameContent,
    options: ValidationOptions,
) -> Result<(), EngineError> {
    logging::debug_fields(
        "validation",
        "validating content",
        serde_json::json!({
            "revision": content.revision,
            "nodes": content.nodes.len(),
            "items": content.items.items.len(),
            "characters": content.characters.characters.len(),
        }),
    );
    if content.start_node_id.is_empty() {
        return Err(EngineError::ValidationError(
            "start node id must not be empty".to_string(),
        ));
    }

    if !content.nodes.contains_key(&content.start_node_id) && !defer_missing_node_check(content) {
        return Err(EngineError::ValidationError(format!(
            "start node does not exist: {}",
            content.start_node_id
        )));
    }

    if let Some(default_sfx) = &content.assets.default_choice_sfx
        && !content.assets.sfx.contains_key(default_sfx)
        && options.error_on_missing_assets
    {
        return Err(EngineError::ValidationError(format!(
            "default choice sfx does not exist: {default_sfx}"
        )));
    }

    for (character_id, character) in &content.characters.characters {
        if character_id != &character.id {
            return Err(EngineError::ValidationError(format!(
                "character key '{character_id}' does not match character id '{}'",
                character.id
            )));
        }
        if character.name.is_empty() {
            return Err(EngineError::ValidationError(format!(
                "character '{character_id}' must have a name"
            )));
        }
        if let Some(portrait_ref) = &character.portrait_ref
            && !content.assets.textures.contains_key(portrait_ref)
            && options.error_on_missing_assets
        {
            return Err(EngineError::ValidationError(format!(
                "character '{character_id}' references missing portrait texture '{portrait_ref}'"
            )));
        }
    }

    for (character_id, overrides) in &content.default_relationships {
        let Some(character) = content.characters.characters.get(character_id) else {
            return Err(EngineError::ValidationError(format!(
                "merged relationship defaults reference unknown character '{character_id}'"
            )));
        };
        for metric in overrides.0.keys() {
            if !character.relationships.0.contains_key(metric) {
                return Err(EngineError::ValidationError(format!(
                    "merged relationship defaults for '{character_id}' include undeclared metric '{metric}'"
                )));
            }
        }
    }

    for (item_id, item) in &content.items.items {
        if item_id != &item.id {
            return Err(EngineError::ValidationError(format!(
                "item key '{item_id}' does not match item id '{}'",
                item.id
            )));
        }
        if item.name.is_empty() {
            return Err(EngineError::ValidationError(format!(
                "item '{item_id}' must have a name"
            )));
        }
        let mut seen_actions = HashSet::new();
        for action in &item.actions {
            if action.id.is_empty() {
                return Err(EngineError::ValidationError(format!(
                    "item '{item_id}' has an action with an empty id"
                )));
            }
            if !seen_actions.insert(action.id.clone()) {
                return Err(EngineError::ValidationError(format!(
                    "duplicate action id '{}' on item '{item_id}'",
                    action.id
                )));
            }
            validate_item_action(content, item_id, action, options)?;
        }
        if let Some(icon_ref) = &item.icon_ref
            && !content.assets.textures.contains_key(icon_ref)
            && options.error_on_missing_assets
        {
            return Err(EngineError::ValidationError(format!(
                "item '{item_id}' references missing texture '{icon_ref}'"
            )));
        }
    }

    for (key, node) in &content.nodes {
        if node.id.is_empty() {
            return Err(EngineError::ValidationError(
                "node id must not be empty".to_string(),
            ));
        }

        if key != &node.id {
            return Err(EngineError::ValidationError(format!(
                "node key '{}' does not match node id '{}'",
                key, node.id
            )));
        }

        for (index, block) in node.text.iter().enumerate() {
            if let Some(gate) = &block.when
                && !gate.is_pure()
            {
                return Err(EngineError::ValidationError(format!(
                    "text block {index} in node '{}' when must not call random() or dice()",
                    node.id
                )));
            }
            if let Some(gate) = &block.unless
                && !gate.is_pure()
            {
                return Err(EngineError::ValidationError(format!(
                    "text block {index} in node '{}' unless must not call random() or dice()",
                    node.id
                )));
            }
            if let Some(character_id) = &block.actor
                && !content
                    .characters
                    .characters
                    .contains_key(character_id.as_str())
            {
                return Err(EngineError::ValidationError(format!(
                    "text block {index} in node '{}' actor '{}' is not a known character",
                    node.id, character_id
                )));
            }
            if let Some(gate) = &block.when {
                validate_gate(
                    content,
                    &format!("text block {index} in node '{}'", node.id),
                    gate,
                )?;
            }
            if let Some(gate) = &block.unless {
                validate_gate(
                    content,
                    &format!("text block {index} in node '{}'", node.id),
                    gate,
                )?;
            }
        }

        for choice in &node.choices {
            if let Some(gate) = &choice.gate.when
                && !gate.is_pure()
            {
                return Err(EngineError::ValidationError(format!(
                    "choice '{}' in node '{}' when must not call random() or dice()",
                    choice.presentation.id, node.id
                )));
            }
            if let Some(gate) = &choice.gate.unless
                && !gate.is_pure()
            {
                return Err(EngineError::ValidationError(format!(
                    "choice '{}' in node '{}' unless must not call random() or dice()",
                    choice.presentation.id, node.id
                )));
            }
        }

        if let Some(background_ref) = &node.background_ref
            && !content.assets.textures.contains_key(background_ref)
            && options.error_on_missing_assets
        {
            return Err(EngineError::ValidationError(format!(
                "node '{}' references missing background texture '{background_ref}'",
                node.id
            )));
        }

        for effect in &node.on_enter {
            validate_effect(content, &node.id, "onEnter", effect, options)?;
        }

        let mut seen_choices = HashSet::new();

        for choice in &node.choices {
            let choice_id = &choice.presentation.id;

            if choice_id.is_empty() {
                return Err(EngineError::ValidationError(format!(
                    "choice id must not be empty in node '{}'",
                    node.id
                )));
            }

            if !seen_choices.insert(choice_id.clone()) {
                return Err(EngineError::ValidationError(format!(
                    "duplicate choice id '{choice_id}' in node '{}'",
                    node.id
                )));
            }

            if let Some(requires) = &choice.gate.requires {
                validate_gate(
                    content,
                    &format!("node '{}' choice '{choice_id}' requires", node.id),
                    requires,
                )?;
            }
            if let Some(gate) = &choice.gate.when {
                validate_gate(
                    content,
                    &format!("node '{}' choice '{choice_id}' when", node.id),
                    gate,
                )?;
            }
            if let Some(gate) = &choice.gate.unless {
                validate_gate(
                    content,
                    &format!("node '{}' choice '{choice_id}' unless", node.id),
                    gate,
                )?;
            }

            for effect in &choice.resolution.effects {
                validate_effect(content, &node.id, choice_id, effect, options)?;
            }

            if let Some(check) = &choice.resolution.check {
                validate_skill_check(content, &node.id, choice_id, check, options)?;
            }

            if let Some(sfx_id) = &choice.presentation.sfx
                && !content.assets.sfx.contains_key(sfx_id)
                && options.error_on_missing_assets
            {
                return Err(EngineError::ValidationError(format!(
                    "choice '{choice_id}' in node '{}' references missing sfx '{sfx_id}'",
                    node.id
                )));
            }

            if let Some(target) = &choice.resolution.goto {
                require_known_node(
                    content,
                    target,
                    format!(
                        "choice '{choice_id}' in node '{}' points to missing node '{target}'",
                        node.id
                    ),
                )?;
            }

            if let Some(ChoiceAction::RestartGame { start_node_id }) = &choice.resolution.action {
                require_known_node(
                    content,
                    start_node_id,
                    format!(
                        "choice '{choice_id}' in node '{}' restarts at missing node '{start_node_id}'",
                        node.id
                    ),
                )?;
            }

            if let Some(ChoiceAction::GotoChapter {
                chapter_id,
                node_id,
            }) = &choice.resolution.action
            {
                let chapter = content
                    .chapters
                    .iter()
                    .find(|chapter| chapter.id == *chapter_id);
                if chapter.is_none() {
                    return Err(EngineError::ValidationError(format!(
                        "choice '{choice_id}' in node '{}' references unknown chapter '{chapter_id}'",
                        node.id
                    )));
                }
                if let Some(node_id) = node_id {
                    require_known_node(
                        content,
                        node_id,
                        format!(
                            "choice '{choice_id}' in node '{}' gotoChapter targets missing node '{node_id}'",
                            node.id
                        ),
                    )?;
                }
            }

            if choice.resolution.check.is_none()
                && choice.resolution.action.is_none()
                && choice.resolution.goto.is_none()
                && choice.resolution.effects.is_empty()
            {
                return Err(EngineError::ValidationError(format!(
                    "choice '{choice_id}' in node '{}' has no effects, goto, action, or check",
                    node.id
                )));
            }
        }
    }

    if let Some(death_node_id) = &content.death_node_id {
        validate_death_node(content, death_node_id, None)?;
    }

    for chapter in &content.chapters {
        if let Some(death_node_id) = &chapter.death_node_id {
            if content.death_node_id.is_none() {
                return Err(EngineError::ValidationError(format!(
                    "chapter '{}' deathNodeId requires scenario deathNode",
                    chapter.id
                )));
            }
            if chapter_is_loaded(content, &chapter.id) {
                validate_death_node(content, death_node_id, Some(&chapter.id))?;
            }
        }
    }

    content.assets.build_resolved_cues();
    compile_content(content)?;
    logging::debug("validation", "content validation passed");
    Ok(())
}

fn validate_skill_check(
    content: &GameContent,
    node_id: &str,
    choice_id: &str,
    check: &crate::content::SkillCheckContent,
    options: ValidationOptions,
) -> Result<(), EngineError> {
    if check.stat.is_empty() {
        return Err(EngineError::ValidationError(format!(
            "choice '{choice_id}' in node '{node_id}' has empty skill check stat"
        )));
    }

    match (check.max_attempts, check.on_exhausted.as_ref()) {
        (Some(max), None) => {
            return Err(EngineError::ValidationError(format!(
                "choice '{choice_id}' in node '{node_id}' has maxAttempts ({max}) but no onExhausted branch"
            )));
        }
        (None, Some(_)) => {
            return Err(EngineError::ValidationError(format!(
                "choice '{choice_id}' in node '{node_id}' has onExhausted but no maxAttempts"
            )));
        }
        (Some(0), _) => {
            return Err(EngineError::ValidationError(format!(
                "choice '{choice_id}' in node '{node_id}' maxAttempts must be at least 1"
            )));
        }
        _ => {}
    }

    validate_skill_outcome(
        content,
        node_id,
        choice_id,
        "onSuccess",
        &check.on_success,
        options,
    )?;
    validate_skill_outcome(
        content,
        node_id,
        choice_id,
        "onFailure",
        &check.on_failure,
        options,
    )?;

    if let Some(exhausted) = &check.on_exhausted {
        validate_skill_outcome(
            content,
            node_id,
            choice_id,
            "onExhausted",
            exhausted,
            options,
        )?;
    }

    Ok(())
}

fn validate_skill_outcome(
    content: &GameContent,
    node_id: &str,
    choice_id: &str,
    branch: &str,
    outcome: &SkillCheckOutcome,
    options: ValidationOptions,
) -> Result<(), EngineError> {
    for effect in &outcome.effects {
        validate_effect(
            content,
            node_id,
            &format!("{choice_id}.{branch}"),
            effect,
            options,
        )?;
    }

    if let Some(target) = &outcome.goto {
        require_known_node(
            content,
            target,
            format!(
                "choice '{choice_id}' in node '{node_id}' skill check {branch} points to missing node '{target}'"
            ),
        )?;
    }

    if outcome.goto.is_none() && outcome.effects.is_empty() {
        return Err(EngineError::ValidationError(format!(
            "choice '{choice_id}' in node '{node_id}' skill check {branch} needs effects or goto"
        )));
    }

    Ok(())
}

fn validate_item_action(
    content: &GameContent,
    item_id: &str,
    action: &crate::content::ItemAction,
    options: ValidationOptions,
) -> Result<(), EngineError> {
    let action_id = &action.id;
    if let Some(gate) = &action.gate.when
        && !gate.is_pure()
    {
        return Err(EngineError::ValidationError(format!(
            "item '{item_id}' action '{action_id}' when must not call random() or dice()"
        )));
    }
    if let Some(gate) = &action.gate.unless
        && !gate.is_pure()
    {
        return Err(EngineError::ValidationError(format!(
            "item '{item_id}' action '{action_id}' unless must not call random() or dice()"
        )));
    }

    if let Some(requires) = &action.gate.requires {
        validate_gate(
            content,
            &format!("item '{item_id}' action '{action_id}' requires"),
            requires,
        )?;
    }
    if let Some(gate) = &action.gate.when {
        validate_gate(
            content,
            &format!("item '{item_id}' action '{action_id}' when"),
            gate,
        )?;
    }
    if let Some(gate) = &action.gate.unless {
        validate_gate(
            content,
            &format!("item '{item_id}' action '{action_id}' unless"),
            gate,
        )?;
    }

    for effect in &action.effects {
        validate_effect(
            content,
            item_id,
            &format!("{item_id}.{action_id}"),
            effect,
            options,
        )?;
    }

    if let Some(target) = &action.goto {
        require_known_node(
            content,
            target,
            format!("item '{item_id}' action '{action_id}' points to missing node '{target}'"),
        )?;
    }

    if action.goto.is_none() && action.effects.is_empty() {
        return Err(EngineError::ValidationError(format!(
            "item '{item_id}' action '{action_id}' needs effects or goto"
        )));
    }

    Ok(())
}

fn validate_effect(
    content: &GameContent,
    node_id: &str,
    context: &str,
    effect: &Effect,
    options: ValidationOptions,
) -> Result<(), EngineError> {
    match effect {
        Effect::SetFlag { flag, .. } if flag.starts_with(ACTOR_FLAG_PREFIX) => {
            let character_id = &flag[ACTOR_FLAG_PREFIX.len()..];
            return Err(EngineError::ValidationError(format!(
                "effect in node '{node_id}' ({context}) writes reserved flag '{flag}'; \
                 use setActorPresent {{ characterId: \"{character_id}\" }} instead"
            )));
        }
        Effect::PlayMusic { track }
            if !content.assets.music.contains_key(track) && options.error_on_missing_assets =>
        {
            return Err(EngineError::ValidationError(format!(
                "effect playMusic in node '{node_id}' ({context}) references missing track '{track}'"
            )));
        }
        Effect::PlaySfx { sfx }
            if !content.assets.sfx.contains_key(sfx) && options.error_on_missing_assets =>
        {
            return Err(EngineError::ValidationError(format!(
                "effect playSfx in node '{node_id}' ({context}) references missing sfx '{sfx}'"
            )));
        }
        Effect::AddItem { item_id, .. } | Effect::RemoveItem { item_id, .. }
            if !content.items.items.contains_key(item_id) =>
        {
            return Err(EngineError::ValidationError(format!(
                "effect in node '{node_id}' ({context}) references missing item '{item_id}'"
            )));
        }
        Effect::SetActorPresent { character_id, .. } => {
            if !content
                .characters
                .characters
                .contains_key(character_id.as_str())
            {
                return Err(EngineError::ValidationError(format!(
                    "setActorPresent in node '{node_id}' ({context}) references unknown character '{character_id}'"
                )));
            }
        }
        Effect::ModifyRelationship {
            character_id,
            metric,
            amount,
            amount_expr,
            ..
        } => {
            if !content.characters.characters.contains_key(character_id) {
                return Err(EngineError::ValidationError(format!(
                    "effect in node '{node_id}' ({context}) references missing character '{character_id}'"
                )));
            }
            validate_relationship_metric(
                &content.default_relationships,
                character_id,
                metric,
                &format!("effect in node '{node_id}' ({context})"),
            )?;
            if amount.is_none() && amount_expr.is_none() {
                return Err(EngineError::ValidationError(format!(
                    "effect modifyRelationship in node '{node_id}' ({context}) requires amount or amountExpr"
                )));
            }
        }
        _ => {}
    }

    Ok(())
}

fn validate_gate(content: &GameContent, context: &str, gate: &Gate) -> Result<(), EngineError> {
    match gate {
        Gate::All(children) | Gate::Any(children) => {
            for child in children {
                validate_gate(content, context, child)?;
            }
        }
        Gate::Not(child) => validate_gate(content, context, child)?,
        Gate::Condition(condition) => validate_condition(content, context, condition)?,
    }
    Ok(())
}

fn validate_condition(
    content: &GameContent,
    context: &str,
    condition: &Condition,
) -> Result<(), EngineError> {
    match condition {
        Condition::RelationshipGte {
            character_id,
            metric,
            ..
        }
        | Condition::RelationshipLte {
            character_id,
            metric,
            ..
        }
        | Condition::RelationshipEq {
            character_id,
            metric,
            ..
        } => {
            if !content.characters.characters.contains_key(character_id) {
                return Err(EngineError::ValidationError(format!(
                    "{context}: unknown character '{character_id}'"
                )));
            }
            validate_relationship_metric(
                &content.default_relationships,
                character_id,
                metric,
                context,
            )?;
        }
        Condition::ActorPresent { character_id, .. }
            if !content.characters.characters.contains_key(character_id) =>
        {
            return Err(EngineError::ValidationError(format!(
                "{context}: unknown character '{character_id}' in actorPresent gate"
            )));
        }
        _ => {}
    }
    Ok(())
}

fn validate_death_node(
    content: &GameContent,
    death_node_id: &str,
    chapter_id: Option<&str>,
) -> Result<(), EngineError> {
    let label = match chapter_id {
        Some(chapter_id) => format!("chapter '{chapter_id}' deathNodeId"),
        None => "deathNode".to_string(),
    };

    let node = content.nodes.get(death_node_id).ok_or_else(|| {
        EngineError::ValidationError(format!("{label} references missing node '{death_node_id}'"))
    })?;
    if node.mode != NodeMode::GameOver {
        return Err(EngineError::ValidationError(format!(
            "{label} '{death_node_id}' must use mode game_over"
        )));
    }

    if let Some(chapter_id) = chapter_id {
        let owner = content.node_chapter.get(death_node_id).ok_or_else(|| {
            EngineError::ValidationError(format!(
                "{label} '{death_node_id}' is not owned by any chapter"
            ))
        })?;
        if owner != chapter_id {
            return Err(EngineError::ValidationError(format!(
                "{label} '{death_node_id}' belongs to chapter '{owner}', not '{chapter_id}'"
            )));
        }
    }

    Ok(())
}
