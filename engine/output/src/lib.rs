//! Shared output routing for Blackbox CLI tools (lint, bundler, simulator).
//!
//! A tool builds one [`Output`] with `Output::new(json)` and routes **all** of
//! its output through it — no direct `println!`, `eprintln!`, or `serde_json`
//! emission anywhere in tool code. The format (text vs JSON) is decided once,
//! and a single call site renders the right form:
//!
//!   * [`Output::emit`] is the format-aware *result* call. You hand it two
//!     renderers — one that builds the structured value, one that builds the
//!     human report — and only the one matching the active format runs. In JSON
//!     mode the value is serialised (with any buffered logs merged under a
//!     `logs` key); in text mode the report string is written to stdout. No
//!     `if json { … } else { … }` branching at the call site.
//!   * [`Output::print`] writes plain human text (banners, help, headers) that
//!     has no structured counterpart — a no-op in JSON mode.
//!   * [`Output::log`] (and `info`/`warn`/`error`) records a diagnostic: written
//!     to stderr in text mode, buffered into the JSON `logs` array otherwise.

use std::sync::Mutex;

use serde::Serialize;
use serde_json::{Map, Value};

/// The rendering format an [`Output`] is fixed to for its lifetime.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Text,
    Json,
}

/// Severity of a diagnostic log line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            LogLevel::Info => "info",
            LogLevel::Warn => "warn",
            LogLevel::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct LogEntry {
    level: &'static str,
    message: String,
}

/// `Output` is `Send + Sync` (logs behind a `Mutex`), so it can be shared via
/// `Arc` into worker threads — e.g. the parallel asset-cook pipeline logs
/// through the same sink as the main thread.
#[derive(Debug)]
pub struct Output {
    format: Format,
    logs: Mutex<Vec<LogEntry>>,
}

impl Output {
    pub fn new(json: bool) -> Self {
        Self::with_format(if json { Format::Json } else { Format::Text })
    }

    pub fn with_format(format: Format) -> Self {
        Self {
            format,
            logs: Mutex::new(Vec::new()),
        }
    }

    pub fn format(&self) -> Format {
        self.format
    }

    pub fn is_json(&self) -> bool {
        self.format == Format::Json
    }

    /// Write plain human text verbatim to stdout (it carries its own newlines).
    /// No-op in JSON mode — use it for banners, help, and headers that have no
    /// structured counterpart.
    pub fn print(&self, text: &str) {
        if self.format == Format::Text {
            print!("{text}");
        }
    }

    /// Record a diagnostic. In text mode it is written to stderr immediately (so
    /// it never interleaves with the stdout report); in JSON mode it is buffered
    /// and merged into the emitted object's `logs` array by [`Output::emit`].
    pub fn log(&self, level: LogLevel, message: impl Into<String>) {
        let message = message.into();
        match self.format {
            Format::Json => self.logs.lock().expect("logs lock").push(LogEntry {
                level: level.as_str(),
                message,
            }),
            Format::Text => eprintln!("{}: {message}", level.as_str()),
        }
    }

    pub fn info(&self, message: impl Into<String>) {
        self.log(LogLevel::Info, message);
    }

    pub fn warn(&self, message: impl Into<String>) {
        self.log(LogLevel::Warn, message);
    }

    pub fn error(&self, message: impl Into<String>) {
        self.log(LogLevel::Error, message);
    }

    /// Emit the tool's result. Exactly one renderer runs, chosen by the active
    /// format: `json` builds the structured value (serialised as one line, with
    /// buffered logs merged under `logs`), `text` builds the human report
    /// (written verbatim to stdout). The non-selected renderer is never called,
    /// so each stays cheap and the call site has no format branching.
    pub fn emit<T, J, H>(&self, json: J, text: H) -> Result<(), serde_json::Error>
    where
        T: Serialize,
        J: FnOnce() -> T,
        H: FnOnce() -> String,
    {
        match self.format {
            Format::Text => {
                print!("{}", text());
                Ok(())
            }
            Format::Json => {
                let mut root = serde_json::to_value(json())?;
                let logs = self.logs.lock().expect("logs lock");
                if !logs.is_empty() {
                    let entries = serde_json::to_value(&*logs)?;
                    match &mut root {
                        Value::Object(map) => {
                            map.insert("logs".to_string(), entries);
                        }
                        other => {
                            let mut map = Map::new();
                            map.insert("result".to_string(), other.take());
                            map.insert("logs".to_string(), entries);
                            root = Value::Object(map);
                        }
                    }
                }
                println!("{}", serde_json::to_string(&root)?);
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_strings() {
        assert_eq!(LogLevel::Info.as_str(), "info");
        assert_eq!(LogLevel::Warn.as_str(), "warn");
        assert_eq!(LogLevel::Error.as_str(), "error");
    }

    #[test]
    fn text_mode_does_not_buffer_logs() {
        let out = Output::new(false);
        out.info("hello");
        assert!(out.logs.lock().unwrap().is_empty());
    }

    #[test]
    fn json_mode_buffers_logs() {
        let out = Output::new(true);
        out.warn("careful");
        out.error("boom");
        let logs = out.logs.lock().unwrap();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].level, "warn");
        assert_eq!(logs[1].message, "boom");
    }

    #[test]
    fn emit_runs_only_the_active_renderer() {
        // Text mode must not invoke the JSON renderer.
        let out = Output::new(false);
        out.emit(
            || -> serde_json::Value { panic!("json renderer ran in text mode") },
            String::new,
        )
        .unwrap();

        // JSON mode must not invoke the text renderer.
        let out = Output::new(true);
        out.emit(
            || serde_json::json!({"ok": true}),
            || panic!("text renderer ran in JSON mode"),
        )
        .unwrap();
    }
}
