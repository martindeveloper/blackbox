use rustc_hash::FxHashMap as HashMap;

use crate::error::EngineError;
use crate::state::GameState;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RelationshipScores(pub HashMap<String, i32>);

impl RelationshipScores {
    pub fn get(&self, metric: &str) -> i32 {
        self.0.get(metric).copied().unwrap_or(0)
    }

    pub fn modify(&mut self, metric: &str, delta: i32) {
        *self.0.entry(metric.to_string()).or_insert(0) += delta;
    }
}

pub fn relationship_score(
    relationships: &HashMap<String, RelationshipScores>,
    character_id: &str,
    metric: &str,
) -> i32 {
    relationships
        .get(character_id)
        .map(|scores| scores.get(metric))
        .unwrap_or(0)
}

pub fn modify_relationship(state: &mut GameState, character_id: &str, metric: &str, delta: i32) {
    state
        .relationships
        .entry(character_id.to_string())
        .or_default()
        .modify(metric, delta);
}

pub fn validate_relationship_metric(
    default_relationships: &HashMap<String, RelationshipScores>,
    character_id: &str,
    metric: &str,
    context: &str,
) -> Result<(), EngineError> {
    if metric.is_empty() {
        return Err(EngineError::ValidationError(format!(
            "{context}: relationship metric must not be empty"
        )));
    }

    let Some(defaults) = default_relationships.get(character_id) else {
        return Err(EngineError::ValidationError(format!(
            "{context}: character '{character_id}' has no relationship metrics declared (metric '{metric}')"
        )));
    };

    if !defaults.0.contains_key(metric) {
        return Err(EngineError::ValidationError(format!(
            "{context}: metric '{metric}' is not declared on character '{character_id}'"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_metrics_round_trip_through_scores() {
        let mut scores = RelationshipScores::default();
        scores.modify("submission", 2);
        scores.modify("suspicion", -1);
        assert_eq!(scores.get("submission"), 2);
        assert_eq!(scores.get("suspicion"), -1);
        assert_eq!(scores.get("trust"), 0);
    }

    #[test]
    fn validate_accepts_declared_custom_metric() {
        let mut defaults = HashMap::default();
        defaults.insert(
            "sable".to_string(),
            RelationshipScores(HashMap::from_iter([
                ("submission".to_string(), 0),
                ("suspicion".to_string(), 1),
            ])),
        );

        validate_relationship_metric(&defaults, "sable", "submission", "test")
            .expect("submission should be valid");
    }

    #[test]
    fn validate_rejects_undeclared_metric() {
        let mut defaults = HashMap::default();
        defaults.insert(
            "sable".to_string(),
            RelationshipScores(HashMap::from_iter([("submission".to_string(), 0)])),
        );

        let error = validate_relationship_metric(&defaults, "sable", "trust", "test").unwrap_err();
        assert!(matches!(error, EngineError::ValidationError(_)));
    }
}
