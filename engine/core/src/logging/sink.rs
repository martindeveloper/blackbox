use std::io::Write;
use std::sync::{Arc, RwLock};

use super::LogLevel;

pub trait LogSink: Send + Sync {
    fn write(&self, level: LogLevel, formatted: &str);
}

pub struct StderrSink;

impl LogSink for StderrSink {
    fn write(&self, _level: LogLevel, formatted: &str) {
        let _ = writeln!(std::io::stderr(), "{formatted}");
    }
}

static SINK: RwLock<Option<Arc<dyn LogSink>>> = RwLock::new(None);

pub fn set_sink(sink: Arc<dyn LogSink>) {
    if let Ok(mut guard) = SINK.write() {
        *guard = Some(sink);
    }
}

pub fn reset_sink() {
    if let Ok(mut guard) = SINK.write() {
        *guard = None;
    }
}

pub fn write(level: LogLevel, formatted: &str) {
    let sink = SINK
        .read()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_else(|| Arc::new(StderrSink));
    sink.write(level, formatted);
}
