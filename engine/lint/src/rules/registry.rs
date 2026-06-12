use crate::checks::{
    assets, cook, dead_ends, death_nodes, items, reachability, references, validate,
};
use crate::report::LintReport;
use crate::rules::{LintContext, catalog, characters, library, relationships, wire};

/// When a rule runs relative to bundle loading.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RulePhase {
    /// JSON wire envelopes; no engine decode.
    Wire,
    /// Raw JSON analysis (relationships, speakers, catalog refs); no engine decode.
    Source,
    /// Full `GameContent` analysis after successful load.
    Content,
}

/// A single lint rule. Add new entries to [`all_rules`] to extend the linter.
pub struct Rule {
    pub id: &'static str,
    /// Logical group this rule belongs to (e.g. `"characters"`, `"assets"`).
    pub category: &'static str,
    pub phase: RulePhase,
    pub run: fn(&LintContext<'_>, &mut LintReport),
}

impl Rule {
    pub const fn new(
        id: &'static str,
        category: &'static str,
        phase: RulePhase,
        run: fn(&LintContext<'_>, &mut LintReport),
    ) -> Self {
        Self {
            id,
            category,
            phase,
            run,
        }
    }
}

/// Controls which rules execute. Both fields may be combined.
#[derive(Debug, Default, Clone)]
pub struct RuleFilter {
    /// Skip rules whose ID or category appears in this list.
    pub ignore: Vec<String>,
    /// When non-empty, only run rules whose ID or category appears in this list.
    pub only: Vec<String>,
}

impl RuleFilter {
    pub fn allows(&self, rule: &Rule) -> bool {
        if !self.only.is_empty() {
            let included = self.only.iter().any(|s| s == rule.id || s == rule.category);
            if !included {
                return false;
            }
        }
        !self
            .ignore
            .iter()
            .any(|s| s == rule.id || s == rule.category)
    }
}

/// All registered lint rules. Extend this list to add new checks.
pub fn all_rules() -> &'static [Rule] {
    static RULES: &[Rule] = &[
        Rule::new(
            "wire-envelopes",
            "format",
            RulePhase::Wire,
            wire::check_wire_envelopes,
        ),
        Rule::new(
            "unknown-speaker",
            "characters",
            RulePhase::Source,
            characters::check_unknown_speakers,
        ),
        Rule::new(
            "unknown-character-ref",
            "characters",
            RulePhase::Source,
            characters::check_unknown_character_refs,
        ),
        Rule::new(
            "unknown-text-relationship",
            "characters",
            RulePhase::Source,
            characters::check_unknown_text_relationships,
        ),
        Rule::new(
            "unknown-actor",
            "characters",
            RulePhase::Source,
            characters::check_unknown_actors,
        ),
        Rule::new(
            "undeclared-relationship-metric",
            "characters",
            RulePhase::Source,
            relationships::check_undeclared_relationship_metrics,
        ),
        Rule::new(
            "unused-character",
            "characters",
            RulePhase::Source,
            characters::check_unused_characters,
        ),
        Rule::new(
            "unused-relationship-metric",
            "characters",
            RulePhase::Source,
            relationships::check_unused_relationship_metrics,
        ),
        Rule::new(
            "flag-not-in-catalog",
            "catalog",
            RulePhase::Source,
            catalog::check_flags_not_in_catalog,
        ),
        Rule::new(
            "library-refs",
            "library",
            RulePhase::Source,
            library::check_library_refs,
        ),
        Rule::new(
            "engine-validation",
            "engine",
            RulePhase::Content,
            validate::check_engine_validation_rule,
        ),
        Rule::new(
            "reachability",
            "navigation",
            RulePhase::Content,
            reachability::check_reachability_rule,
        ),
        Rule::new(
            "dead-ends",
            "navigation",
            RulePhase::Content,
            dead_ends::check_dead_ends_rule,
        ),
        Rule::new(
            "death-node-coverage",
            "navigation",
            RulePhase::Content,
            death_nodes::check_death_node_coverage_rule,
        ),
        Rule::new(
            "items",
            "items",
            RulePhase::Content,
            items::check_items_rule,
        ),
        Rule::new(
            "assets",
            "assets",
            RulePhase::Content,
            assets::check_asset_files_rule,
        ),
        Rule::new(
            "cook",
            "assets",
            RulePhase::Content,
            cook::check_cook_rules_rule,
        ),
        Rule::new(
            "references",
            "references",
            RulePhase::Content,
            references::check_references_rule,
        ),
    ];
    RULES
}

pub fn run_rules(
    phase: RulePhase,
    ctx: &LintContext<'_>,
    report: &mut LintReport,
    filter: &RuleFilter,
) {
    for rule in all_rules() {
        if rule.phase == phase && filter.allows(rule) {
            (rule.run)(ctx, report);
        }
    }
}
