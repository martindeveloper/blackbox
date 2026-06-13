use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use blackbox_format::parse_scenario_manifest;
use serde_json::Value;

use crate::report::{LintIssue, LintReport};

#[derive(Debug)]
pub struct SourceBundle {
    pub characters: HashSet<String>,
    pub character_names: HashSet<String>,
    pub catalog_flags: HashSet<String>,
    /// Relationship metrics declared per character in `characters.json`.
    pub declared_relationship_metrics: HashMap<String, HashSet<String>>,
    pub library_snippets: HashSet<String>,
    pub library_templates: HashSet<String>,
    pub library_conditions: HashSet<String>,
    /// Value of `libraryRef` on the scenario manifest, when set.
    pub scenario_library_ref: Option<String>,
    /// Parsed content-bearing documents: `(file label, json value)`.
    pub documents: Vec<(String, Value)>,
}

pub fn load_source_bundle(scenario_path: &Path, report: &mut LintReport) -> Option<SourceBundle> {
    let scenario_bytes = match fs::read(scenario_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            report.push(
                LintIssue::error(
                    "syntax",
                    format!("read {}: {error}", scenario_path.display()),
                )
                .with_context(scenario_path.display().to_string()),
            );
            return None;
        }
    };

    let base_dir = scenario_path.parent()?;
    let manifest = match parse_scenario_manifest(&scenario_bytes) {
        Ok(manifest) => manifest,
        Err(error) => {
            report.push(
                LintIssue::error("syntax", error.to_string())
                    .with_context(scenario_path.display().to_string()),
            );
            return None;
        }
    };

    let mut documents = Vec::new();

    let scenario_value = parse_json_file(scenario_path, "scenario", &scenario_bytes, report)?;
    documents.push((scenario_path.display().to_string(), scenario_value));

    for file_name in [
        &manifest.items_file,
        &manifest.characters_file,
        &manifest.assets_file,
    ] {
        let path = base_dir.join(file_name);
        if let Some(value) = read_json_document(&path, file_name, report) {
            documents.push((path.display().to_string(), value));
        }
    }

    if let Some(catalog_file) = &manifest.catalog_file {
        let path = base_dir.join(catalog_file);
        if let Some(value) = read_json_document(&path, catalog_file, report) {
            documents.push((path.display().to_string(), value));
        }
    }

    if let Some(library_file) = &manifest.library_file {
        let path = base_dir.join(library_file);
        if let Some(value) = read_json_document(&path, library_file, report) {
            documents.push((path.display().to_string(), value));
        }
    }

    for chapter in &manifest.chapters {
        let path = base_dir.join(&chapter.file_name);
        if let Some(value) = read_json_document(&path, &chapter.file_name, report) {
            documents.push((path.display().to_string(), value));
        }
    }

    let characters = character_ids_from_documents(&documents);
    let character_names = character_names_from_documents(&documents);
    let catalog_flags = catalog_flags_from_documents(&documents);
    let declared_relationship_metrics = declared_relationship_metrics_from_documents(&documents);
    let (library_snippets, library_templates, library_conditions) =
        library_catalog_from_documents(&documents);
    let scenario_library_ref = scenario_library_ref_from_documents(&documents);

    Some(SourceBundle {
        characters,
        character_names,
        catalog_flags,
        declared_relationship_metrics,
        library_snippets,
        library_templates,
        library_conditions,
        scenario_library_ref,
        documents,
    })
}

fn read_json_document(path: &Path, label: &str, report: &mut LintReport) -> Option<Value> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            report.push(
                LintIssue::error("syntax", format!("read {label}: {error}"))
                    .with_context(path.display().to_string()),
            );
            return None;
        }
    };
    parse_json_file(path, label, &bytes, report)
}

fn parse_json_file(
    path: &Path,
    label: &str,
    bytes: &[u8],
    report: &mut LintReport,
) -> Option<Value> {
    match serde_json::from_slice(bytes) {
        Ok(value) => Some(value),
        Err(error) => {
            report.push(
                LintIssue::error("syntax", format!("{label}: {error}"))
                    .with_context(path.display().to_string()),
            );
            None
        }
    }
}

fn character_ids_from_documents(documents: &[(String, Value)]) -> HashSet<String> {
    let mut ids = HashSet::new();
    for (_, value) in documents {
        let Some(characters) = value.get("characters").and_then(Value::as_object) else {
            continue;
        };
        for (id, entry) in characters {
            ids.insert(id.clone());
            if let Some(entry_id) = entry.get("id").and_then(Value::as_str) {
                ids.insert(entry_id.to_string());
            }
        }
    }
    ids
}

fn character_names_from_documents(documents: &[(String, Value)]) -> HashSet<String> {
    let mut names = HashSet::new();
    for (_, value) in documents {
        let Some(characters) = value.get("characters").and_then(Value::as_object) else {
            continue;
        };
        for entry in characters.values() {
            if let Some(name) = entry.get("name").and_then(Value::as_str) {
                names.insert(name.to_string());
            }
        }
    }
    names
}

fn library_catalog_from_documents(
    documents: &[(String, Value)],
) -> (HashSet<String>, HashSet<String>, HashSet<String>) {
    let mut snippets = HashSet::new();
    let mut templates = HashSet::new();
    let mut conditions = HashSet::new();
    for (_, value) in documents {
        if !is_library_document(value) {
            continue;
        }
        if let Some(entries) = value.get("snippets").and_then(Value::as_object) {
            snippets.extend(entries.keys().cloned());
        }
        if let Some(entries) = value.get("templates").and_then(Value::as_object) {
            templates.extend(entries.keys().cloned());
        }
        if let Some(entries) = value.get("conditions").and_then(Value::as_object) {
            conditions.extend(entries.keys().cloned());
        }
    }
    (snippets, templates, conditions)
}

fn scenario_library_ref_from_documents(documents: &[(String, Value)]) -> Option<String> {
    documents.iter().find_map(|(_, value)| {
        if value
            .get("spec")
            .and_then(Value::as_str)
            .is_none_or(|spec| spec != "com.blackbox.scenario")
        {
            return None;
        }
        value
            .get("libraryRef")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

pub fn is_library_document(value: &Value) -> bool {
    value
        .get("spec")
        .and_then(Value::as_str)
        .is_some_and(|spec| spec == "com.blackbox.library")
}

pub fn snippet_id_from_text_entry(entry: &Value) -> Option<String> {
    if let Some(raw) = entry.as_str() {
        return raw.strip_prefix('@').map(str::to_string);
    }
    entry
        .get("$snippet")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn catalog_flags_from_documents(documents: &[(String, Value)]) -> HashSet<String> {
    let mut flags = HashSet::new();
    for (_, value) in documents {
        let Some(catalog_flags) = value.get("flags").and_then(Value::as_object) else {
            continue;
        };
        flags.extend(catalog_flags.keys().cloned());
    }
    flags
}

pub fn resolve_character(speaker: &str, bundle: &SourceBundle) -> bool {
    bundle.characters.contains(speaker) || bundle.character_names.contains(speaker)
}

pub fn visit_content_nodes<F>(documents: &[(String, Value)], mut visit: F)
where
    F: FnMut(&str, &str, &Value),
{
    for (file, value) in documents {
        visit_nodes_in_value(file, value, &mut visit);
    }
}

/// Recursively walk a JSON gate value, calling `visitor(gate_type, gate_node, context)` for
/// every leaf gate node. Composite gates (`all`, `any`, `not`, bare arrays) are traversed
/// transparently — the visitor only sees typed leaf nodes.
pub fn walk_gate_nodes<F>(gate: &Value, context: &str, visitor: &mut F)
where
    F: FnMut(&str, &Value, &str),
{
    if let Some(gate_type) = gate.get("type").and_then(Value::as_str) {
        match gate_type {
            "all" | "any" => {
                if let Some(children) = gate.get("conditions").and_then(Value::as_array) {
                    for (i, child) in children.iter().enumerate() {
                        walk_gate_nodes(child, &format!("{context}.{gate_type}[{i}]"), visitor);
                    }
                }
            }
            "not" => {
                if let Some(inner) = gate.get("condition") {
                    walk_gate_nodes(inner, &format!("{context}.not"), visitor);
                }
            }
            t => visitor(t, gate, context),
        }
    } else if let Some(arr) = gate.as_array() {
        for (i, child) in arr.iter().enumerate() {
            walk_gate_nodes(child, &format!("{context}[{i}]"), visitor);
        }
    }
}

/// Walk nodes, items, and death nodes; invoke `visit` with string contexts for refs.
pub fn visit_all_string_contexts<F>(documents: &[(String, Value)], visit: &mut F)
where
    F: FnMut(&str),
{
    for (file, value) in documents {
        if let Some(nodes) = value.get("nodes").and_then(Value::as_object) {
            for (node_id, node) in nodes {
                visit_node_content(file, node_id, node, visit);
            }
        }
        if let Some(death_node) = value.get("deathNode") {
            visit_node_content(file, "__death__", death_node, visit);
        }
        if let Some(items) = value.get("items").and_then(Value::as_object) {
            for (item_id, item) in items {
                visit_item_content(file, item_id, item, visit);
            }
        }
    }
}

fn visit_nodes_in_value<F>(file: &str, value: &Value, visit: &mut F)
where
    F: FnMut(&str, &str, &Value),
{
    if let Some(nodes) = value.get("nodes").and_then(Value::as_object) {
        for (node_id, node) in nodes {
            visit(file, node_id, node);
        }
    }

    if let Some(death_node) = value.get("deathNode") {
        visit(file, "__death__", death_node);
    }
}

fn visit_item_content<F>(file: &str, item_id: &str, item: &Value, visit: &mut F)
where
    F: FnMut(&str),
{
    if let Some(actions) = item.get("actions").and_then(Value::as_array) {
        for (index, action) in actions.iter().enumerate() {
            let context = format!("{file} item '{item_id}' action[{index}]");
            visit_effects(&context, action.get("effects"), visit);
            visit_gate(&context, action.get("when"), visit);
            visit_gate(&context, action.get("unless"), visit);
            visit_gate(&context, action.get("requires"), visit);
        }
    }
    if let Some(examine_text) = item.get("examineText").and_then(Value::as_str) {
        let context = format!("{file} item '{item_id}' examineText");
        visit_text(&context, examine_text, visit);
    }
}

pub fn visit_node_content<F>(file: &str, node_id: &str, node: &Value, visit: &mut F)
where
    F: FnMut(&str),
{
    let base = format!("{file} node '{node_id}'");

    if let Some(template_id) = node.get("$extends").and_then(Value::as_str) {
        visit(&format!("{base} $extends '{template_id}'"));
    }

    if let Some(text_blocks) = node.get("text").and_then(Value::as_array) {
        for (index, block) in text_blocks.iter().enumerate() {
            let context = format!("{base} text[{index}]");
            if let Some(snippet) = block.as_str() {
                if snippet.starts_with('@') {
                    visit(&format!("{context} snippet '{snippet}'"));
                }
                continue;
            }
            if let Some(snippet_id) = block.get("$snippet").and_then(Value::as_str) {
                visit(&format!("{context} snippet '@{snippet_id}'"));
                continue;
            }
            if let Some(speaker) = block.get("speaker").and_then(Value::as_str) {
                visit(&format!("{context} speaker '{speaker}'"));
            }
            if let Some(text) = block.get("text").and_then(Value::as_str) {
                visit_text(&context, text, visit);
            }
            if let Some(text) = block.get("else").and_then(Value::as_str) {
                visit_text(&format!("{context} else"), text, visit);
            }
            visit_gate(&context, block.get("when"), visit);
            visit_gate(&context, block.get("unless"), visit);
        }
    }

    visit_effects(&base, node.get("onEnter"), visit);

    if let Some(choices) = node.get("choices").and_then(Value::as_array) {
        for (index, choice) in choices.iter().enumerate() {
            let choice_id = choice.get("id").and_then(Value::as_str).unwrap_or("?");
            let context = format!("{base} choice '{choice_id}'[{index}]");

            visit_effects(&context, choice.get("effects"), visit);
            visit_gate(&context, choice.get("when"), visit);
            visit_gate(&context, choice.get("unless"), visit);
            visit_gate(&context, choice.get("requires"), visit);

            if let Some(check) = choice.get("check") {
                visit_skill_check(&context, check, visit);
            }
        }
    }
}

fn visit_skill_check<F>(context: &str, check: &Value, visit: &mut F)
where
    F: FnMut(&str),
{
    for branch in ["onSuccess", "onFailure", "onExhausted"] {
        let Some(outcome) = check.get(branch) else {
            continue;
        };
        let branch_context = format!("{context} check.{branch}");
        visit_effects(&branch_context, outcome.get("effects"), visit);
    }
}

fn visit_effects<F>(context: &str, effects: Option<&Value>, visit: &mut F)
where
    F: FnMut(&str),
{
    let Some(effects) = effects.and_then(Value::as_array) else {
        return;
    };
    for (index, effect) in effects.iter().enumerate() {
        let effect_context = format!("{context} effect[{index}]");
        visit_effect(&effect_context, effect, visit);
    }
}

fn visit_effect<F>(context: &str, effect: &Value, visit: &mut F)
where
    F: FnMut(&str),
{
    let Some(effect_type) = effect.get("type").and_then(Value::as_str) else {
        return;
    };

    match effect_type {
        "modifyRelationship" => {
            if let (Some(character_id), Some(metric)) = (
                effect.get("characterId").and_then(Value::as_str),
                effect.get("metric").and_then(Value::as_str),
            ) {
                visit(&format!(
                    "{context} modifyRelationship characterId='{character_id}' metric='{metric}'"
                ));
            }
        }
        "setFlag" => {
            if let Some(flag) = effect.get("flag").and_then(Value::as_str) {
                visit(&format!("{context} setFlag flag='{flag}'"));
            }
        }
        _ => {}
    }
}

fn visit_gate<F>(context: &str, gate: Option<&Value>, visit: &mut F)
where
    F: FnMut(&str),
{
    let Some(gate) = gate else {
        return;
    };

    if let Some(gate_type) = gate.get("type").and_then(Value::as_str) {
        match gate_type {
            "all" | "any" => {
                if let Some(children) = gate.get("conditions").and_then(Value::as_array) {
                    for (index, child) in children.iter().enumerate() {
                        visit_gate(
                            &format!("{context} gate.{gate_type}[{index}]"),
                            Some(child),
                            visit,
                        );
                    }
                }
            }
            "not" => {
                visit_gate(&format!("{context} gate.not"), gate.get("condition"), visit);
            }
            _ => visit_condition(context, gate, visit),
        }
    }
}

fn visit_condition<F>(context: &str, condition: &Value, visit: &mut F)
where
    F: FnMut(&str),
{
    let Some(condition_type) = condition.get("type").and_then(Value::as_str) else {
        return;
    };

    if matches!(
        condition_type,
        "relationshipGte" | "relationshipLte" | "relationshipEq"
    ) && let (Some(character_id), Some(metric)) = (
        condition.get("characterId").and_then(Value::as_str),
        condition.get("metric").and_then(Value::as_str),
    ) {
        visit(&format!(
            "{context} {condition_type} characterId='{character_id}' metric='{metric}'"
        ));
    }
}

pub fn visit_text<F>(context: &str, text: &str, visit: &mut F)
where
    F: FnMut(&str),
{
    for segment in extract_interpolation_segments(text) {
        if segment.starts_with("relationship.") {
            visit(&format!("{context} text {{{segment}}}"));
        }
    }
}

pub fn declared_relationship_metrics_from_documents(
    documents: &[(String, Value)],
) -> HashMap<String, HashSet<String>> {
    let mut metrics = HashMap::new();
    for (_, value) in documents {
        let Some(characters) = value.get("characters").and_then(Value::as_object) else {
            continue;
        };
        for (character_id, character) in characters {
            let Some(scores) = character.get("relationships").and_then(Value::as_object) else {
                continue;
            };
            let keys = scores.keys().cloned().collect::<HashSet<_>>();
            if !keys.is_empty() {
                metrics.insert(character_id.clone(), keys);
            }
        }
    }
    metrics
}

pub fn is_declared_relationship_metric(
    declared: &HashMap<String, HashSet<String>>,
    character_id: &str,
    metric: &str,
) -> bool {
    declared
        .get(character_id)
        .is_some_and(|metrics| metrics.contains(metric))
}

/// A character declared in `characters.json`, with the alias tokens (map key, `id`, `name`)
/// that content may legitimately reference it by.
#[derive(Debug)]
pub struct DeclaredCharacter {
    pub id: String,
    pub aliases: HashSet<String>,
}

/// Enumerate every character declared across the source documents.
pub fn declared_characters_from_documents(documents: &[(String, Value)]) -> Vec<DeclaredCharacter> {
    let mut declared = Vec::new();
    for (_, value) in documents {
        let Some(characters) = value.get("characters").and_then(Value::as_object) else {
            continue;
        };
        for (key, entry) in characters {
            let mut aliases = HashSet::from([key.clone()]);
            if let Some(id) = entry.get("id").and_then(Value::as_str) {
                aliases.insert(id.to_string());
            }
            if let Some(name) = entry.get("name").and_then(Value::as_str) {
                aliases.insert(name.to_string());
            }
            declared.push(DeclaredCharacter {
                id: key.clone(),
                aliases,
            });
        }
    }
    declared
}

/// Effect/condition `type` values that carry a `characterId` (and, for relationships, a `metric`).
const RELATIONSHIP_REF_TYPES: [&str; 4] = [
    "modifyRelationship",
    "relationshipGte",
    "relationshipLte",
    "relationshipEq",
];

/// Collect every character token referenced by content: dialogue `speaker`/`actor`, actor gates
/// and effects (`actorPresent`/`setActorPresent`), relationship gates/effects, and
/// `{relationship.X.metric}` text interpolations. Over-collecting is safe — it only suppresses
/// false "unused" reports.
pub fn collect_referenced_characters(documents: &[(String, Value)]) -> HashSet<String> {
    let mut refs = HashSet::new();
    for (_, value) in documents {
        walk_character_refs(value, &mut refs);
    }
    refs
}

fn walk_character_refs(value: &Value, refs: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(kind) = map.get("type").and_then(Value::as_str)
                && (kind == "actorPresent"
                    || kind == "setActorPresent"
                    || RELATIONSHIP_REF_TYPES.contains(&kind))
                && let Some(character_id) = map.get("characterId").and_then(Value::as_str)
            {
                refs.insert(character_id.to_string());
            }
            for key in ["speaker", "actor"] {
                if let Some(token) = map.get(key).and_then(Value::as_str) {
                    refs.insert(token.to_string());
                }
            }
            for child in map.values() {
                walk_character_refs(child, refs);
            }
        }
        Value::Array(items) => {
            for child in items {
                walk_character_refs(child, refs);
            }
        }
        Value::String(text) => {
            for segment in extract_interpolation_segments(text) {
                if let Some((character_id, _)) = parse_relationship_text_var(&segment) {
                    refs.insert(character_id.to_string());
                }
            }
        }
        _ => {}
    }
}

/// Collect every `(characterId, metric)` relationship pair referenced by content — via
/// `modifyRelationship`/`relationship*` gates and effects, and `{relationship.X.metric}` text.
pub fn collect_referenced_relationship_metrics(
    documents: &[(String, Value)],
) -> HashSet<(String, String)> {
    let mut refs = HashSet::new();
    for (_, value) in documents {
        walk_relationship_metric_refs(value, &mut refs);
    }
    refs
}

fn walk_relationship_metric_refs(value: &Value, refs: &mut HashSet<(String, String)>) {
    match value {
        Value::Object(map) => {
            if let Some(kind) = map.get("type").and_then(Value::as_str)
                && RELATIONSHIP_REF_TYPES.contains(&kind)
                && let (Some(character_id), Some(metric)) = (
                    map.get("characterId").and_then(Value::as_str),
                    map.get("metric").and_then(Value::as_str),
                )
            {
                refs.insert((character_id.to_string(), metric.to_string()));
            }
            for child in map.values() {
                walk_relationship_metric_refs(child, refs);
            }
        }
        Value::Array(items) => {
            for child in items {
                walk_relationship_metric_refs(child, refs);
            }
        }
        Value::String(text) => {
            for segment in extract_interpolation_segments(text) {
                if let Some((character_id, metric)) = parse_relationship_text_var(&segment) {
                    refs.insert((character_id.to_string(), metric.to_string()));
                }
            }
        }
        _ => {}
    }
}

pub fn parse_relationship_text_var(segment: &str) -> Option<(&str, &str)> {
    let rest = segment.strip_prefix("relationship.")?;
    let (character_id, metric) = rest.rsplit_once('.')?;
    if character_id.is_empty() || metric.is_empty() {
        return None;
    }
    Some((character_id, metric))
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn docs(values: Vec<Value>) -> Vec<(String, Value)> {
        values
            .into_iter()
            .enumerate()
            .map(|(i, value)| (format!("doc{i}.json"), value))
            .collect()
    }

    #[test]
    fn declared_characters_capture_key_id_and_name() {
        let documents = docs(vec![json!({
            "characters": {
                "vesper": { "id": "vesper", "name": "VESPER" }
            }
        })]);

        let declared = declared_characters_from_documents(&documents);
        assert_eq!(declared.len(), 1);
        assert_eq!(declared[0].id, "vesper");
        assert!(declared[0].aliases.contains("vesper"));
        assert!(declared[0].aliases.contains("VESPER"));
    }

    #[test]
    fn collect_referenced_characters_covers_every_reference_form() {
        let documents = docs(vec![json!({
            "nodes": {
                "n1": {
                    "text": [
                        { "speaker": "vesper", "text": "Hello {relationship.echo.resonance}." },
                        { "actor": "sable", "text": "..." }
                    ],
                    "when": { "type": "actorPresent", "characterId": "augur" },
                    "choices": [{
                        "id": "c1",
                        "effects": [
                            { "type": "modifyRelationship", "characterId": "grace", "metric": "mercy" },
                            { "type": "setActorPresent", "characterId": "mnemex" }
                        ]
                    }]
                }
            }
        })]);

        let refs = collect_referenced_characters(&documents);
        for expected in ["vesper", "sable", "augur", "grace", "mnemex", "echo"] {
            assert!(refs.contains(expected), "missing '{expected}' in {refs:?}");
        }
    }

    #[test]
    fn unused_character_is_not_referenced() {
        let documents = docs(vec![
            json!({
                "characters": {
                    "vesper": { "id": "vesper", "name": "VESPER" },
                    "ghost": { "id": "ghost", "name": "GHOST" }
                }
            }),
            json!({
                "nodes": {
                    "n1": { "text": [{ "speaker": "VESPER", "text": "Hi." }] }
                }
            }),
        ]);

        let declared = declared_characters_from_documents(&documents);
        let referenced = collect_referenced_characters(&documents);

        let unused: Vec<&str> = declared
            .iter()
            .filter(|c| !c.aliases.iter().any(|a| referenced.contains(a)))
            .map(|c| c.id.as_str())
            .collect();

        assert_eq!(unused, vec!["ghost"]);
    }

    #[test]
    fn unused_relationship_metric_is_not_referenced() {
        let documents = docs(vec![json!({
            "nodes": {
                "n1": {
                    "choices": [{
                        "id": "c1",
                        "effects": [
                            { "type": "modifyRelationship", "characterId": "grace", "metric": "mercy" }
                        ]
                    }]
                }
            }
        })]);

        let declared = declared_relationship_metrics_from_documents(&docs(vec![json!({
            "characters": {
                "grace": { "id": "grace", "relationships": { "mercy": 0, "trust": 0 } }
            }
        })]));
        let referenced = collect_referenced_relationship_metrics(&documents);

        assert!(referenced.contains(&("grace".to_string(), "mercy".to_string())));

        let mut unused: Vec<(&str, &str)> = Vec::new();
        for (character_id, metrics) in &declared {
            for metric in metrics {
                if !referenced.contains(&(character_id.clone(), metric.clone())) {
                    unused.push((character_id.as_str(), metric.as_str()));
                }
            }
        }
        assert_eq!(unused, vec![("grace", "trust")]);
    }
}
