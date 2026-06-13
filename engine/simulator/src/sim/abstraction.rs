//! Behavioural value abstraction for state deduplication.
//!
//! The goal/explore search dedupes states by [`super::work::StateKey`]. Numeric
//! dimensions — player stats and per-character relationship metrics — are mutated
//! by effects such as `modifyRelationship`, frequently inside dialogue hubs that
//! loop back on themselves (e.g. Silent Archive's `mnemex_first_exchange` and
//! `echo_first_contact`). Because two states that differ only in such a value
//! hash to *different* keys, the search treats every loop iteration as a brand
//! new state, the frontier explodes, and the per-goal budget is exhausted long
//! before the productive path is explored.
//!
//! Key observation: a numeric dimension only changes future behaviour through
//! the comparisons that read it. If every gate that reads `relationship.echo.awe`
//! tests it against the constants `{3, 5}`, then all values `≥ 5` are
//! interchangeable, as are all values in `(3, 5)`, `(−∞, 3)`, and the exact
//! points `3` and `5`. [`ValueAbstraction`] scans the scenario once, collecting
//! every constant each stat / relationship metric is compared against, and at
//! hashing time replaces a raw value with the equivalence class ("bucket")
//! induced by those constants. Two values in the same bucket satisfy *exactly*
//! the same set of gate comparisons, so merging them is sound.
//!
//! Three outcomes per dimension:
//!   * **Drop** — no gate anywhere reads it; it cannot affect branching, so it is
//!     excluded from the key entirely.
//!   * **Bucket** — read only via constant comparisons; replaced by its bucket.
//!   * **Exact** (`Opaque`) — read in a way we cannot reduce to constant
//!     comparisons (arithmetic, comparison against another variable, …); hashed
//!     exactly so we never merge unsoundly.

use std::collections::{BTreeSet, HashSet};

use blackbox::content::{ChoiceGate, GameContent};
use blackbox::expr::{BuiltinVar, Expr, ExprValue};
use blackbox::{Condition, Gate};
use rustc_hash::{FxHashMap, FxHashSet};

/// How a single numeric dimension is folded into the dedup key.
#[derive(Debug, Clone)]
enum Dim {
    /// Sorted, unique, non-empty list of constants the dimension is compared
    /// against. Bucketed by the equivalence classes those constants induce.
    Thresholds(Vec<i32>),
    /// Read in a non-constant way; must be hashed exactly.
    Opaque,
}

/// Outcome of abstracting one stat / relationship value, consumed by `StateKey`.
pub enum Abstracted {
    /// Not read by any gate — leave out of the key.
    Drop,
    /// Hash this small bucket code instead of the raw value.
    Bucket(u32),
    /// Hash the raw value (dimension is `Opaque`).
    Exact(i32),
}

#[derive(Debug, Default)]
pub struct ValueAbstraction {
    stats: FxHashMap<String, Dim>,
    /// Keyed `character → metric → Dim` so the hot-path lookup borrows `&str`
    /// arguments without allocating a `(String, String)` tuple key.
    rels: FxHashMap<String, FxHashMap<String, Dim>>,
    /// Flags some gate actually reads (incl. synthetic `_actor_*` keys from
    /// `actorPresent`). Write-only flags are narrative markers that cannot
    /// affect branching, so they are dropped from the dedup key — the discrete
    /// analogue of `Drop` for numeric dimensions.
    read_flags: FxHashSet<String>,
    /// A gate reads a flag whose name we could not resolve statically (dynamic
    /// expression argument). Disables flag dropping entirely for safety.
    flags_opaque: bool,
}

impl ValueAbstraction {
    /// Scan all gates in the scenario and derive the per-dimension abstraction.
    pub fn build(content: &GameContent) -> Self {
        let mut builder = Builder::default();

        for node in content.nodes.values() {
            for block in &node.text {
                builder.visit_gate(block.when.as_ref());
                builder.visit_gate(block.unless.as_ref());
                builder.visit_expr(block.compiled_when.as_ref());
                builder.visit_expr(block.compiled_unless.as_ref());
            }
            for choice in &node.choices {
                builder.visit_choice_gate(&choice.gate);
            }
        }

        for item in content.items.items.values() {
            for action in &item.actions {
                builder.visit_choice_gate(&action.gate);
            }
        }

        builder.finish()
    }

    pub fn stat(&self, name: &str, value: i32) -> Abstracted {
        match self.stats.get(name) {
            None => Abstracted::Drop,
            Some(Dim::Opaque) => Abstracted::Exact(value),
            Some(Dim::Thresholds(thr)) => Abstracted::Bucket(bucket(thr, value)),
        }
    }

    pub fn rel(&self, character_id: &str, metric: &str, value: i32) -> Abstracted {
        match self.rels.get(character_id).and_then(|m| m.get(metric)) {
            None => Abstracted::Drop,
            Some(Dim::Opaque) => Abstracted::Exact(value),
            Some(Dim::Thresholds(thr)) => Abstracted::Bucket(bucket(thr, value)),
        }
    }

    /// Whether `flag` can influence future behaviour and must stay in the key.
    pub fn flag_is_read(&self, flag: &str) -> bool {
        self.flags_opaque || self.read_flags.contains(flag)
    }
}

/// Equivalence-class index of `v` under the sorted, unique thresholds `thr`.
///
/// Two values map to the same code iff they compare identically (`<`, `=`, `>`)
/// against every threshold — i.e. they are indistinguishable by any
/// `gte`/`lte`/`gt`/`lt`/`eq`/`ne` gate using these constants. `rank` counts
/// thresholds strictly below `v`; the `eq` bit distinguishes "exactly on a
/// threshold" from "strictly between two thresholds", which `eq`/`ne` gates need.
fn bucket(thr: &[i32], v: i32) -> u32 {
    let rank = thr.partition_point(|&t| t < v) as u32;
    let on_threshold = thr.get(rank as usize) == Some(&v);
    rank * 2 + on_threshold as u32
}

#[derive(Default)]
struct Builder {
    stat_thresholds: FxHashMap<String, BTreeSet<i32>>,
    stat_opaque: HashSet<String>,
    rel_thresholds: FxHashMap<(String, String), BTreeSet<i32>>,
    rel_opaque: HashSet<(String, String)>,
    read_flags: FxHashSet<String>,
    flags_opaque: bool,
}

/// A numeric dimension reference recovered from an expression.
enum DimRef {
    Stat(String),
    Rel(String, String),
}

impl Builder {
    fn visit_choice_gate(&mut self, gate: &ChoiceGate) {
        self.visit_gate(gate.requires.as_ref());
        self.visit_gate(gate.when.as_ref());
        self.visit_gate(gate.unless.as_ref());
        self.visit_expr(gate.compiled_requires.as_ref());
        self.visit_expr(gate.compiled_when.as_ref());
        self.visit_expr(gate.compiled_unless.as_ref());
    }

    // --- Structured gates: every threshold here is a clean constant comparison.

    fn visit_gate(&mut self, gate: Option<&Gate>) {
        let Some(gate) = gate else { return };
        match gate {
            Gate::All(children) | Gate::Any(children) => {
                for child in children {
                    self.visit_gate(Some(child));
                }
            }
            Gate::Not(inner) => self.visit_gate(Some(inner)),
            Gate::Condition(condition) => self.visit_condition(condition),
        }
    }

    fn visit_condition(&mut self, condition: &Condition) {
        match condition {
            Condition::HasFlag { flag, .. } => {
                self.read_flags.insert(flag.clone());
            }
            Condition::ActorPresent { character_id, .. } => {
                self.read_flags
                    .insert(blackbox::actor_flag_key(character_id));
            }
            Condition::StatGte { stat, value, .. }
            | Condition::StatLte { stat, value, .. }
            | Condition::StatEq { stat, value, .. } => self.add_stat_threshold(stat, *value),
            Condition::RelationshipGte {
                character_id,
                metric,
                value,
                ..
            }
            | Condition::RelationshipLte {
                character_id,
                metric,
                value,
                ..
            }
            | Condition::RelationshipEq {
                character_id,
                metric,
                value,
                ..
            } => self.add_rel_threshold(character_id, metric, *value),
            _ => {}
        }
    }

    // --- Compiled expressions: catch raw-expression gates the structured walk
    //     misses, and mark any non-constant numeric use as opaque.

    fn visit_expr(&mut self, expr: Option<&Expr>) {
        if let Some(expr) = expr {
            self.walk_expr(expr);
        }
    }

    fn walk_expr(&mut self, expr: &Expr) {
        // Flag reads: structured conditions compile to `Builtin(HasFlag)` or
        // `hasFlag(<name>, <value>)`; raw expressions may use `flag.<name>` /
        // `flag("<name>")`. A non-literal name defeats static resolution and
        // turns flag dropping off wholesale.
        match expr {
            Expr::Builtin(BuiltinVar::HasFlag(flag)) => {
                self.read_flags.insert(flag.clone());
                return;
            }
            Expr::Var { var } => {
                if let Some(flag) = var.strip_prefix("flag.") {
                    self.read_flags.insert(flag.to_string());
                    return;
                }
            }
            Expr::Call { call, args } if call == "hasFlag" || call == "flag" => {
                match args.first() {
                    Some(Expr::Lit(ExprValue::String(flag))) => {
                        self.read_flags.insert(flag.clone());
                    }
                    _ => self.flags_opaque = true,
                }
                for arg in args.iter().skip(1) {
                    self.walk_expr(arg);
                }
                return;
            }
            _ => {}
        }

        if let Expr::Op {
            op,
            left,
            right: Some(right),
        } = expr
            && is_comparison(op)
        {
            // Clean comparison `dim <cmp> literal` (or the mirror): record the
            // threshold and recurse only into the non-dimension side, so the
            // dimension operand is "consumed" rather than flagged opaque.
            if let (Some(dim), Some(lit)) = (as_dim_ref(left), as_number(right)) {
                self.add_dim_threshold(&dim, lit);
                self.walk_expr(right);
                return;
            }
            if let (Some(lit), Some(dim)) = (as_number(left), as_dim_ref(right)) {
                self.add_dim_threshold(&dim, lit);
                self.walk_expr(left);
                return;
            }
        }

        // Any dimension reference reached here is used in a non-constant context.
        if let Some(dim) = as_dim_ref(expr) {
            self.mark_opaque(&dim);
            return;
        }

        match expr {
            Expr::Op { left, right, .. } => {
                self.walk_expr(left);
                if let Some(right) = right {
                    self.walk_expr(right);
                }
            }
            Expr::Call { args, .. } => {
                for arg in args {
                    self.walk_expr(arg);
                }
            }
            Expr::Lit(_) | Expr::Builtin(_) | Expr::Var { .. } => {}
        }
    }

    fn add_dim_threshold(&mut self, dim: &DimRef, value: i32) {
        match dim {
            DimRef::Stat(stat) => self.add_stat_threshold(stat, value),
            DimRef::Rel(character_id, metric) => {
                self.add_rel_threshold(character_id, metric, value)
            }
        }
    }

    fn mark_opaque(&mut self, dim: &DimRef) {
        match dim {
            DimRef::Stat(stat) => {
                self.stat_opaque.insert(stat.clone());
            }
            DimRef::Rel(character_id, metric) => {
                self.rel_opaque
                    .insert((character_id.clone(), metric.clone()));
            }
        }
    }

    fn add_stat_threshold(&mut self, stat: &str, value: i32) {
        self.stat_thresholds
            .entry(stat.to_string())
            .or_default()
            .insert(value);
    }

    fn add_rel_threshold(&mut self, character_id: &str, metric: &str, value: i32) {
        self.rel_thresholds
            .entry((character_id.to_string(), metric.to_string()))
            .or_default()
            .insert(value);
    }

    fn finish(self) -> ValueAbstraction {
        let mut stats = FxHashMap::default();
        for (name, thresholds) in self.stat_thresholds {
            // Opaque wins: any non-constant use forces exact hashing.
            if self.stat_opaque.contains(&name) {
                stats.insert(name, Dim::Opaque);
            } else {
                stats.insert(name, Dim::Thresholds(thresholds.into_iter().collect()));
            }
        }
        for name in self.stat_opaque {
            stats.entry(name).or_insert(Dim::Opaque);
        }

        let mut rels: FxHashMap<String, FxHashMap<String, Dim>> = FxHashMap::default();
        for ((character_id, metric), thresholds) in self.rel_thresholds {
            let dim = if self
                .rel_opaque
                .contains(&(character_id.clone(), metric.clone()))
            {
                Dim::Opaque
            } else {
                Dim::Thresholds(thresholds.into_iter().collect())
            };
            rels.entry(character_id).or_default().insert(metric, dim);
        }
        for (character_id, metric) in self.rel_opaque {
            rels.entry(character_id)
                .or_default()
                .entry(metric)
                .or_insert(Dim::Opaque);
        }

        ValueAbstraction {
            stats,
            rels,
            read_flags: self.read_flags,
            flags_opaque: self.flags_opaque,
        }
    }
}

fn is_comparison(op: &str) -> bool {
    matches!(op, "gte" | "lte" | "gt" | "lt" | "eq" | "ne")
}

fn as_number(expr: &Expr) -> Option<i32> {
    match expr {
        Expr::Lit(ExprValue::Number(n)) => Some(*n),
        _ => None,
    }
}

/// Recognise an expression that simply reads a stat or relationship metric, in
/// either the `Var` form (`stat.hp`, `relationship.yuen.trust`) the engine
/// compiles structured conditions into, or the `Call` form (`stat("hp")`,
/// `relationship("yuen", "trust")`) a raw expression might use.
fn as_dim_ref(expr: &Expr) -> Option<DimRef> {
    match expr {
        Expr::Var { var } => {
            if let Some(stat) = var.strip_prefix("stat.") {
                return Some(DimRef::Stat(stat.to_string()));
            }
            if let Some(rest) = var.strip_prefix("relationship.") {
                let (character_id, metric) = rest.split_once('.')?;
                return Some(DimRef::Rel(character_id.to_string(), metric.to_string()));
            }
            None
        }
        Expr::Call { call, args } => match call.as_str() {
            "stat" => match args.first() {
                Some(Expr::Lit(ExprValue::String(name))) => Some(DimRef::Stat(name.clone())),
                _ => None,
            },
            "relationship" => match (args.first(), args.get(1)) {
                (
                    Some(Expr::Lit(ExprValue::String(character_id))),
                    Some(Expr::Lit(ExprValue::String(metric))),
                ) => Some(DimRef::Rel(character_id.clone(), metric.clone())),
                _ => None,
            },
            _ => None,
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_separates_by_thresholds() {
        let thr = vec![3, 5];
        let codes: Vec<u32> = [2, 3, 4, 5, 6].iter().map(|&v| bucket(&thr, v)).collect();
        let unique: HashSet<u32> = codes.iter().copied().collect();
        assert_eq!(unique.len(), 5);
        assert_eq!(bucket(&thr, 6), bucket(&thr, 100));
        assert_eq!(bucket(&thr, 0), bucket(&thr, 2));
        assert_ne!(bucket(&thr, 5), bucket(&thr, 6));
    }

    fn content_from(scenario: &str) -> GameContent {
        blackbox_format::decode_scenario_bundle_json(
            scenario.as_bytes(),
            br#"{"spec":"com.blackbox.items","formatVersion":1,"items":{}}"#,
            br#"{"spec":"com.blackbox.characters","formatVersion":1,"characters":{"yuen":{"id":"yuen","name":"Yuen","relationships":{"trust":0}}}}"#,
            br#"{"spec":"com.blackbox.assets.bundle","formatVersion":1,"textures":{},"music":{},"sfx":{}}"#,
            None::<&[u8]>,
            None::<&[u8]>,
            Vec::<&[u8]>::new(),
        )
        .expect("decode")
    }

    #[test]
    fn unreferenced_dimension_is_dropped_referenced_is_bucketed() {
        // `empathy` is gated (statGte 3); `trust` relationship is gated
        // (relationshipGte 2). No gate reads `logic`.
        let content = content_from(
            r#"{"spec":"com.blackbox.scenario","formatVersion":1,"startNodeId":"start","nodes":{
                "start":{"id":"start","choices":[
                    {"id":"a","label":"A","requires":[{"type":"statGte","stat":"empathy","value":3}],"goto":"mid"},
                    {"id":"b","label":"B","requires":[{"type":"relationshipGte","characterId":"yuen","metric":"trust","value":2}],"goto":"mid"}
                ]},
                "mid":{"id":"mid","mode":"ending","choices":[]}
            }}"#,
        );
        let abs = ValueAbstraction::build(&content);

        assert!(matches!(abs.stat("logic", 99), Abstracted::Drop));
        assert!(matches!(abs.stat("empathy", 1), Abstracted::Bucket(_)));
        let (b1, b5) = (abs.stat("empathy", 1), abs.stat("empathy", 5));
        match (b1, b5) {
            (Abstracted::Bucket(a), Abstracted::Bucket(b)) => assert_ne!(a, b),
            _ => panic!("expected buckets"),
        }
        assert!(matches!(abs.rel("yuen", "trust", 0), Abstracted::Bucket(_)));
        assert!(matches!(abs.rel("yuen", "awe", 0), Abstracted::Drop));
    }
}
