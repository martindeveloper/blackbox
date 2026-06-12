use rustc_hash::FxHashMap as HashMap;

use crate::gate::Gate;

use super::{ChoiceContent, Effect, NodeMode, TextBlock};

/// Runtime-prepared library: snippets expanded, templates merged, named conditions
/// compiled. Built once at load.
#[derive(Debug, Clone, Default)]
pub struct PreparedLibrary {
    pub snippets: HashMap<String, TextBlock>,
    pub templates: HashMap<String, TemplateBody>,
    /// Named/derived conditions defined in the library `conditions` section.
    /// Reference them from any gate with `{ "type": "condition", "id": "<name>" }`.
    pub conditions: HashMap<String, Gate>,
}

/// Resolved template body (no node id).
#[derive(Debug, Clone)]
pub struct TemplateBody {
    pub title: Option<String>,
    pub background_ref: Option<String>,
    pub mode: NodeMode,
    pub text: Vec<TextBlock>,
    pub on_enter: Vec<Effect>,
    pub choices: Vec<ChoiceContent>,
}
