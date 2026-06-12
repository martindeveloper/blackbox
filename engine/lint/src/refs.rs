use std::collections::HashSet;

use blackbox::content::{ChoiceContent, Effect, GameContent, ItemAction, NodeContent};
use blackbox::expr::{Expr, parse_expr};
use blackbox::{Condition, Gate};

#[derive(Debug, Default)]
pub struct ContentRefs {
    pub item_ids: HashSet<String>,
    pub items_required: HashSet<String>,
    pub items_granted: HashSet<String>,
    pub flags_set: HashSet<String>,
    pub flags_read: HashSet<String>,
    pub stats_used: HashSet<String>,
    pub nodes_visited: HashSet<String>,
    pub music_tracks: HashSet<String>,
    pub sfx_ids: HashSet<String>,
    pub texture_ids: HashSet<String>,
    pub character_ids: HashSet<String>,
    pub text_relationships: HashSet<String>,
    pub text_stats: HashSet<String>,
    pub text_items: HashSet<String>,
    pub text_flags: HashSet<String>,
    pub text_parse_errors: Vec<String>,
    pub event_ids: HashSet<String>,
}

pub fn collect_content_refs(content: &GameContent) -> ContentRefs {
    let mut refs = ContentRefs::default();

    for node in content.nodes.values() {
        collect_node_refs(node, &mut refs);
    }

    for character in content.characters.characters.values() {
        refs.character_ids.insert(character.id.clone());
        if let Some(portrait_ref) = &character.portrait_ref {
            refs.texture_ids.insert(portrait_ref.clone());
        }
    }

    for item in content.items.items.values() {
        if let Some(icon_ref) = &item.icon_ref {
            refs.texture_ids.insert(icon_ref.clone());
        }
        if let Some(examine_text) = &item.examine_text {
            collect_text_refs(examine_text, &node_label(&item.id), &mut refs);
        }
        for action in &item.actions {
            collect_item_action_refs(action, &mut refs);
        }
    }

    if let Some(default_sfx) = &content.assets.default_choice_sfx {
        refs.sfx_ids.insert(default_sfx.clone());
    }

    refs
}

fn node_label(node_id: &str) -> String {
    format!("item '{node_id}' examineText")
}

fn collect_node_refs(node: &NodeContent, refs: &mut ContentRefs) {
    if let Some(background_ref) = &node.background_ref {
        refs.texture_ids.insert(background_ref.clone());
    }

    for effect in &node.on_enter {
        collect_effect_refs(effect, refs);
    }

    for (index, block) in node.text.iter().enumerate() {
        collect_text_refs(
            &block.text,
            &format!("node '{}' text[{index}]", node.id),
            refs,
        );
        if let Some(else_text) = &block.else_text {
            collect_text_refs(
                else_text,
                &format!("node '{}' text[{index}] else", node.id),
                refs,
            );
        }
        if let Some(gate) = &block.when {
            collect_gate_refs(gate, refs);
        }
        if let Some(gate) = &block.unless {
            collect_gate_refs(gate, refs);
        }
    }

    for choice in &node.choices {
        collect_choice_refs(choice, refs);
    }
}

fn collect_choice_refs(choice: &ChoiceContent, refs: &mut ContentRefs) {
    if let Some(sfx) = &choice.presentation.sfx {
        refs.sfx_ids.insert(sfx.clone());
    }

    if let Some(requires) = &choice.gate.requires {
        collect_gate_refs(requires, refs);
    }
    if let Some(gate) = &choice.gate.when {
        collect_gate_refs(gate, refs);
    }
    if let Some(gate) = &choice.gate.unless {
        collect_gate_refs(gate, refs);
    }

    for effect in &choice.resolution.effects {
        collect_effect_refs(effect, refs);
    }

    if let Some(check) = &choice.resolution.check {
        refs.stats_used.insert(check.stat.clone());
        for effect in &check.on_success.effects {
            collect_effect_refs(effect, refs);
        }
        for effect in &check.on_failure.effects {
            collect_effect_refs(effect, refs);
        }
    }
}

fn collect_item_action_refs(action: &ItemAction, refs: &mut ContentRefs) {
    if let Some(requires) = &action.gate.requires {
        collect_gate_refs(requires, refs);
    }
    if let Some(gate) = &action.gate.when {
        collect_gate_refs(gate, refs);
    }
    if let Some(gate) = &action.gate.unless {
        collect_gate_refs(gate, refs);
    }

    for effect in &action.effects {
        collect_effect_refs(effect, refs);
    }
}

fn collect_gate_refs(gate: &Gate, refs: &mut ContentRefs) {
    match gate {
        Gate::All(children) | Gate::Any(children) => {
            for child in children {
                collect_gate_refs(child, refs);
            }
        }
        Gate::Not(child) => collect_gate_refs(child, refs),
        Gate::Condition(condition) => collect_condition_refs(condition, refs),
    }
}

fn collect_condition_refs(condition: &Condition, refs: &mut ContentRefs) {
    match condition {
        Condition::HasItem { item_id, .. } => {
            refs.item_ids.insert(item_id.clone());
            refs.items_required.insert(item_id.clone());
        }
        Condition::HasFlag { flag, .. } => {
            refs.flags_read.insert(flag.clone());
        }
        Condition::StatGte { stat, .. }
        | Condition::StatLte { stat, .. }
        | Condition::StatEq { stat, .. } => {
            refs.stats_used.insert(stat.clone());
        }
        Condition::Visited { node_id, .. } => {
            refs.nodes_visited.insert(node_id.clone());
        }
        Condition::AtNode { node_id, .. } => {
            refs.nodes_visited.insert(node_id.clone());
        }
        Condition::RelationshipGte { character_id, .. }
        | Condition::RelationshipLte { character_id, .. }
        | Condition::RelationshipEq { character_id, .. }
        | Condition::ActorPresent { character_id, .. } => {
            refs.character_ids.insert(character_id.clone());
        }
    }
}

fn collect_effect_refs(effect: &Effect, refs: &mut ContentRefs) {
    match effect {
        Effect::SetFlag { flag, .. } => {
            refs.flags_set.insert(flag.clone());
        }
        Effect::ModifyStat { stat, .. } => {
            refs.stats_used.insert(stat.clone());
        }
        Effect::AddItem { item_id, .. } => {
            refs.item_ids.insert(item_id.clone());
            refs.items_granted.insert(item_id.clone());
        }
        Effect::RemoveItem { item_id, .. } => {
            refs.item_ids.insert(item_id.clone());
        }
        Effect::PlayMusic { track } => {
            refs.music_tracks.insert(track.clone());
        }
        Effect::PlaySfx { sfx } => {
            refs.sfx_ids.insert(sfx.clone());
        }
        Effect::Roll {
            store_flag: Some(flag),
            ..
        } => {
            refs.flags_set.insert(flag.clone());
        }
        Effect::ModifyRelationship { character_id, .. } => {
            refs.character_ids.insert(character_id.clone());
        }
        Effect::AddEvent { event_id } => {
            refs.event_ids.insert(event_id.clone());
        }
        Effect::StopMusic | Effect::Roll { .. } => {}
        Effect::SetActorPresent { character_id, .. } => {
            refs.character_ids.insert(character_id.clone());
        }
    }
}

pub fn collect_text_refs(text: &str, context: &str, refs: &mut ContentRefs) {
    for segment in extract_interpolation_segments(text) {
        let full_context = format!("{context} {{{segment}}}");
        match parse_expr(&segment) {
            Ok(expr) => collect_expr_refs(&expr, refs),
            Err(error) => refs
                .text_parse_errors
                .push(format!("{full_context}: {error}")),
        }
    }
}

fn collect_expr_refs(expr: &Expr, refs: &mut ContentRefs) {
    match expr {
        Expr::Var { var } => {
            if let Some(stat) = var.strip_prefix("stat.") {
                refs.text_stats.insert(stat.to_string());
            } else if let Some(item) = var.strip_prefix("item.") {
                refs.text_items.insert(item.to_string());
            } else if let Some(flag) = var.strip_prefix("flag.") {
                refs.text_flags.insert(flag.to_string());
            } else if let Some(rest) = var.strip_prefix("relationship.") {
                refs.text_relationships.insert(rest.to_string());
            }
        }
        Expr::Call { args, .. } => {
            for arg in args {
                collect_expr_refs(arg, refs);
            }
        }
        Expr::Op { left, right, .. } => {
            collect_expr_refs(left, refs);
            if let Some(right) = right {
                collect_expr_refs(right, refs);
            }
        }
        Expr::Builtin(_) => {}
        Expr::Lit(_) => {}
    }
}

fn extract_interpolation_segments(text: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '}' {
            if chars.peek() == Some(&'}') {
                chars.next();
            }
            continue;
        }

        if ch != '{' {
            continue;
        }

        if chars.peek() == Some(&'{') {
            chars.next();
            continue;
        }

        let mut expr_str = String::new();
        for c in chars.by_ref() {
            if c == '}' {
                break;
            }
            expr_str.push(c);
        }

        segments.push(expr_str.trim().to_string());
    }

    segments
}
