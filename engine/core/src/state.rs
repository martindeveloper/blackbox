use rustc_hash::{FxHashMap as HashMap, FxHashSet as HashSet};

use crate::relationship::RelationshipScores;
use crate::rng::DEFAULT_RANDOM_SEED;
use crate::value::DynamicValue;

#[derive(Debug, Clone)]
pub struct GameState {
    pub current_node_id: String,
    /// Mirrors `GameContent::revision` at the time the game was started. Used to
    /// detect stale saves when the scenario changes.
    pub revision: Option<String>,
    pub player: PlayerState,
    pub inventory: InventoryState,
    pub flags: HashMap<String, DynamicValue>,
    pub relationships: HashMap<String, RelationshipScores>,
    pub events: Vec<String>,
    pub visited_nodes: Vec<String>,
    pub ambient_music: Option<String>,
    pub ambient_background: Option<String>,
    pub random_seed: u64,
    pub random_counter: u64,
    /// Tracks how many times each `maxAttempts` choice has been attempted.
    /// Keys are `"{node_id}:{choice_id}"`. Persisted in saves.
    pub choice_attempts: HashMap<String, u32>,
    event_set: HashSet<String>,
    visited_set: HashSet<String>,
}

#[derive(Debug, Clone)]
pub struct PlayerState {
    pub stats: HashMap<String, i32>,
}

#[derive(Debug, Clone)]
pub struct InventoryState {
    pub items: HashMap<String, u32>,
}

/// Fields deserialized from a save snapshot before visited-set reconstruction.
#[derive(Debug, Clone)]
pub struct RestoredSnapshot {
    pub current_node_id: String,
    pub revision: Option<String>,
    pub player: PlayerState,
    pub inventory: InventoryState,
    pub flags: HashMap<String, DynamicValue>,
    pub relationships: HashMap<String, RelationshipScores>,
    pub events: Vec<String>,
    pub visited_nodes: Vec<String>,
    pub ambient_music: Option<String>,
    pub ambient_background: Option<String>,
    pub random_seed: u64,
    pub random_counter: u64,
    pub choice_attempts: HashMap<String, u32>,
}

impl GameState {
    pub fn restored(snapshot: RestoredSnapshot) -> Self {
        let mut state = Self {
            current_node_id: snapshot.current_node_id,
            revision: snapshot.revision,
            player: snapshot.player,
            inventory: snapshot.inventory,
            flags: snapshot.flags,
            relationships: snapshot.relationships,
            events: snapshot.events,
            visited_nodes: snapshot.visited_nodes,
            ambient_music: snapshot.ambient_music,
            ambient_background: snapshot.ambient_background,
            random_seed: snapshot.random_seed,
            random_counter: snapshot.random_counter,
            choice_attempts: snapshot.choice_attempts,
            event_set: HashSet::default(),
            visited_set: HashSet::default(),
        };
        state.rebuild_event_set();
        state.rebuild_visited_set();
        state
    }

    pub fn new(
        start_node_id: impl Into<String>,
        revision: Option<String>,
        default_stats: &HashMap<String, i32>,
        default_relationships: &HashMap<String, RelationshipScores>,
        random_seed: u64,
    ) -> Self {
        let mut state = Self {
            current_node_id: start_node_id.into(),
            revision,
            player: PlayerState {
                stats: default_stats.clone(),
            },
            inventory: InventoryState {
                items: HashMap::default(),
            },
            flags: HashMap::default(),
            relationships: default_relationships.clone(),
            events: Vec::new(),
            visited_nodes: Vec::new(),
            ambient_music: None,
            ambient_background: None,
            random_seed,
            random_counter: 0,
            choice_attempts: HashMap::default(),
            event_set: HashSet::default(),
            visited_set: HashSet::default(),
        };
        state.rebuild_event_set();
        state.rebuild_visited_set();
        state
    }

    pub fn rebuild_event_set(&mut self) {
        self.event_set = self.events.iter().cloned().collect();
    }

    pub fn rebuild_visited_set(&mut self) {
        self.visited_set = self.visited_nodes.iter().cloned().collect();
    }

    /// Rebuild the event/visited lookup sets only if they are out of sync with
    /// their backing vecs (e.g. a state deserialized with empty sets). States
    /// cloned from a live engine already carry consistent sets, and every
    /// mutation path updates set and vec together — so a matching length means
    /// the sets are valid and the rebuild (one string clone plus hash insert
    /// per entry, on every restore) can be skipped.
    pub fn ensure_lookup_sets(&mut self) {
        if self.event_set.len() != self.events.len() {
            self.rebuild_event_set();
        }
        if self.visited_set.len() != self.visited_nodes.len() {
            self.rebuild_visited_set();
        }
    }

    pub fn add_event(&mut self, event_id: String) {
        if self.event_set.insert(event_id.clone()) {
            self.events.push(event_id);
        }
    }

    pub fn has_visited(&self, node_id: &str) -> bool {
        self.visited_set.contains(node_id)
    }

    pub fn mark_visited(&mut self, node_id: &str) {
        if self.visited_set.contains(node_id) {
            return;
        }
        let owned = node_id.to_string();
        self.visited_set.insert(owned.clone());
        self.visited_nodes.push(owned);
    }

    pub fn normalize(&mut self) {
        for stat in self.player.stats.values_mut() {
            if *stat < 0 {
                *stat = 0;
            }
        }
    }

    /// Fills missing character entries from scenario defaults (old saves without `relationships`).
    pub fn backfill_relationship_defaults(
        &mut self,
        defaults: &HashMap<String, RelationshipScores>,
    ) {
        for (character_id, default_scores) in defaults {
            let entry = self.relationships.entry(character_id.clone()).or_default();
            for (metric, value) in &default_scores.0 {
                entry.0.entry(metric.clone()).or_insert(*value);
            }
        }
    }
}

pub fn default_random_seed() -> u64 {
    DEFAULT_RANDOM_SEED
}
