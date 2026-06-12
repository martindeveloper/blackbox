//! Central logging for the blackbox engine.
//!
//! Levels match the web client: `debug`, `info`, `warn`, `error`.
//! Configure at runtime via [`set_log_level`] and [`set_log_formatter`].

mod formatters;
mod sink;

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
#[cfg(not(target_arch = "wasm32"))]
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

pub use sink::{LogSink, StderrSink};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}

impl LogLevel {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "debug" => Some(Self::Debug),
            "info" => Some(Self::Info),
            "warn" | "warning" => Some(Self::Warn),
            "error" => Some(Self::Error),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::Debug,
            1 => Self::Info,
            2 => Self::Warn,
            _ => Self::Error,
        }
    }

    fn to_u8(self) -> u8 {
        self as u8
    }

    fn enabled(self, configured: Self) -> bool {
        self >= configured
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormatter {
    Text,
    Structured,
}

impl LogFormatter {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "text" | "plain" => Some(Self::Text),
            "structured" | "json" => Some(Self::Structured),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Structured => "structured",
        }
    }

    fn from_u8(value: u8) -> Self {
        if value == 1 {
            Self::Structured
        } else {
            Self::Text
        }
    }

    fn to_u8(self) -> u8 {
        match self {
            Self::Text => 0,
            Self::Structured => 1,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LogRecord {
    pub level: LogLevel,
    pub category: String,
    pub message: String,
    pub fields: Option<Value>,
    pub timestamp_ms: u64,
}

static LOG_LEVEL: AtomicU8 = AtomicU8::new(1);
static LOG_FORMATTER: AtomicU8 = AtomicU8::new(0);

static TEST_CAPTURE: Mutex<Option<TestCapture>> = Mutex::new(None);

struct TestCapture {
    lines: Vec<String>,
    max_lines: usize,
}

pub fn set_log_level(level: LogLevel) {
    let previous = get_log_level();
    LOG_LEVEL.store(level.to_u8(), Ordering::Relaxed);
    if previous != level {
        log_level_changed(previous, level);
    }
}

pub fn get_log_level() -> LogLevel {
    LogLevel::from_u8(LOG_LEVEL.load(Ordering::Relaxed))
}

pub fn set_log_formatter(formatter: LogFormatter) {
    LOG_FORMATTER.store(formatter.to_u8(), Ordering::Relaxed);
}

pub fn get_log_formatter() -> LogFormatter {
    LogFormatter::from_u8(LOG_FORMATTER.load(Ordering::Relaxed))
}

pub fn set_log_sink(sink: Arc<dyn LogSink>) {
    sink::set_sink(sink);
}

pub fn reset_log_sink() {
    sink::reset_sink();
}

pub fn set_test_capture(max_lines: Option<usize>) {
    let mut guard = TEST_CAPTURE.lock().expect("test capture lock poisoned");
    *guard = max_lines.map(|max_lines| TestCapture {
        lines: Vec::new(),
        max_lines,
    });
}

pub fn test_capture_lines() -> Vec<String> {
    TEST_CAPTURE
        .lock()
        .expect("test capture lock poisoned")
        .as_ref()
        .map(|capture| capture.lines.clone())
        .unwrap_or_default()
}

pub fn log(level: LogLevel, category: &str, message: impl AsRef<str>) {
    log_with_fields(level, category, message, None);
}

pub fn log_with_fields(
    level: LogLevel,
    category: &str,
    message: impl AsRef<str>,
    fields: Option<Value>,
) {
    if !level.enabled(get_log_level()) {
        return;
    }

    let record = LogRecord {
        level,
        category: category.to_string(),
        message: message.as_ref().to_string(),
        fields,
        timestamp_ms: current_timestamp_ms(),
    };

    let formatted = formatters::format_record(get_log_formatter(), &record);

    if let Ok(mut guard) = TEST_CAPTURE.lock()
        && let Some(capture) = guard.as_mut()
    {
        capture.lines.push(formatted.clone());
        if capture.lines.len() > capture.max_lines {
            let overflow = capture.lines.len() - capture.max_lines;
            capture.lines.drain(0..overflow);
        }
    }

    sink::write(level, &formatted);
}

fn log_level_changed(previous: LogLevel, current: LogLevel) {
    let record = LogRecord {
        level: LogLevel::Info,
        category: "logging".to_string(),
        message: format!(
            "Core log level changed: {} -> {}",
            previous.as_str(),
            current.as_str()
        ),
        fields: Some(serde_json::json!({
            "previous": previous.as_str(),
            "current": current.as_str(),
        })),
        timestamp_ms: current_timestamp_ms(),
    };

    let formatted = formatters::format_record(get_log_formatter(), &record);

    if let Ok(mut guard) = TEST_CAPTURE.lock()
        && let Some(capture) = guard.as_mut()
    {
        capture.lines.push(formatted.clone());
        if capture.lines.len() > capture.max_lines {
            let overflow = capture.lines.len() - capture.max_lines;
            capture.lines.drain(0..overflow);
        }
    }

    sink::write(LogLevel::Info, &formatted);
}

pub fn is_debug_enabled() -> bool {
    LogLevel::Debug.enabled(get_log_level())
}

pub fn debug(category: &str, message: impl AsRef<str>) {
    log(LogLevel::Debug, category, message);
}

pub fn debug_lazy(category: &str, message: impl FnOnce() -> String) {
    if is_debug_enabled() {
        debug(category, message());
    }
}

pub fn debug_fields(category: &str, message: impl AsRef<str>, fields: Value) {
    log_with_fields(LogLevel::Debug, category, message, Some(fields));
}

pub fn debug_fields_lazy(category: &str, message: impl AsRef<str>, fields: impl FnOnce() -> Value) {
    if is_debug_enabled() {
        debug_fields(category, message, fields());
    }
}

pub fn info(category: &str, message: impl AsRef<str>) {
    log(LogLevel::Info, category, message);
}

pub fn info_fields(category: &str, message: impl AsRef<str>, fields: Value) {
    log_with_fields(LogLevel::Info, category, message, Some(fields));
}

pub fn warn(category: &str, message: impl AsRef<str>) {
    log(LogLevel::Warn, category, message);
}

pub fn warn_fields(category: &str, message: impl AsRef<str>, fields: Value) {
    log_with_fields(LogLevel::Warn, category, message, Some(fields));
}

pub fn error(category: &str, message: impl AsRef<str>) {
    log(LogLevel::Error, category, message);
}

fn current_timestamp_ms() -> u64 {
    // SystemTime is not available in wasm32; the browser console adds its own timestamps.
    #[cfg(target_arch = "wasm32")]
    {
        0
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    }
}

#[macro_export]
macro_rules! log_debug {
    ($category:expr, $($message:tt)*) => {
        $crate::logging::debug($category, format!($($message)*))
    };
}

#[macro_export]
macro_rules! log_info {
    ($category:expr, $($message:tt)*) => {
        $crate::logging::info($category, format!($($message)*))
    };
}

#[macro_export]
macro_rules! log_warn {
    ($category:expr, $($message:tt)*) => {
        $crate::logging::warn($category, format!($($message)*))
    };
}

#[macro_export]
macro_rules! log_error {
    ($category:expr, $($message:tt)*) => {
        $crate::logging::error($category, format!($($message)*))
    };
}
