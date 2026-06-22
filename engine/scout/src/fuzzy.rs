//! Allocation-free fuzzy scorer. The query is lowercased once by the caller;
//! every haystack is matched in place over its bytes — no per-candidate buffers.
//!
//! Tiering, best first: exact > prefix > word-boundary substring > substring >
//! boundary-anchored subsequence. Within a tier, earlier and tighter wins.

const TIER_EXACT: i32 = 1_000_000;
const TIER_PREFIX: i32 = 100_000;
const TIER_SUBSTR: i32 = 10_000;

#[inline]
fn lower(b: u8) -> u8 {
    b.to_ascii_lowercase()
}

#[inline]
fn is_sep(b: u8) -> bool {
    matches!(b, b'_' | b'-' | b'.' | b'/' | b' ' | b':')
}

/// A match starts a new "word" at index 0, after a separator, or on a
/// lower→upper camelCase hump.
#[inline]
fn is_boundary(h: &[u8], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    let prev = h[i - 1];
    is_sep(prev) || (prev.is_ascii_lowercase() && h[i].is_ascii_uppercase())
}

/// Case-insensitive substring search. Returns the start index of the first hit.
fn find_ci(h: &[u8], q: &[u8]) -> Option<usize> {
    if q.len() > h.len() {
        return None;
    }
    let first = lower(q[0]);
    for start in 0..=h.len() - q.len() {
        if lower(h[start]) != first {
            continue;
        }
        if h[start + 1..start + q.len()]
            .iter()
            .zip(&q[1..])
            .all(|(&a, &b)| lower(a) == lower(b))
        {
            return Some(start);
        }
    }
    None
}

/// Score `haystack` against the pre-lowercased `query`. `None` means no match;
/// higher is better. An empty query matches everything at score 0.
pub fn score(haystack: &str, query: &[u8]) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }
    let h = haystack.as_bytes();
    if query.len() > h.len() {
        return None;
    }

    if let Some(pos) = find_ci(h, query) {
        // Reward earlier hits and tighter coverage of the haystack.
        let tightness = (h.len() - query.len()) as i32;
        if pos == 0 && h.len() == query.len() {
            return Some(TIER_EXACT - tightness);
        }
        if pos == 0 {
            return Some(TIER_PREFIX - tightness);
        }
        let boundary = if is_boundary(h, pos) { 500 } else { 0 };
        return Some(TIER_SUBSTR + boundary - pos as i32 - tightness);
    }

    fuzzy(h, query)
}

/// Full-text scoring: the query must appear as a contiguous (case-insensitive)
/// substring of `haystack`. Scored in a band strictly below any id/label match
/// from [`score`], so an entity name always outranks a body-text hit, while an
/// earlier occurrence still beats a later one. Fuzzy subsequence is deliberately
/// not used here — body prose would match almost any query.
pub fn text_score(haystack: &str, query: &[u8]) -> Option<i32> {
    if query.is_empty() {
        return None;
    }
    let pos = find_ci(haystack.as_bytes(), query)?;
    Some(5_000 - (pos as i32).min(4_000))
}

/// Build a short context window around the first substring hit across the
/// fragments, for display and agent context. Allocates only for shown results.
pub fn snippet(fragments: &[&str], query: &[u8]) -> Option<String> {
    const CTX: usize = 32;
    if query.is_empty() {
        return None;
    }
    for frag in fragments {
        let Some(byte_pos) = find_ci(frag.as_bytes(), query) else {
            continue;
        };
        if !frag.is_char_boundary(byte_pos) {
            continue;
        }
        let start_char = frag[..byte_pos].chars().count();
        let chars: Vec<char> = frag.chars().collect();
        let q_chars = std::str::from_utf8(query).map(|q| q.chars().count()).unwrap_or(0);
        let from = start_char.saturating_sub(CTX);
        let to = (start_char + q_chars + CTX).min(chars.len());
        let mut out = String::new();
        if from > 0 {
            out.push('…');
        }
        out.extend(&chars[from..to]);
        if to < chars.len() {
            out.push('…');
        }
        return Some(out);
    }
    None
}

/// Greedy single-pass subsequence match with boundary and contiguity bonuses.
fn fuzzy(h: &[u8], q: &[u8]) -> Option<i32> {
    let mut qi = 0;
    let mut acc = 0i32;
    let mut run = false;
    let mut first = None;

    for (i, &c) in h.iter().enumerate() {
        if qi < q.len() && lower(c) == lower(q[qi]) {
            if first.is_none() {
                first = Some(i);
            }
            acc += 16;
            if run {
                acc += 12;
            }
            if is_boundary(h, i) {
                acc += 24;
            }
            qi += 1;
            run = true;
        } else {
            run = false;
        }
    }

    (qi == q.len()).then(|| acc - first.unwrap_or(0) as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(h: &str, q: &str) -> Option<i32> {
        score(h, q.to_ascii_lowercase().as_bytes())
    }

    #[test]
    fn empty_query_matches() {
        assert_eq!(s("anything", ""), Some(0));
    }

    #[test]
    fn no_match_returns_none() {
        assert!(s("alpha", "xyz").is_none());
        assert!(s("ab", "abc").is_none());
    }

    #[test]
    fn tier_ordering() {
        let exact = s("door", "door").unwrap();
        let prefix = s("doorway", "door").unwrap();
        let substr = s("trapdoor", "door").unwrap();
        let fuzzy = s("d_o_o_r_k", "door").unwrap();
        assert!(exact > prefix && prefix > substr && substr > fuzzy);
    }

    #[test]
    fn boundary_substring_beats_mid_word() {
        let boundary = s("the_door_key", "door").unwrap();
        let mid = s("trapdoorx", "door").unwrap();
        assert!(boundary > mid);
    }

    #[test]
    fn case_insensitive_and_camel_boundary() {
        assert!(s("startNodeId", "node").is_some());
        let camel = s("startNodeId", "ni").unwrap();
        let plain = s("startnodeid", "ni").unwrap();
        assert!(camel > plain);
    }

    #[test]
    fn earlier_hit_scores_higher() {
        assert!(s("key_door", "door").unwrap() < s("door_key", "door").unwrap());
    }
}
