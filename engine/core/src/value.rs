use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DynamicValue {
    Bool(bool),
    Number(i32),
    String(String),
}

impl fmt::Display for DynamicValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bool(value) => write!(f, "{value}"),
            Self::Number(value) => write!(f, "{value}"),
            Self::String(value) => write!(f, "{value}"),
        }
    }
}
