use blackbox::view::GameView;

const WORDS_PER_MINUTE: f64 = 200.0;
const SECONDS_PER_CHOICE: f64 = 3.0;

#[derive(Debug, Clone)]
pub struct GoalWitness {
    pub steps: Vec<(String, String)>,
    pub gateway_snapshot: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct CompletedPath {
    pub word_count: u32,
    pub choice_count: usize,
    pub witness: Option<GoalWitness>,
}

impl CompletedPath {
    pub fn simple(word_count: u32, choice_count: usize) -> Self {
        Self {
            word_count,
            choice_count,
            witness: None,
        }
    }

    pub fn total_minutes(&self) -> f64 {
        let reading = self.word_count as f64 / WORDS_PER_MINUTE;
        let deciding = (self.choice_count as f64 * SECONDS_PER_CHOICE) / 60.0;
        reading + deciding
    }
}

pub struct PlayTimeStats {
    pub shortest: CompletedPath,
    pub median: CompletedPath,
    pub longest: CompletedPath,
}

pub fn compute_stats(mut paths: Vec<CompletedPath>) -> Option<PlayTimeStats> {
    if paths.is_empty() {
        return None;
    }
    paths.sort_by(|a, b| {
        a.total_minutes()
            .partial_cmp(&b.total_minutes())
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mid = paths.len() / 2;
    Some(PlayTimeStats {
        shortest: paths[0].clone(),
        median: paths[mid].clone(),
        longest: paths[paths.len() - 1].clone(),
    })
}

pub fn count_words_in_view(view: &GameView) -> u32 {
    view.text
        .iter()
        .map(|block| block.text.split_whitespace().count() as u32)
        .sum()
}
