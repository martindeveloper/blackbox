mod abstraction;
mod analytics;
mod coverage;
mod death_search;
mod goal_search;
mod goals;
mod graph;
mod preconditions;
mod work;
mod worker;

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use rustc_hash::FxHashSet;

use anyhow::{Context, Result};
use blackbox::content::NodeMode;
use blackbox::{Engine, GameContent};

pub use analytics::SimAnalytics;
pub use coverage::CoverageTracker;
pub use goals::{GoalFilter, discover_goals};
pub use graph::GraphIndex;
pub use work::{StateKey, WorkItem};

use crate::issues::{IssueKind, SimIssue};
use crate::playtime::{CompletedPath, GoalWitness, count_words_in_view};
use abstraction::ValueAbstraction;
use goal_search::{GoalSearchConfig, GoalSearchResult, run_goal_search};
use goals::{GoalPlan, Milestones};
use worker::worker_loop;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimMode {
    Explore,
    Goals,
}

#[derive(Debug, Clone)]
pub enum GoalTarget {
    Filter(GoalFilter),
    Node(String),
}

pub struct SimConfig {
    pub content: GameContent,
    pub mode: SimMode,
    pub threads: usize,
    /// State budget for explore mode.
    pub max_states: usize,
    /// Per-goal state budget for goals mode.
    pub goal_budget: usize,
    pub goal_target: GoalTarget,
    pub use_heuristic: bool,
    /// Collect narrative analytics (node importance + path counts).
    pub analytics: bool,
}

#[derive(Debug, Clone)]
pub struct GoalResult {
    pub goal_id: String,
    pub reached: bool,
    pub statically_reachable: bool,
    pub states_explored: usize,
    pub choice_count: Option<usize>,
    pub closest_node: Option<String>,
    pub closest_milestone: Option<String>,
    pub budget_exhausted: bool,
    pub missing_preconditions: Vec<String>,
    pub required_preconditions: Vec<String>,
    pub witness: Option<GoalWitness>,
}

pub struct SimResult {
    pub mode: SimMode,
    pub issues: Vec<SimIssue>,
    pub coverage: CoverageTracker,
    pub completed_paths: Vec<CompletedPath>,
    pub states_explored: usize,
    pub budget_exhausted: bool,
    pub goal_results: Vec<GoalResult>,
    pub analytics: Option<SimAnalytics>,
}

/// Shared mutable accumulator across all worker threads. Only rare events
/// take this lock (terminal paths, dead ends, issues, final coverage merges);
/// the per-transition hot path goes through [`SeenSet`] instead.
pub struct SimShared {
    pub issues: Vec<SimIssue>,
    pub coverage: CoverageTracker,
    pub completed_paths: Vec<CompletedPath>,
    pub reported_dead_ends: FxHashSet<String>,
    /// Present when analytics mode is enabled; workers append to this.
    pub path_counts: Option<analytics::PathCounts>,
}

/// Lock-striped dedup set with a strict atomic state budget.
///
/// Every attempted transition in the breadth pass hits this once — it was the
/// single hottest lock in the simulator — so the seen-set is sharded by key
/// hash and the budget is a CAS loop. The count never exceeds `max_states`
/// (matching the old single-mutex semantics); a key can be left inserted when
/// the budget fills mid-admission, which is harmless because the budget never
/// reopens.
pub struct SeenSet {
    shards: Vec<Mutex<FxHashSet<StateKey>>>,
    explored: AtomicUsize,
    max_states: usize,
}

impl SeenSet {
    const SHARDS: usize = 64;

    fn new(max_states: usize) -> Self {
        Self {
            shards: (0..Self::SHARDS)
                .map(|_| Mutex::new(FxHashSet::default()))
                .collect(),
            explored: AtomicUsize::new(0),
            max_states,
        }
    }

    /// Admit a newly reached state: true iff the key was unseen and the budget
    /// had room. On success the explored count is incremented.
    pub fn try_admit(&self, key: StateKey) -> bool {
        if self.explored.load(Ordering::Relaxed) >= self.max_states {
            return false;
        }
        if !self.shards[key.shard(Self::SHARDS)]
            .lock()
            .expect("seen shard lock")
            .insert(key)
        {
            return false;
        }
        self.explored
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                (n < self.max_states).then_some(n + 1)
            })
            .is_ok()
    }

    pub fn explored(&self) -> usize {
        self.explored.load(Ordering::Relaxed)
    }
}

/// Thread-safe work queue with drain detection via Condvar.
pub struct WorkQueue {
    inner: Mutex<WorkQueueInner>,
    condvar: Condvar,
}

struct WorkQueueInner {
    pending: VecDeque<WorkItem>,
    active: usize,
}

impl WorkQueue {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(WorkQueueInner {
                pending: VecDeque::new(),
                active: 0,
            }),
            condvar: Condvar::new(),
        })
    }

    pub fn push(&self, item: WorkItem) {
        self.inner
            .lock()
            .expect("work queue lock")
            .pending
            .push_back(item);
        self.condvar.notify_one();
    }

    pub fn take(&self) -> Option<WorkItem> {
        let mut guard = self.inner.lock().expect("work queue lock");
        loop {
            if let Some(item) = guard.pending.pop_front() {
                guard.active += 1;
                return Some(item);
            }
            if guard.active == 0 {
                self.condvar.notify_all();
                return None;
            }
            guard = self.condvar.wait(guard).expect("work queue condvar");
        }
    }

    pub fn complete_item(&self) {
        let mut guard = self.inner.lock().expect("work queue lock");
        guard.active -= 1;
        if guard.active == 0 && guard.pending.is_empty() {
            self.condvar.notify_all();
        }
    }
}

pub fn run_simulation(config: SimConfig) -> Result<SimResult> {
    match config.mode {
        SimMode::Explore => run_explore_simulation(config),
        SimMode::Goals => run_goals_simulation(config),
    }
}

fn run_explore_simulation(config: SimConfig) -> Result<SimResult> {
    let content = config.content;
    let graph = GraphIndex::build(&content);
    let static_issues = graph.static_analysis(&content, &content.start_node_id);
    let coverage = CoverageTracker::from_content(&content);
    let abstraction = Arc::new(ValueAbstraction::build(&content));
    let do_analytics = config.analytics;

    let (initial_state, initial_words) = {
        let mut eng = Engine::new_game(content.clone()).context("initial engine")?;
        let view = eng.get_current_view().context("initial view")?;
        let words = count_words_in_view(&view);
        let state = eng.get_state().clone();
        (state, words)
    };

    let initial_key = StateKey::from_state(&initial_state, None, &abstraction);
    let seen = Arc::new(SeenSet::new(config.max_states));
    seen.try_admit(initial_key);
    let shared = Arc::new(Mutex::new(SimShared {
        issues: Vec::new(),
        coverage,
        completed_paths: Vec::new(),
        reported_dead_ends: FxHashSet::default(),
        path_counts: if do_analytics {
            Some(analytics::PathCounts::default())
        } else {
            None
        },
    }));

    let queue = WorkQueue::new();
    queue.push(WorkItem {
        state: initial_state,
        path_tail: None,
        depth: 0,
        word_count: initial_words,
    });

    let handles: Vec<_> = (0..config.threads)
        .map(|_| {
            let engine = Engine::new_game(content.clone()).expect("worker engine init");
            let queue = Arc::clone(&queue);
            let shared = Arc::clone(&shared);
            let seen = Arc::clone(&seen);
            let abstraction = Arc::clone(&abstraction);
            std::thread::spawn(move || {
                worker_loop(engine, queue, shared, seen, abstraction, do_analytics);
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("worker thread panicked");
    }

    let states_explored = seen.explored();
    let mut acc = Arc::try_unwrap(shared)
        .unwrap_or_else(|_| panic!("shared Arc not uniquely owned after join"))
        .into_inner()
        .unwrap_or_else(|e| panic!("shared mutex poisoned: {e}"));

    complete_coverage(
        &content,
        &graph,
        &abstraction,
        config.goal_budget,
        config.threads,
        &mut acc.coverage,
    );

    for node_id in static_issues.dead_end_nodes {
        acc.issues
            .push(SimIssue::error(IssueKind::StaticDeadEnd { node_id }, ""));
    }
    for node_ids in static_issues.trapping_loops {
        acc.issues
            .push(SimIssue::error(IssueKind::TrappingLoop { node_ids }, ""));
    }

    for node_id in acc.coverage.unvisited_nodes() {
        // Game-over nodes are entered only via the HP→0 vitals redirect; if the
        // death search left one uncovered, report *why* rather than the generic
        // "never reached".
        let is_game_over = content
            .nodes
            .get(node_id)
            .is_some_and(|n| n.mode == NodeMode::GameOver);
        let kind = if is_game_over {
            IssueKind::UnreachableGameOver {
                node_id: node_id.to_string(),
            }
        } else {
            IssueKind::UnreachableNode {
                node_id: node_id.to_string(),
            }
        };
        acc.issues.push(SimIssue::warning(kind, ""));
    }

    for (node_id, choice_id) in acc.coverage.unvisited_choices() {
        let owner_unreachable = !acc.coverage.visited_nodes.contains(node_id);
        acc.issues.push(SimIssue::info(
            IssueKind::UnreachableChoice {
                node_id: node_id.to_string(),
                choice_id: choice_id.to_string(),
                owner_unreachable,
            },
            "",
        ));
    }

    acc.issues.sort_by_key(|i| std::cmp::Reverse(i.severity));

    let budget_exhausted = states_explored >= config.max_states;

    let sim_analytics = if do_analytics {
        let (total_endings, counts) = graph.node_ending_coverage(&content);
        let node_importance = counts
            .into_iter()
            .enumerate()
            .map(|(i, ending_count)| analytics::NodeImportance {
                node_id: graph.id_of(i as u32).to_string(),
                ending_count,
                total_endings,
            })
            .collect();
        Some(SimAnalytics {
            node_importance,
            path_counts: acc.path_counts.take().unwrap_or_default(),
            node_out_degree: node_out_degrees(&content),
        })
    } else {
        None
    };

    Ok(SimResult {
        mode: SimMode::Explore,
        issues: acc.issues,
        coverage: acc.coverage,
        completed_paths: acc.completed_paths,
        states_explored,
        budget_exhausted,
        goal_results: Vec::new(),
        analytics: sim_analytics,
    })
}

/// Directed coverage completion. The budget-capped breadth pass above leaves deep
/// flag/item-gated nodes uncovered; three directed passes fill the gaps:
///   1. **Nodes** — reach every statically-reachable unvisited node; replay
///      witnesses to mark choices visible along the path.
///   2. **Death paths** — reach game-over nodes entered only via the HP→0 vitals
///      redirect (no static `goto` leads to them).
///   3. **Choices** — reach each still-uncovered choice's owner node in a gate
///      state where it appears in the view.
fn complete_coverage(
    content: &GameContent,
    graph: &GraphIndex,
    abstraction: &ValueAbstraction,
    goal_budget: usize,
    threads: usize,
    coverage: &mut CoverageTracker,
) {
    let milestones = Milestones::from_content(content, graph);

    // Pass 1: directed node coverage, replaying each witness for choices.
    let pending: Vec<String> = coverage
        .unvisited_nodes()
        .into_iter()
        .map(str::to_string)
        .collect();
    parallel_targets(
        content,
        threads,
        coverage,
        pending,
        |worker, target, coverage| {
            if coverage
                .lock()
                .expect("coverage lock")
                .visited_nodes
                .contains(target)
            {
                return; // already swept in by a prior witness path
            }
            let plan = GoalPlan::build(graph, content, target);
            if !plan.statically_reachable {
                return; // not reachable by navigation — pass 2 may still reach it
            }
            let Ok(search) = run_goal_search(GoalSearchConfig {
                content,
                graph,
                plan: &plan,
                dist: &plan.preconditions.progression_distances,
                milestones: &milestones,
                abstraction,
                max_states: goal_budget,
                use_heuristic: true,
                engine: &mut worker.engine,
                initial_state: &worker.initial_state,
                initial_words: worker.initial_words,
            }) else {
                return;
            };
            let mut cov = coverage.lock().expect("coverage lock");
            merge_views(&mut cov, &search.visited_views);
            if search.reached {
                cov.visited_nodes.insert(target.clone());
            }
        },
    );

    // Pass 2: death-path coverage for game-over nodes reached via HP→0.
    let death_targets: Vec<String> = coverage
        .unvisited_nodes()
        .into_iter()
        .filter(|id| {
            content
                .nodes
                .get(*id)
                .is_some_and(|n| n.mode == NodeMode::GameOver)
        })
        .map(str::to_string)
        .collect();
    parallel_targets(
        content,
        threads,
        coverage,
        death_targets,
        |worker, target, coverage| {
            if coverage
                .lock()
                .expect("coverage lock")
                .visited_nodes
                .contains(target)
            {
                return;
            }
            let region = death_region_node_indices(content, graph, target);
            if region.is_empty() {
                return; // no chapter redirects deaths here — genuinely unreachable
            }
            let region_dist = graph.distances_to_any_progression(&region);
            let outcome = death_search::run_death_search(
                &mut worker.engine,
                &worker.initial_state,
                graph,
                abstraction,
                &death_search::DeathTarget {
                    node_id: target,
                    region_dist: &region_dist,
                },
                goal_budget,
            );
            let mut cov = coverage.lock().expect("coverage lock");
            merge_views(&mut cov, &outcome.visited_views);
            if outcome.reached {
                cov.visited_nodes.insert(target.clone());
            }
        },
    );

    // Pass 3: choice coverage — reach the owner node of each still-uncovered
    // choice in a state where its `when` visibility gate holds (so it appears in
    // the view and gets marked). Each success replays and sweeps in every choice
    // visible along the path, so co-located choices fall out together.
    let pending_choices: Vec<(String, String)> = coverage
        .unvisited_choices()
        .into_iter()
        .map(|(n, c)| (n.to_string(), c.to_string()))
        .collect();
    parallel_targets(
        content,
        threads,
        coverage,
        pending_choices,
        |worker, (node_id, choice_id), coverage| {
            if coverage
                .lock()
                .expect("coverage lock")
                .visited_choices
                .contains(&(node_id.clone(), choice_id.clone()))
            {
                return; // swept in by an earlier replay
            }
            let Some(node) = content.nodes.get(node_id) else {
                return;
            };
            let Some(choice) = node
                .choices
                .iter()
                .find(|c| c.presentation.id == *choice_id)
            else {
                return;
            };
            let base = GoalPlan::build(graph, content, node_id);
            if !base.statically_reachable {
                return; // owner node not reachable by navigation
            }
            let extras = choice
                .gate
                .when
                .as_ref()
                .map(preconditions::preconditions_from_gate)
                .unwrap_or_default();
            let preconditions = base
                .preconditions
                .with_extra_requirements(content, graph, extras);
            let plan = GoalPlan {
                preconditions,
                ..base
            };
            let Ok(search) = run_goal_search(GoalSearchConfig {
                content,
                graph,
                plan: &plan,
                dist: &plan.preconditions.progression_distances,
                milestones: &milestones,
                abstraction,
                max_states: goal_budget,
                use_heuristic: true,
                engine: &mut worker.engine,
                initial_state: &worker.initial_state,
                initial_words: worker.initial_words,
            }) else {
                return;
            };
            let mut cov = coverage.lock().expect("coverage lock");
            merge_views(&mut cov, &search.visited_views);
        },
    );
}

/// Per-thread reusable search context: one engine (one content clone + one
/// content validation) shared by every directed search the thread runs.
struct SearchWorker {
    engine: Engine,
    initial_state: blackbox::GameState,
    initial_words: u32,
}

impl SearchWorker {
    fn new(content: &GameContent) -> Option<Self> {
        let mut engine = Engine::new_game(content.clone()).ok()?;
        let view = engine.get_current_view().ok()?;
        let initial_words = count_words_in_view(&view);
        let initial_state = engine.get_state().clone();
        Some(Self {
            engine,
            initial_state,
            initial_words,
        })
    }
}

/// Drain `targets` across up to `threads` workers, each with its own
/// [`SearchWorker`]. Coverage is shared behind a mutex so workers can both
/// merge results and skip targets a concurrent witness path already swept in —
/// preserving the sequential version's pruning.
fn parallel_targets<T: Send>(
    content: &GameContent,
    threads: usize,
    coverage: &mut CoverageTracker,
    targets: Vec<T>,
    work: impl Fn(&mut SearchWorker, &T, &Mutex<&mut CoverageTracker>) + Sync,
) {
    if targets.is_empty() {
        return;
    }
    let threads = threads.max(1).min(targets.len());
    let queue = Mutex::new(targets);
    let coverage = Mutex::new(coverage);
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                let Some(mut worker) = SearchWorker::new(content) else {
                    return;
                };
                loop {
                    let Some(target) = queue.lock().expect("target queue lock").pop() else {
                        return;
                    };
                    work(&mut worker, &target, &coverage);
                }
            });
        }
    });
}

/// Authored choice count (branching factor) for every node — used by analytics
/// to flag high-traffic nodes with little branching as split candidates.
fn node_out_degrees(content: &GameContent) -> std::collections::HashMap<String, usize> {
    content
        .nodes
        .iter()
        .map(|(id, node)| (id.clone(), node.choices.len()))
        .collect()
}

/// Merge `(node_id, visible_choice_ids)` views recorded by a directed search
/// into the coverage tracker — marking each node visited and every choice that
/// was visible in that gate state.
fn merge_views(coverage: &mut CoverageTracker, views: &[(String, Vec<String>)]) {
    for (node_id, choice_ids) in views {
        coverage.visited_nodes.insert(node_id.clone());
        for choice_id in choice_ids {
            coverage
                .visited_choices
                .insert((node_id.clone(), choice_id.clone()));
        }
    }
}

/// Node indices whose chapter redirects player death to `death_node` (a chapter
/// `death_node_id` override, or the scenario default for chapters without one).
/// These are the nodes from which dying lands the player on `death_node`.
fn death_region_node_indices(
    content: &GameContent,
    graph: &GraphIndex,
    death_node: &str,
) -> Vec<u32> {
    use std::collections::HashSet;
    let region_chapters: HashSet<&str> = content
        .chapters
        .iter()
        .filter(|chapter| {
            let effective = chapter
                .death_node_id
                .as_deref()
                .or(content.death_node_id.as_deref());
            effective == Some(death_node)
        })
        .map(|chapter| chapter.id.as_str())
        .collect();

    content
        .nodes
        .iter()
        .filter(|(id, node)| {
            !node.mode.is_terminal()
                && content
                    .node_chapter
                    .get(*id)
                    .is_some_and(|c| region_chapters.contains(c.as_str()))
        })
        .filter_map(|(id, _)| graph.index_of(id))
        .collect()
}

fn run_goals_simulation(config: SimConfig) -> Result<SimResult> {
    let content = Arc::new(config.content);
    let graph = Arc::new(GraphIndex::build(&content));
    let static_issues = graph.static_analysis(&content, &content.start_node_id);
    let do_analytics = config.analytics;
    let milestones = Arc::new(Milestones::from_content(&content, &graph));
    let abstraction = Arc::new(ValueAbstraction::build(&content));

    let goal_ids = match &config.goal_target {
        GoalTarget::Filter(filter) => discover_goals(&content, *filter),
        GoalTarget::Node(id) => vec![id.clone()],
    };

    if goal_ids.is_empty() {
        anyhow::bail!("no goals matched the requested filter");
    }

    let threads = config.threads.max(1).min(goal_ids.len());
    let chunk_size = goal_ids.len().div_ceil(threads);
    let chunks: Vec<Vec<String>> = goal_ids.chunks(chunk_size).map(|c| c.to_vec()).collect();

    struct ThreadOutcome {
        goal_results: Vec<GoalResult>,
        issues: Vec<SimIssue>,
        paths: Vec<CompletedPath>,
        states: usize,
        budget_exhausted: bool,
    }

    let goal_budget = config.goal_budget;
    let use_heuristic = config.use_heuristic;

    let outcomes: Vec<ThreadOutcome> = std::thread::scope(|scope| {
        chunks
            .into_iter()
            .map(|chunk| {
                let content = Arc::clone(&content);
                let graph = Arc::clone(&graph);
                let milestones = Arc::clone(&milestones);
                let abstraction = Arc::clone(&abstraction);
                scope.spawn(move || {
                    let mut goal_results = Vec::with_capacity(chunk.len());
                    let mut issues = Vec::new();
                    let mut paths = Vec::new();
                    let mut states = 0usize;
                    let mut budget_exhausted = false;

                    // One engine per thread — constructing one clones and
                    // revalidates the whole content, far too costly per goal.
                    let mut worker = SearchWorker::new(&content);

                    for goal_id in chunk {
                        let plan = GoalPlan::build(&graph, &content, &goal_id);
                        if !plan.statically_reachable {
                            issues.push(SimIssue::error(
                                IssueKind::GoalStaticallyUnreachable {
                                    node_id: goal_id.clone(),
                                },
                                "",
                            ));
                            goal_results.push(GoalResult {
                                goal_id,
                                reached: false,
                                statically_reachable: false,
                                states_explored: 0,
                                choice_count: None,
                                closest_node: None,
                                closest_milestone: None,
                                budget_exhausted: false,
                                missing_preconditions: Vec::new(),
                                required_preconditions: Vec::new(),
                                witness: None,
                            });
                            continue;
                        }

                        // Use progression-only distances already computed during plan
                        // construction — more accurate heuristic than all-edge distances
                        // (ignores restart/menu shortcuts) and costs nothing extra.
                        let search = worker
                            .as_mut()
                            .ok_or(())
                            .and_then(|w| {
                                run_goal_search(GoalSearchConfig {
                                    content: &content,
                                    graph: &graph,
                                    plan: &plan,
                                    dist: &plan.preconditions.progression_distances,
                                    milestones: &milestones,
                                    abstraction: &abstraction,
                                    max_states: goal_budget,
                                    use_heuristic,
                                    engine: &mut w.engine,
                                    initial_state: &w.initial_state,
                                    initial_words: w.initial_words,
                                })
                                .map_err(|_| ())
                            })
                            .unwrap_or_else(|_e| GoalSearchResult {
                                reached: false,
                                states_explored: 0,
                                budget_exhausted: false,
                                issues: Vec::new(),
                                completed_path: None,
                                closest_node: None,
                                closest_milestone: None,
                                missing_preconditions: Vec::new(),
                                visited_views: Vec::new(),
                            });

                        states += search.states_explored;
                        budget_exhausted |= search.budget_exhausted;
                        issues.extend(search.issues);

                        let required_preconditions: Vec<String> = plan
                            .preconditions
                            .requirements
                            .iter()
                            .map(|p| p.label())
                            .collect();

                        if !search.reached {
                            if search.budget_exhausted {
                                issues.push(SimIssue::warning(
                                    IssueKind::GoalBudgetExhausted {
                                        node_id: plan.goal_id.clone(),
                                        closest_milestone: search.closest_milestone.clone(),
                                        missing_preconditions: search.missing_preconditions.clone(),
                                    },
                                    "budget exhausted",
                                ));
                            } else if !search.missing_preconditions.is_empty() {
                                issues.push(SimIssue::error(
                                    IssueKind::GoalMissingPreconditions {
                                        node_id: plan.goal_id.clone(),
                                        at_milestone: search.closest_milestone.clone(),
                                        missing: search.missing_preconditions.clone(),
                                    },
                                    "",
                                ));
                            } else {
                                issues.push(SimIssue::error(
                                    IssueKind::UnreachableGoal {
                                        node_id: plan.goal_id.clone(),
                                        closest_node: search.closest_node.clone(),
                                        closest_milestone: search.closest_milestone.clone(),
                                    },
                                    String::new(),
                                ));
                            }
                        }

                        let choice_count = search.completed_path.as_ref().map(|p| p.choice_count);
                        let witness = search
                            .completed_path
                            .as_ref()
                            .and_then(|p| p.witness.clone());
                        if let Some(path) = search.completed_path {
                            paths.push(path);
                        }

                        goal_results.push(GoalResult {
                            goal_id: plan.goal_id,
                            reached: search.reached,
                            statically_reachable: true,
                            states_explored: search.states_explored,
                            choice_count,
                            closest_node: search.closest_node,
                            closest_milestone: search.closest_milestone,
                            budget_exhausted: search.budget_exhausted,
                            missing_preconditions: search.missing_preconditions,
                            required_preconditions,
                            witness,
                        });
                    }

                    ThreadOutcome {
                        goal_results,
                        issues,
                        paths,
                        states,
                        budget_exhausted,
                    }
                })
            })
            .map(|h| h.join().expect("goal worker panicked"))
            .collect()
    });

    let mut goal_results = Vec::with_capacity(goal_ids.len());
    let mut all_issues: Vec<SimIssue> = Vec::new();
    let mut all_paths = Vec::new();
    let mut total_states = 0usize;
    let mut any_budget_exhausted = false;

    for node_id in static_issues.dead_end_nodes {
        all_issues.push(SimIssue::error(IssueKind::StaticDeadEnd { node_id }, ""));
    }
    for node_ids in static_issues.trapping_loops {
        all_issues.push(SimIssue::error(IssueKind::TrappingLoop { node_ids }, ""));
    }

    for outcome in outcomes {
        total_states += outcome.states;
        any_budget_exhausted |= outcome.budget_exhausted;
        all_issues.extend(outcome.issues);
        all_paths.extend(outcome.paths);
        goal_results.extend(outcome.goal_results);
    }

    goal_results.sort_by(|a, b| a.goal_id.cmp(&b.goal_id));
    all_issues.sort_by_key(|i| std::cmp::Reverse(i.severity));

    let sim_analytics = if do_analytics {
        let (total_endings, counts) = graph.node_ending_coverage(&content);
        let node_importance = counts
            .into_iter()
            .enumerate()
            .map(|(i, ending_count)| analytics::NodeImportance {
                node_id: graph.id_of(i as u32).to_string(),
                ending_count,
                total_endings,
            })
            .collect();
        let mut path_counts = analytics::PathCounts::default();
        for gr in &goal_results {
            if let Some(witness) = &gr.witness {
                path_counts.record_path(&witness.steps, &gr.goal_id);
            }
        }
        Some(SimAnalytics {
            node_importance,
            path_counts,
            node_out_degree: node_out_degrees(&content),
        })
    } else {
        None
    };

    Ok(SimResult {
        mode: SimMode::Goals,
        issues: all_issues,
        coverage: CoverageTracker::from_content(&content),
        completed_paths: all_paths,
        states_explored: total_states,
        budget_exhausted: any_budget_exhausted,
        goal_results,
        analytics: sim_analytics,
    })
}
