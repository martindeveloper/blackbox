use crate::error::EngineError;

use super::parse::parse_expr;

#[derive(Debug, Clone, PartialEq)]
pub enum ExprValue {
    Number(i32),
    Bool(bool),
    String(String),
}

/// Read-only condition variables compiled from [`crate::condition::Condition`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BuiltinVar {
    Visited(String),
    AtNode(String),
    HasFlag(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Lit(ExprValue),
    Builtin(BuiltinVar),
    Var {
        var: String,
    },
    Call {
        call: String,
        args: Vec<Expr>,
    },
    Op {
        op: String,
        left: Box<Expr>,
        right: Option<Box<Expr>>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum ExprInput {
    String(String),
    Expr(Expr),
}

impl ExprInput {
    pub fn into_expr(self) -> Result<Expr, EngineError> {
        match self {
            ExprInput::String(text) => parse_expr(&text),
            ExprInput::Expr(expr) => Ok(expr),
        }
    }
}

impl Expr {
    /// Returns true when evaluation only reads state (no RNG calls).
    pub fn is_pure(&self) -> bool {
        match self {
            Expr::Lit(_) => true,
            Expr::Builtin(_) => true,
            Expr::Var { .. } => true,
            Expr::Call { call, args } => {
                !matches!(call.as_str(), "random" | "dice") && args.iter().all(Expr::is_pure)
            }
            Expr::Op { left, right, .. } => {
                left.is_pure() && right.as_ref().is_none_or(|expr| expr.is_pure())
            }
        }
    }
}
