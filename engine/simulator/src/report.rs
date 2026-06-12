use blackbox::GameContent;

use crate::issues::{IssueKind, IssueSeverity, SimIssue};
use crate::playtime::{PlayTimeStats, compute_stats};
use crate::sim::{CoverageTracker, SimAnalytics, SimMode, SimResult};

use std::fmt::Write as _;

/// Append a line to the human-output buffer (all output flows through `Output`
/// at the call site; these helpers never touch stdout directly).
macro_rules! wln {
    ($w:expr $(, $($arg:tt)*)?) => {{ let _ = writeln!($w $(, $($arg)*)?); }};
}
macro_rules! wr {
    ($w:expr, $($arg:tt)*) => {{ let _ = write!($w, $($arg)*); }};
}

pub fn print_header(
    w: &mut String,
    content: &GameContent,
    result_mode: SimMode,
    threads: usize,
    budget_label: &str,
) {
    let title = content.title.as_deref().unwrap_or("(untitled)");
    let version = content.revision.as_deref().unwrap_or("?");
    let node_count = content.nodes.len();
    let choice_count: usize = content.nodes.values().map(|n| n.choices.len()).sum();
    let chapter_count = content.chapters.len();

    wln!(w, "Blackbox Simulator — {title} v{version}");
    wln!(
        w,
        "Loaded: {node_count} nodes, {choice_count} choices, {chapter_count} chapters",
    );

    let mode_label = match result_mode {
        SimMode::Explore => "explore",
        SimMode::Goals => "goals",
    };
    wln!(
        w,
        "\n=== Simulation [{mode_label}] ({threads} thread{}, {budget_label}) ===",
        if threads == 1 { "" } else { "s" },
    );
}

pub fn print_sim_results(w: &mut String, result: &SimResult, verbose: bool) {
    if result.mode == SimMode::Goals {
        print_goal_results(w, result);
        if !result.issues.is_empty() {
            print_issues(w, &result.issues);
        }
        return;
    }

    let paths = result.completed_paths.len();
    wln!(
        w,
        "  Explored: {} unique states  |  {} complete path{}",
        fmt_count(result.states_explored),
        fmt_count(paths),
        if paths == 1 { "" } else { "s" },
    );
    if result.budget_exhausted {
        wln!(
            w,
            "  NOTE: State budget exhausted — increase --max-states for deeper coverage."
        );
    }
    wln!(w);
    print_coverage(w, &result.coverage, verbose);
    print_issues(w, &result.issues);
}

fn print_goal_results(w: &mut String, result: &SimResult) {
    let total = result.goal_results.len();
    let reached = result.goal_results.iter().filter(|g| g.reached).count();
    wln!(
        w,
        "  Goals: {reached}/{total} reached  |  {} states explored total",
        fmt_count(result.states_explored),
    );
    if result.budget_exhausted {
        wln!(
            w,
            "  NOTE: One or more goals exhausted their per-goal budget."
        );
    }
    wln!(w);
    for goal in &result.goal_results {
        if goal.reached {
            let choices = goal
                .choice_count
                .map(|c| c.to_string())
                .unwrap_or_else(|| "?".to_string());
            wln!(
                w,
                "  ✓ {}  ({} states, {} choices)",
                goal.goal_id,
                fmt_count(goal.states_explored),
                choices,
            );
            if let Some(witness) = &goal.witness {
                print_witness_path(w, witness);
            }
        } else if !goal.statically_reachable {
            wln!(w, "  ✗ {}  STATICALLY UNREACHABLE", goal.goal_id);
        } else {
            let hint = goal
                .closest_milestone
                .as_deref()
                .or(goal.closest_node.as_deref())
                .unwrap_or("unknown");
            let budget = if goal.budget_exhausted {
                ", budget exhausted"
            } else {
                ""
            };
            wln!(
                w,
                "  ✗ {}  NOT REACHED{budget}  (best: {hint}, {} states)",
                goal.goal_id,
                fmt_count(goal.states_explored),
            );
            if !goal.required_preconditions.is_empty() {
                wln!(
                    w,
                    "      requires: {}",
                    goal.required_preconditions.join(", ")
                );
            }
            if !goal.missing_preconditions.is_empty() {
                wln!(
                    w,
                    "      missing at best state: {}",
                    goal.missing_preconditions.join(", ")
                );
            }
        }
    }
}

fn print_witness_path(w: &mut String, witness: &crate::playtime::GoalWitness) {
    if witness.steps.is_empty() {
        return;
    }
    let path = format_witness_steps(&witness.steps);
    wln!(w, "      path: {path}");
    if !witness.gateway_snapshot.is_empty() {
        let gates: Vec<String> = witness
            .gateway_snapshot
            .iter()
            .map(|(label, status)| format!("{label} {status}"))
            .collect();
        wln!(w, "      gates: {}", gates.join(", "));
    }
}

fn format_witness_steps(steps: &[(String, String)]) -> String {
    if steps.len() <= 6 {
        return steps
            .iter()
            .map(|(node, choice)| format!("{node}:{choice}"))
            .collect::<Vec<_>>()
            .join(" → ");
    }
    let head: Vec<String> = steps
        .iter()
        .take(3)
        .map(|(node, choice)| format!("{node}:{choice}"))
        .collect();
    let tail = format!("{}:{}", steps.last().unwrap().0, steps.last().unwrap().1);
    format!("{} → ... → {tail}", head.join(" → "))
}

fn print_coverage(w: &mut String, coverage: &CoverageTracker, verbose: bool) {
    let total_nodes = coverage.all_nodes.len();
    let visited_nodes = coverage.visited_nodes.len();
    let total_choices = coverage.all_choices.len();
    let visited_choices = coverage.visited_choices.len();

    let node_pct = pct(visited_nodes, total_nodes);
    let choice_pct = pct(visited_choices, total_choices);

    wln!(w, "  Coverage:");
    wln!(
        w,
        "    Nodes:   {visited_nodes}/{total_nodes} ({node_pct:.1}%)",
    );
    wln!(
        w,
        "    Choices: {visited_choices}/{total_choices} ({choice_pct:.1}%)",
    );

    if verbose {
        let unvisited_nodes = coverage.unvisited_nodes();
        if !unvisited_nodes.is_empty() {
            wln!(w, "\n  Unvisited nodes:");
            for node in &unvisited_nodes {
                wln!(w, "    - {node}");
            }
        }
        let unvisited_choices = coverage.unvisited_choices();
        if !unvisited_choices.is_empty() {
            wln!(w, "\n  Unvisited choices:");
            for (node, choice) in &unvisited_choices {
                wln!(w, "    - {node} / {choice}");
            }
        }
    }
}

pub fn print_issues(w: &mut String, issues: &[SimIssue]) {
    let errors = issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Error)
        .count();
    let warnings = issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Warning)
        .count();
    let infos = issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Info)
        .count();

    if issues.is_empty() {
        return;
    }

    wln!(
        w,
        "\nIssues ({errors} error{}, {warnings} warning{}, {infos} info):",
        if errors == 1 { "" } else { "s" },
        if warnings == 1 { "" } else { "s" },
    );
    for issue in issues {
        if issue.path_hint.is_empty() {
            wln!(w, "  [{}] {}", issue.severity, issue.kind);
        } else {
            wln!(
                w,
                "  [{}] {}\n        path: {}",
                issue.severity,
                issue.kind,
                issue.path_hint
            );
        }
    }
}

pub fn print_playtime(w: &mut String, result: &SimResult) {
    if result.mode == SimMode::Goals {
        if result.completed_paths.is_empty() {
            wln!(w, "\n=== Play-Time Estimates ===");
            wln!(w, "  No goal paths completed.");
        } else {
            print_playtime_paths(w, &result.completed_paths);
        }
        return;
    }
    print_playtime_paths(w, &result.completed_paths);
}

fn print_playtime_paths(w: &mut String, completed_paths: &[crate::playtime::CompletedPath]) {
    match compute_stats(completed_paths.to_vec()) {
        None => {
            wln!(w, "\n=== Play-Time Estimates ===");
            wln!(
                w,
                "  No complete paths found (no game_over or ending nodes reached)."
            );
        }
        Some(PlayTimeStats {
            shortest,
            median,
            longest,
        }) => {
            wln!(w, "\n=== Play-Time Estimates ===");
            wln!(
                w,
                "  Shortest: ~{:.0} min   ({} words, {} choices)",
                shortest.total_minutes(),
                fmt_count(shortest.word_count as usize),
                shortest.choice_count,
            );
            wln!(
                w,
                "  Median:   ~{:.0} min   ({} words, {} choices)",
                median.total_minutes(),
                fmt_count(median.word_count as usize),
                median.choice_count,
            );
            wln!(
                w,
                "  Longest:  ~{:.0} min   ({} words, {} choices)",
                longest.total_minutes(),
                fmt_count(longest.word_count as usize),
                longest.choice_count,
            );
        }
    }
}

pub fn print_summary(w: &mut String, result: &SimResult) {
    let issues = &result.issues;
    let errors = issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Error)
        .count();
    let warnings = issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Warning)
        .count();
    let infos = issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Info)
        .count();

    wln!(w, "\n=== Summary ===");
    if result.mode == SimMode::Goals {
        let reached = result.goal_results.iter().filter(|g| g.reached).count();
        let total = result.goal_results.len();
        wln!(w, "  Goals: {reached}/{total} reached");
    }
    if errors == 0 && warnings == 0 && infos == 0 {
        wln!(w, "  No issues found.");
    } else {
        wln!(
            w,
            "  Issues: {errors} error{}, {warnings} warning{}, {infos} info",
            if errors == 1 { "" } else { "s" },
            if warnings == 1 { "" } else { "s" },
        );
    }
}

pub fn print_analytics(w: &mut String, result: &SimResult) {
    let Some(a) = &result.analytics else { return };

    wln!(w, "\n=== Narrative Analytics ===");

    let total_endings = a
        .node_importance
        .iter()
        .map(|n| n.total_endings)
        .max()
        .unwrap_or(0);
    if total_endings > 0 {
        let mandatory: Vec<&str> = a
            .node_importance
            .iter()
            .filter(|n| n.ending_count == total_endings && n.ending_count > 0)
            .map(|n| n.node_id.as_str())
            .collect();
        if !mandatory.is_empty() {
            wr!(w, "  Mandatory nodes (all {} endings):", total_endings);
            let list = mandatory.join(", ");
            if list.len() <= 60 {
                wln!(w, " {list}");
            } else {
                wln!(w);
                for id in &mandatory {
                    wln!(w, "    {id}");
                }
            }
        }

        let mut by_importance: Vec<_> = a
            .node_importance
            .iter()
            .filter(|n| n.ending_count > 0 && n.ending_count < total_endings)
            .collect();
        by_importance.sort_by_key(|n| std::cmp::Reverse(n.ending_count));

        if !by_importance.is_empty() {
            wln!(w, "\n  Importance:");
            for ni in by_importance.iter().take(20) {
                wln!(
                    w,
                    "    {:<40} {}/{}\t{:.0}%",
                    ni.node_id,
                    ni.ending_count,
                    total_endings,
                    ni.pct(),
                );
            }
        }
    }

    let total_paths = a.path_counts.total;
    if total_paths > 0 {
        let mut endings: Vec<(&String, usize)> = a
            .path_counts
            .ending_counts
            .iter()
            .map(|(k, &v)| (k, v))
            .collect();
        endings.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));
        wln!(w, "\n  Accessibility ({} paths):", total_paths);
        for (id, count) in &endings {
            wln!(
                w,
                "    {:<40} {}/{}\t{:.0}%",
                id,
                count,
                total_paths,
                *count as f64 / total_paths as f64 * 100.0,
            );
        }

        // Sort by total visits ("how frequently hit"); show reach % (fraction of
        // playthroughs that pass through, ≤100%) and branching factor alongside.
        let mut nodes: Vec<(&String, usize)> = a
            .path_counts
            .node_counts
            .iter()
            .map(|(k, &v)| (k, v))
            .collect();
        nodes.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));
        wln!(
            w,
            "\n  Hot nodes — by visit frequency ({} paths):",
            total_paths
        );
        wln!(
            w,
            "    {:<40} {:>8}  {:>6}  {}",
            "node",
            "visits",
            "reach",
            "choices"
        );
        for (id, visits) in nodes.iter().take(20) {
            let reach = a
                .path_counts
                .node_path_counts
                .get(*id)
                .copied()
                .unwrap_or(0);
            let degree = a.node_out_degree.get(*id).copied().unwrap_or(0);
            wln!(
                w,
                "    {:<40} {:>8}  {:>5.0}%  [{}]",
                id,
                visits,
                reach as f64 / total_paths as f64 * 100.0,
                degree,
            );
        }

        let mut candidates: Vec<(&String, usize)> = nodes
            .iter()
            .filter(|(id, _)| a.node_out_degree.get(*id).copied().unwrap_or(0) == 1)
            .copied()
            .collect();
        candidates.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));
        if !candidates.is_empty() {
            wln!(
                w,
                "\n  Split candidates — high traffic, single choice (consider adding branches):"
            );
            for (id, visits) in candidates.iter().take(15) {
                let reach = a
                    .path_counts
                    .node_path_counts
                    .get(*id)
                    .copied()
                    .unwrap_or(0);
                wln!(
                    w,
                    "    {:<40} {:>8} visits  {:>5.0}% reach",
                    id,
                    visits,
                    reach as f64 / total_paths as f64 * 100.0,
                );
            }
        }

        print_per_ending_hot_nodes(w, a, &endings);
    }
}

/// Per-ending node frequency: for each terminal, the nodes most characteristic
/// of the paths that reach it. Nodes shared by *every* ending (the mandatory
/// spine) are dropped so what remains is each ending's distinctive route.
fn print_per_ending_hot_nodes(w: &mut String, a: &SimAnalytics, endings: &[(&String, usize)]) {
    let per = &a.path_counts.per_ending_path_counts;
    if per.len() < 2 {
        return;
    }

    // Nodes present on the way to *every* ending — the common spine.
    let shared: std::collections::HashSet<&String> = {
        let mut iter = per.values();
        let Some(first) = iter.next() else { return };
        let mut acc: std::collections::HashSet<&String> = first.keys().collect();
        for counts in iter {
            acc.retain(|n| counts.contains_key(*n));
        }
        acc
    };

    wln!(w, "\n  Per-ending hot nodes (distinctive to each route):");
    for (ending, path_count) in endings {
        let Some(counts) = per.get(*ending) else {
            continue;
        };
        let mut distinctive: Vec<(&String, usize)> = counts
            .iter()
            .filter(|(node, _)| !shared.contains(*node))
            .map(|(k, &v)| (k, v))
            .collect();
        distinctive.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));

        wln!(
            w,
            "    → {} ({} path{}):",
            ending,
            path_count,
            if *path_count == 1 { "" } else { "s" }
        );
        if distinctive.is_empty() {
            wln!(w, "        (no nodes unique to this ending)");
            continue;
        }
        for (id, reach) in distinctive.iter().take(8) {
            wln!(
                w,
                "        {:<36} {:>5.0}% of its paths",
                id,
                *reach as f64 / *path_count as f64 * 100.0,
            );
        }
    }
}

/// JSON form of the per-ending distinctive-node breakdown (same logic as
/// [`print_per_ending_hot_nodes`]): drop the spine shared by every ending, keep
/// each route's distinctive nodes ranked by reach.
fn build_per_ending_json(a: &SimAnalytics) -> Vec<PerEndingJson> {
    let per = &a.path_counts.per_ending_path_counts;
    if per.len() < 2 {
        return Vec::new();
    }
    let shared: std::collections::HashSet<&String> = {
        let mut iter = per.values();
        let Some(first) = iter.next() else {
            return Vec::new();
        };
        let mut acc: std::collections::HashSet<&String> = first.keys().collect();
        for counts in iter {
            acc.retain(|n| counts.contains_key(*n));
        }
        acc
    };

    let mut endings: Vec<(&String, usize)> = a
        .path_counts
        .ending_counts
        .iter()
        .map(|(k, &v)| (k, v))
        .collect();
    endings.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));

    endings
        .iter()
        .filter_map(|(ending, path_count)| {
            let counts = per.get(*ending)?;
            let mut distinctive: Vec<(&String, usize)> = counts
                .iter()
                .filter(|(node, _)| !shared.contains(*node))
                .map(|(k, &v)| (k, v))
                .collect();
            distinctive.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));
            Some(PerEndingJson {
                ending: (*ending).clone(),
                path_count: *path_count,
                nodes: distinctive
                    .iter()
                    .map(|(id, reach)| PerEndingNodeJson {
                        id: (*id).clone(),
                        reach: *reach,
                        reach_pct: *reach as f64 / (*path_count).max(1) as f64 * 100.0,
                    })
                    .collect(),
            })
        })
        .collect()
}

fn pct(part: usize, total: usize) -> f64 {
    if total == 0 {
        100.0
    } else {
        part as f64 / total as f64 * 100.0
    }
}

fn fmt_count(n: usize) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimJson {
    pub kind: &'static str,
    pub title: String,
    pub revision: String,
    pub mode: &'static str,
    pub loaded: SimLoadedJson,
    pub goals_reached: Option<usize>,
    pub goals_total: Option<usize>,
    pub states_explored: Option<String>,
    pub goals: Vec<SimGoalJson>,
    pub coverage: Option<SimCoverageJson>,
    pub issues: Vec<SimIssueJson>,
    pub issue_summary: SimSummaryJson,
    pub result: &'static str,
    pub analytics: Option<SimAnalyticsJson>,
}

#[derive(serde::Serialize)]
pub struct SimLoadedJson {
    pub nodes: usize,
    pub choices: usize,
    pub chapters: usize,
}

#[derive(serde::Serialize)]
pub struct SimGoalJson {
    pub id: String,
    pub reached: bool,
    #[serde(rename = "static", skip_serializing_if = "Option::is_none")]
    pub is_static: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub states: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub choices: Option<String>,
    pub hint: Option<String>,
}

#[derive(serde::Serialize)]
pub struct SimCoverageSliceJson {
    pub visited: usize,
    pub total: usize,
    pub pct: f64,
}

#[derive(serde::Serialize)]
pub struct SimCoverageJson {
    pub nodes: Option<SimCoverageSliceJson>,
    pub choices: Option<SimCoverageSliceJson>,
}

#[derive(serde::Serialize)]
pub struct SimIssueJson {
    pub severity: &'static str,
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(serde::Serialize)]
pub struct SimSummaryJson {
    pub errors: usize,
    pub warnings: usize,
    pub info: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimAnalyticsJson {
    pub mandatory_nodes: Vec<String>,
    pub total_endings: usize,
    /// Complete static ending-reachability table for editor visualizations.
    pub node_importance: Vec<SimAnalyticsRowJson>,
    pub importance: Vec<SimAnalyticsRowJson>,
    pub total_paths: usize,
    pub accessibility: Vec<SimAnalyticsRowJson>,
    /// Complete per-node traffic table used by editor visualizations.
    pub node_traffic: Vec<HotNodeJson>,
    /// Nodes ranked by visit frequency, with reach % and branching factor.
    pub hot_nodes: Vec<HotNodeJson>,
    /// High-traffic nodes with a single authored choice — candidates to split
    /// into more options.
    pub split_candidates: Vec<HotNodeJson>,
    /// Per-ending hot nodes distinctive to each route.
    pub per_ending: Vec<PerEndingJson>,
}

#[derive(serde::Serialize)]
pub struct SimAnalyticsRowJson {
    pub id: String,
    pub count: usize,
    pub total: usize,
    pub pct: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotNodeJson {
    pub id: String,
    /// Total entries across all paths (counts revisits).
    pub visits: usize,
    /// Distinct paths through the node.
    pub reach: usize,
    /// `reach` as a percentage of all paths (0–100).
    pub reach_pct: f64,
    /// Authored choice count (branching factor).
    pub out_degree: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerEndingJson {
    pub ending: String,
    pub path_count: usize,
    pub nodes: Vec<PerEndingNodeJson>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerEndingNodeJson {
    pub id: String,
    pub reach: usize,
    pub reach_pct: f64,
}

fn issue_code(kind: &IssueKind) -> &'static str {
    match kind {
        IssueKind::StaticDeadEnd { .. } => "StaticDeadEnd",
        IssueKind::TrappingLoop { .. } => "TrappingLoop",
        IssueKind::DeadEnd { .. } => "DeadEnd",
        IssueKind::UnreachableNode { .. } => "UnreachableNode",
        IssueKind::UnreachableGameOver { .. } => "UnreachableGameOver",
        IssueKind::UnreachableChoice { .. } => "UnreachableChoice",
        IssueKind::InfiniteLoop { .. } => "InfiniteLoop",
        IssueKind::UnreachableGoal { .. } => "UnreachableGoal",
        IssueKind::GoalBudgetExhausted { .. } => "GoalBudgetExhausted",
        IssueKind::GoalMissingPreconditions { .. } => "GoalMissingPreconditions",
        IssueKind::GoalStaticallyUnreachable { .. } => "GoalStaticallyUnreachable",
    }
}

fn issue_message(kind: &IssueKind) -> String {
    let display = kind.to_string();
    if let Some(idx) = display.find(": ") {
        display[idx + 2..].to_string()
    } else {
        display
    }
}

fn severity_str(s: IssueSeverity) -> &'static str {
    match s {
        IssueSeverity::Error => "error",
        IssueSeverity::Warning => "warn",
        IssueSeverity::Info => "info",
    }
}

pub fn build_json(content: &GameContent, result: &SimResult) -> SimJson {
    let title = content.title.as_deref().unwrap_or("(untitled)").to_string();
    let revision = content.revision.as_deref().unwrap_or("?").to_string();
    let node_count = content.nodes.len();
    let choice_count: usize = content.nodes.values().map(|n| n.choices.len()).sum();
    let chapter_count = content.chapters.len();

    let mode_str = match result.mode {
        SimMode::Explore => "explore",
        SimMode::Goals => "goals",
    };

    let (goals_reached, goals_total) = if result.mode == SimMode::Goals {
        let reached = result.goal_results.iter().filter(|g| g.reached).count();
        let total = result.goal_results.len();
        (Some(reached), Some(total))
    } else {
        (None, None)
    };

    let states_explored = if result.mode == SimMode::Explore {
        Some(fmt_count(result.states_explored))
    } else {
        None
    };

    let goals: Vec<SimGoalJson> = result
        .goal_results
        .iter()
        .map(|g| SimGoalJson {
            id: g.goal_id.clone(),
            reached: g.reached,
            is_static: if !g.statically_reachable {
                Some(true)
            } else {
                None
            },
            states: Some(fmt_count(g.states_explored)),
            choices: g.choice_count.map(|c| c.to_string()),
            hint: g
                .closest_milestone
                .as_deref()
                .or(g.closest_node.as_deref())
                .map(str::to_string),
        })
        .collect();

    let coverage = if result.mode == SimMode::Explore {
        let cov = &result.coverage;
        let vn = cov.visited_nodes.len();
        let tn = cov.all_nodes.len();
        let vc = cov.visited_choices.len();
        let tc = cov.all_choices.len();
        Some(SimCoverageJson {
            nodes: Some(SimCoverageSliceJson {
                visited: vn,
                total: tn,
                pct: pct(vn, tn),
            }),
            choices: Some(SimCoverageSliceJson {
                visited: vc,
                total: tc,
                pct: pct(vc, tc),
            }),
        })
    } else {
        None
    };

    let issues: Vec<SimIssueJson> = result
        .issues
        .iter()
        .map(|i| SimIssueJson {
            severity: severity_str(i.severity),
            code: issue_code(&i.kind),
            message: issue_message(&i.kind),
            path: if i.path_hint.is_empty() {
                None
            } else {
                Some(i.path_hint.clone())
            },
        })
        .collect();

    let errors = result
        .issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Error)
        .count();
    let warnings = result
        .issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Warning)
        .count();
    let infos = result
        .issues
        .iter()
        .filter(|i| i.severity == IssueSeverity::Info)
        .count();

    let goals_failed =
        result.mode == SimMode::Goals && result.goal_results.iter().any(|g| !g.reached);
    let result_str = if errors > 0 || goals_failed {
        "failed"
    } else if warnings > 0 {
        "passed with warnings"
    } else {
        "passed"
    };

    let analytics = result.analytics.as_ref().map(|a| {
        let total_endings = a
            .node_importance
            .iter()
            .map(|n| n.total_endings)
            .max()
            .unwrap_or(0);
        let mandatory_nodes: Vec<String> = a
            .node_importance
            .iter()
            .filter(|n| n.ending_count == total_endings && n.ending_count > 0)
            .map(|n| n.node_id.clone())
            .collect();

        let mut by_importance: Vec<_> = a
            .node_importance
            .iter()
            .filter(|n| n.ending_count > 0 && n.ending_count < total_endings)
            .collect();
        by_importance.sort_by_key(|n| std::cmp::Reverse(n.ending_count));
        let importance: Vec<SimAnalyticsRowJson> = by_importance
            .iter()
            .take(20)
            .map(|n| SimAnalyticsRowJson {
                id: n.node_id.clone(),
                count: n.ending_count,
                total: total_endings,
                pct: n.pct(),
            })
            .collect();
        let node_importance: Vec<SimAnalyticsRowJson> = a
            .node_importance
            .iter()
            .map(|node| SimAnalyticsRowJson {
                id: node.node_id.clone(),
                count: node.ending_count,
                total: total_endings,
                pct: node.pct(),
            })
            .collect();

        let total_paths = a.path_counts.total;
        let mut endings: Vec<(&String, usize)> = a
            .path_counts
            .ending_counts
            .iter()
            .map(|(k, &v)| (k, v))
            .collect();
        endings.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));
        let accessibility: Vec<SimAnalyticsRowJson> = endings
            .iter()
            .map(|(id, count)| SimAnalyticsRowJson {
                id: (*id).clone(),
                count: *count,
                total: total_paths,
                pct: *count as f64 / total_paths.max(1) as f64 * 100.0,
            })
            .collect();

        let hot_row = |id: &String, visits: usize| {
            let reach = a.path_counts.node_path_counts.get(id).copied().unwrap_or(0);
            HotNodeJson {
                id: id.clone(),
                visits,
                reach,
                reach_pct: reach as f64 / total_paths.max(1) as f64 * 100.0,
                out_degree: a.node_out_degree.get(id).copied().unwrap_or(0),
            }
        };

        let mut nodes: Vec<(&String, usize)> = a
            .path_counts
            .node_counts
            .iter()
            .map(|(k, &v)| (k, v))
            .collect();
        nodes.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(y.0)));
        let node_traffic: Vec<HotNodeJson> = nodes
            .iter()
            .map(|(id, visits)| hot_row(id, *visits))
            .collect();
        let hot_nodes: Vec<HotNodeJson> = nodes
            .iter()
            .take(30)
            .map(|(id, v)| hot_row(id, *v))
            .collect();
        let split_candidates: Vec<HotNodeJson> = nodes
            .iter()
            .filter(|(id, _)| a.node_out_degree.get(*id).copied().unwrap_or(0) == 1)
            .map(|(id, v)| hot_row(id, *v))
            .collect();

        let per_ending = build_per_ending_json(a);

        SimAnalyticsJson {
            mandatory_nodes,
            total_endings,
            node_importance,
            importance,
            total_paths,
            accessibility,
            node_traffic,
            hot_nodes,
            split_candidates,
            per_ending,
        }
    });

    SimJson {
        kind: "simulator",
        title,
        revision,
        mode: mode_str,
        loaded: SimLoadedJson {
            nodes: node_count,
            choices: choice_count,
            chapters: chapter_count,
        },
        goals_reached,
        goals_total,
        states_explored,
        goals,
        coverage,
        issues,
        issue_summary: SimSummaryJson {
            errors,
            warnings,
            info: infos,
        },
        result: result_str,
        analytics,
    }
}
