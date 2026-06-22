use std::path::{Path, PathBuf};

/// Directories never worth descending into: VCS, editor sidecar, build and
/// dependency trees. Always applied; `--ignore` adds to this set.
pub const DEFAULT_IGNORES: &[&str] = &[
    ".git",
    ".blackbox",
    ".cache",
    ".agents",
    "node_modules",
    "target",
    "dist",
    "release",
    "resources",
];

/// Resolve `target` to the scenario manifests it covers. A file is taken as-is;
/// a directory is walked recursively, skipping any component matching `ignores`.
pub fn discover(target: &Path, ignores: &[String]) -> Vec<PathBuf> {
    if target.is_file() {
        return vec![target.to_path_buf()];
    }
    let mut out = Vec::new();
    walk(target, ignores, &mut out);
    out.sort();
    out
}

fn walk(dir: &Path, ignores: &[String], out: &mut Vec<PathBuf>) {
    let manifest = dir.join("scenario.json");
    if manifest.is_file() {
        // A scenario folder owns its subtree; no nested scenarios to find below.
        out.push(manifest);
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if is_ignored(name, ignores) {
            continue;
        }
        walk(&path, ignores, out);
    }
}

fn is_ignored(name: &str, ignores: &[String]) -> bool {
    ignores
        .iter()
        .any(|pattern| glob_match(pattern.as_bytes(), name.as_bytes()))
}

/// Iterative `*`/`?` wildcard match over a single path component. No allocation,
/// no backtracking blowup — `*` is resolved with a single saved restart point.
pub fn glob_match(pattern: &[u8], text: &[u8]) -> bool {
    let (mut p, mut t) = (0, 0);
    let mut star: Option<usize> = None;
    let mut resume = 0;

    while t < text.len() {
        if p < pattern.len() && (pattern[p] == b'?' || pattern[p] == text[t]) {
            p += 1;
            t += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            star = Some(p);
            resume = t;
            p += 1;
        } else if let Some(sp) = star {
            p = sp + 1;
            resume += 1;
            t = resume;
        } else {
            return false;
        }
    }
    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }
    p == pattern.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_and_wildcard() {
        assert!(glob_match(b".git", b".git"));
        assert!(!glob_match(b".git", b".gitignore"));
        assert!(glob_match(b"*.tmp", b"scratch.tmp"));
        assert!(glob_match(b"node_*", b"node_modules"));
        assert!(glob_match(b"*", b"anything"));
        assert!(glob_match(b"a?c", b"abc"));
        assert!(!glob_match(b"a?c", b"ac"));
    }

    #[test]
    fn defaults_cover_sidecars() {
        let ignores: Vec<String> = DEFAULT_IGNORES.iter().map(|s| s.to_string()).collect();
        assert!(is_ignored(".git", &ignores));
        assert!(is_ignored(".blackbox", &ignores));
        assert!(is_ignored("node_modules", &ignores));
        assert!(!is_ignored("chapters", &ignores));
    }
}
