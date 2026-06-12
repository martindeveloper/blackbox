//! Backward-compatibility markers for content and wire-format migrations.
//!
//! Wrap legacy fallbacks in [`obsolete!`] so they are easy to grep (`obsolete!(`)
//! and remove once existing scenarios no longer rely on them.

/// Temporary compatibility path — prefer the replacement named in `$reason`.
///
/// - `$since` — feature or format version that introduced the replacement
/// - `$reason` — what authors or callers should use instead
///
/// # Example
///
/// ```ignore
/// obsolete!(
///     "gate-v2",
///     "prefer `whenDisabledReason` over lone `disabledReason` on `when` gates",
///     legacy_when_disabled_reason(gate)
/// )
/// ```
#[macro_export]
macro_rules! obsolete {
    ($since:literal, $reason:literal, $expr:expr) => {{
        const _: &str = concat!("obsolete:", $since, ":", $reason);
        $expr
    }};
}
