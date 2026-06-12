use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum EngineError {
    #[error("failed to decode content ({format}): {message}")]
    ContentDecodeError { format: String, message: String },

    #[error("failed to encode state ({format}): {message}")]
    StateEncodeError { format: String, message: String },

    #[error("failed to decode state ({format}): {message}")]
    StateDecodeError { format: String, message: String },

    #[error("failed to encode host payload ({format}): {message}")]
    HostEncodeError { format: String, message: String },

    #[error("failed to decode host payload ({format}): {message}")]
    HostDecodeError { format: String, message: String },

    #[error("unknown node id: {0}")]
    UnknownNode(String),

    #[error("unknown choice id: {0}")]
    UnknownChoice(String),

    #[error("unknown item ref: {0}")]
    UnknownItem(String),

    #[error("item '{item_ref}' is not in inventory")]
    ItemNotOwned { item_ref: String },

    #[error("unknown item action '{action_id}' on item '{item_ref}'")]
    UnknownItemAction { item_ref: String, action_id: String },

    #[error("item action '{action_id}' on '{item_ref}' is disabled: {reason}")]
    ItemActionDisabled {
        item_ref: String,
        action_id: String,
        reason: String,
    },

    #[error("item '{item_ref}' has multiple available actions; specify action_id")]
    AmbiguousItemAction { item_ref: String },

    #[error("choice '{choice_id}' is disabled: {reason}")]
    ChoiceDisabled { choice_id: String, reason: String },

    #[error("expression error: {0}")]
    ExpressionError(String),

    #[error("content validation failed: {0}")]
    ValidationError(String),

    #[error("save was created with revision '{save}' but current scenario revision is '{current}'")]
    RevisionMismatch { save: String, current: String },
}
