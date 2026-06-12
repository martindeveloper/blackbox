use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum IssueSeverity {
    Info,
    Warning,
    Error,
}

impl fmt::Display for IssueSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IssueSeverity::Error => write!(f, "ERROR"),
            IssueSeverity::Warning => write!(f, "WARN"),
            IssueSeverity::Info => write!(f, "INFO"),
        }
    }
}

#[derive(Debug, Clone)]
pub enum IssueKind {
    /// Static: non-terminal node reachable from start with no path to any terminal.
    StaticDeadEnd {
        node_id: String,
    },
    /// Static: 2+ nodes forming a cycle from which no terminal is reachable.
    TrappingLoop {
        node_ids: Vec<String>,
    },
    DeadEnd {
        node_id: String,
    },
    UnreachableNode {
        node_id: String,
    },
    /// A game-over node that the death search could not trigger: no path drives
    /// the player's HP to 0 within a chapter that redirects deaths to it.
    UnreachableGameOver {
        node_id: String,
    },
    UnreachableChoice {
        node_id: String,
        choice_id: String,
        /// True when the choice is uncovered only because its owner node is
        /// itself never reached (so the choice can't be, regardless of gates).
        owner_unreachable: bool,
    },
    InfiniteLoop {
        node_id: String,
        depth: usize,
    },
    UnreachableGoal {
        node_id: String,
        closest_node: Option<String>,
        closest_milestone: Option<String>,
    },
    GoalBudgetExhausted {
        node_id: String,
        closest_milestone: Option<String>,
        missing_preconditions: Vec<String>,
    },
    GoalMissingPreconditions {
        node_id: String,
        at_milestone: Option<String>,
        missing: Vec<String>,
    },
    GoalStaticallyUnreachable {
        node_id: String,
    },
}

impl fmt::Display for IssueKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IssueKind::StaticDeadEnd { node_id } => {
                write!(
                    f,
                    "StaticDeadEnd: \"{node_id}\" is reachable but has no path to any ending"
                )
            }
            IssueKind::TrappingLoop { node_ids } => {
                let count = node_ids.len();
                let sample: Vec<&str> = node_ids.iter().take(3).map(|s| s.as_str()).collect();
                let ellipsis = if count > 3 { ", …" } else { "" };
                write!(
                    f,
                    "TrappingLoop: {count} nodes form an inescapable cycle ({}{})",
                    sample.join(", "),
                    ellipsis
                )
            }
            IssueKind::DeadEnd { node_id } => {
                write!(
                    f,
                    "DeadEnd: node \"{node_id}\" reached with no visible choices"
                )
            }
            IssueKind::UnreachableNode { node_id } => {
                write!(
                    f,
                    "UnreachableNode: \"{node_id}\" never reached in simulation"
                )
            }
            IssueKind::UnreachableGameOver { node_id } => {
                write!(
                    f,
                    "UnreachableGameOver: \"{node_id}\" never triggered — no path drives HP to 0 in a chapter that redirects deaths here (likely no damage source)"
                )
            }
            IssueKind::UnreachableChoice {
                node_id,
                choice_id,
                owner_unreachable,
            } => {
                if *owner_unreachable {
                    write!(
                        f,
                        "UnreachableChoice: choice \"{choice_id}\" at \"{node_id}\" unreachable because its node is never reached"
                    )
                } else {
                    write!(
                        f,
                        "UnreachableChoice: choice \"{choice_id}\" at \"{node_id}\" never taken (may be permanently gated)"
                    )
                }
            }
            IssueKind::InfiniteLoop { node_id, depth } => {
                write!(
                    f,
                    "InfiniteLoop: path exceeded {depth} steps at node \"{node_id}\""
                )
            }
            IssueKind::UnreachableGoal {
                node_id,
                closest_node,
                closest_milestone,
            } => {
                write!(
                    f,
                    "UnreachableGoal: \"{node_id}\" not reached in goal search"
                )?;
                if let Some(m) = closest_milestone {
                    write!(f, " (best milestone: {m})")?;
                } else if let Some(n) = closest_node {
                    write!(f, " (closest node: {n})")?;
                }
                Ok(())
            }
            IssueKind::GoalBudgetExhausted {
                node_id,
                closest_milestone,
                missing_preconditions,
            } => {
                write!(
                    f,
                    "GoalBudgetExhausted: \"{node_id}\" search budget exhausted"
                )?;
                if let Some(m) = closest_milestone {
                    write!(f, " (best milestone: {m})")?;
                }
                if !missing_preconditions.is_empty() {
                    write!(f, " missing: {}", missing_preconditions.join(", "))?;
                }
                Ok(())
            }
            IssueKind::GoalMissingPreconditions {
                node_id,
                at_milestone,
                missing,
            } => {
                write!(
                    f,
                    "GoalMissingPreconditions: \"{node_id}\" blocked by unsatisfied gates"
                )?;
                if let Some(m) = at_milestone {
                    write!(f, " at {m}")?;
                }
                if !missing.is_empty() {
                    write!(f, " missing: {}", missing.join(", "))?;
                }
                Ok(())
            }
            IssueKind::GoalStaticallyUnreachable { node_id } => {
                write!(
                    f,
                    "GoalStaticallyUnreachable: \"{node_id}\" not in static graph from start"
                )
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct SimIssue {
    pub severity: IssueSeverity,
    pub kind: IssueKind,
    pub path_hint: String,
}

impl SimIssue {
    pub fn error(kind: IssueKind, path_hint: impl Into<String>) -> Self {
        Self {
            severity: IssueSeverity::Error,
            kind,
            path_hint: path_hint.into(),
        }
    }

    pub fn warning(kind: IssueKind, path_hint: impl Into<String>) -> Self {
        Self {
            severity: IssueSeverity::Warning,
            kind,
            path_hint: path_hint.into(),
        }
    }

    pub fn info(kind: IssueKind, path_hint: impl Into<String>) -> Self {
        Self {
            severity: IssueSeverity::Info,
            kind,
            path_hint: path_hint.into(),
        }
    }
}
