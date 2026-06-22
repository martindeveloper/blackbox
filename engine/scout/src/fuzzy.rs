//! Allocation-free fuzzy scorer. The query is lowercased once by the caller;
//! every haystack is matched in place over its bytes — no per-candidate buffers.
//!
//! Tiering, best first: exact > prefix > word-boundary substring > substring >
//! boundary-anchored subsequence. Within a tier, earlier and tighter wins.

use memchr::memchr;

const TIER_EXACT: i32 = 1_000_000;
const TIER_PREFIX: i32 = 100_000;
const TIER_SUBSTR: i32 = 10_000;

/// Branchless ASCII fold: identity for non-letters, `a-z` for `A-Z`.
const LOWER: [u8; 256] = {
    let mut t = [0u8; 256];
    let mut i = 0u8;
    while i < 255 {
        t[i as usize] = if i.is_ascii_uppercase() {
            i + (b'a' - b'A')
        } else {
            i
        };
        i += 1;
    }
    t[255] = if 255u8.is_ascii_uppercase() {
        255 + (b'a' - b'A')
    } else {
        255
    };
    t
};

#[inline(always)]
fn lower(b: u8) -> u8 {
    LOWER[b as usize]
}

#[inline(always)]
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

/// Case-insensitive byte equality for `q` anchored at `at` in `h`.
#[inline]
fn ci_eq_at(h: &[u8], at: usize, q: &[u8]) -> bool {
    let tail = &h[at + 1..at + q.len()];
    let mut i = 0;
    while i < tail.len() {
        if lower(tail[i]) != lower(q[i + 1]) {
            return false;
        }
        i += 1;
    }
    true
}

/// Short haystacks use a tight byte scan; longer buffers use `memchr` to skip runs.
const MEMCHR_MIN_LEN: usize = 64;

/// Naive case-insensitive scan — fastest for entity ids and other short strings.
fn find_ci_naive(h: &[u8], q: &[u8]) -> Option<usize> {
    let first = lower(q[0]);
    let max_start = h.len() - q.len();
    for start in 0..=max_start {
        if lower(h[start]) != first {
            continue;
        }
        if ci_eq_at(h, start, q) {
            return Some(start);
        }
    }
    None
}

/// Case-insensitive substring search. Returns the start index of the first hit.
fn find_ci(h: &[u8], q: &[u8]) -> Option<usize> {
    if q.is_empty() {
        return Some(0);
    }
    if q.len() > h.len() {
        return None;
    }
    if h.len() < MEMCHR_MIN_LEN {
        return find_ci_naive(h, q);
    }

    let q0l = lower(q[0]);
    let q0u = q[0].to_ascii_uppercase();
    let max_start = h.len() - q.len();
    let mut start = 0usize;

    while start <= max_start {
        let hay = &h[start..=max_start];
        let rel = if q0l == q0u {
            memchr(q0l, hay)?
        } else {
            match (memchr(q0l, hay), memchr(q0u, hay)) {
                (Some(a), Some(b)) => a.min(b),
                (Some(a), None) => a,
                (None, Some(b)) => b,
                (None, None) => return None,
            }
        };
        let at = start + rel;
        if lower(h[at]) == q0l && ci_eq_at(h, at, q) {
            return Some(at);
        }
        start = at + 1;
    }
    None
}

/// Score `haystack` against the pre-lowercased `query`. `None` means no match;
/// higher is better. An empty query matches everything at score 0.
#[inline]
pub fn score(haystack: &str, query: &[u8]) -> Option<i32> {
    if query.is_empty() {
        return Some(0);
    }
    let h = haystack.as_bytes();
    if query.len() > h.len() {
        return None;
    }

    if let Some(pos) = find_ci(h, query) {
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

/// Best score across `id` and optional distinct `label` without re-scanning the
/// same string when they are identical (common for assets and flags).
#[inline]
pub fn score_fields(id: &str, label: &str, query: &[u8]) -> Option<i32> {
    let mut best = score(id, query);
    if id != label
        && let Some(s) = score(label, query)
    {
        best = Some(best.map_or(s, |b| b.max(s)));
    }
    best
}

/// Full-text scoring: the query must appear as a contiguous (case-insensitive)
/// substring of `haystack`. Scored in a band strictly below any id/label match
/// from [`score`], so an entity name always outranks a body-text hit, while an
/// earlier occurrence still beats a later one. Fuzzy subsequence is deliberately
/// not used here — body prose would match almost any query.
#[inline]
pub fn text_score(haystack: &str, query: &[u8]) -> Option<i32> {
    if query.is_empty() {
        return None;
    }
    let pos = find_ci(haystack.as_bytes(), query)?;
    Some(5_000 - (pos as i32).min(4_000))
}

#[inline]
fn is_utf8_boundary(bytes: &[u8], pos: usize) -> bool {
    pos == 0 || bytes[pos] & 0xC0 != 0x80
}

/// Walk back `n` char boundaries from `byte_pos` (exclusive).
fn char_boundary_before(bytes: &[u8], byte_pos: usize, n: usize) -> usize {
    let mut pos = byte_pos;
    let mut left = n;
    while left > 0 && pos > 0 {
        pos -= 1;
        if is_utf8_boundary(bytes, pos) {
            left -= 1;
        }
    }
    pos
}

/// Walk forward `n` char boundaries from `byte_pos` (inclusive).
fn char_boundary_after(bytes: &[u8], byte_pos: usize, n: usize) -> usize {
    let mut pos = byte_pos;
    let mut right = n;
    while right > 0 && pos < bytes.len() {
        if is_utf8_boundary(bytes, pos) {
            right -= 1;
        }
        pos += 1;
    }
    pos
}

/// Build a short context window around the first substring hit across the
/// fragments, for display and agent context. Allocates only for shown results.
pub fn snippet(fragments: &[&str], query: &[u8]) -> Option<String> {
    const CTX: usize = 32;
    if query.is_empty() {
        return None;
    }
    for frag in fragments {
        let bytes = frag.as_bytes();
        let Some(byte_pos) = find_ci(bytes, query) else {
            continue;
        };
        if !frag.is_char_boundary(byte_pos) {
            continue;
        }
        let start = char_boundary_before(bytes, byte_pos, CTX);
        let end = char_boundary_after(bytes, byte_pos + query.len(), CTX);
        let slice = std::str::from_utf8(&bytes[start..end]).ok()?;
        let mut out = String::with_capacity(slice.len() + 2);
        if start > 0 {
            out.push('…');
        }
        out.push_str(slice);
        if end < bytes.len() {
            out.push('…');
        }
        return Some(out);
    }
    None
}

/// Greedy single-pass subsequence match with boundary and contiguity bonuses.
fn fuzzy(h: &[u8], q: &[u8]) -> Option<i32> {
    let mut qi = 0usize;
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

    #[test]
    fn score_fields_merges_id_and_label() {
        let q = b"title";
        let both = score_fields("id_x", "my_title", q);
        let label_only = score("my_title", q);
        assert_eq!(both, label_only);
    }

    #[test]
    fn dialogue_text_with_leading_quote() {
        let frag = "\"You heard it, then. Underneath. Most listeners only hear the damage.\"";
        let q = b"you heard it";
        assert!(text_score(frag, q).is_some());
        assert!(find_ci(frag.as_bytes(), q).is_some());
    }
}
