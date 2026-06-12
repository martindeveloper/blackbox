use std::sync::Arc;

use blackbox_engine::{LogFormatter, LogLevel, LogSink};

struct StderrSink;

impl LogSink for StderrSink {
    fn write(&self, _level: LogLevel, formatted: &str) {
        eprintln!("{formatted}");
    }
}

pub fn install() {
    blackbox_engine::logging::set_log_sink(Arc::new(StderrSink));
}

pub fn set_log_level_code(level: u32) -> Result<(), &'static str> {
    let parsed = match level {
        0 => LogLevel::Debug,
        1 => LogLevel::Info,
        2 => LogLevel::Warn,
        3 => LogLevel::Error,
        _ => return Err("invalid log level code (expected 0=debug, 1=info, 2=warn, 3=error)"),
    };
    blackbox_engine::logging::set_log_level(parsed);
    Ok(())
}

pub fn set_log_formatter_code(format: u32) -> Result<(), &'static str> {
    let parsed = match format {
        0 => LogFormatter::Text,
        1 => LogFormatter::Structured,
        _ => return Err("invalid log formatter code (expected 0=text, 1=structured)"),
    };
    blackbox_engine::logging::set_log_formatter(parsed);
    Ok(())
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        eprintln!("[blackbox panic] {}", info);
    }));
}
