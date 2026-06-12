use std::sync::Arc;

use blackbox_engine::{LogFormatter, LogLevel, LogSink};
use js_sys::{Function, Reflect};
use wasm_bindgen::{JsCast, JsValue};
use web_sys::console;

struct ConsoleSink;

impl LogSink for ConsoleSink {
    fn write(&self, level: LogLevel, formatted: &str) {
        let value = JsValue::from_str(formatted);
        if forward_to_support_log(level, &value) {
            return;
        }
        match level {
            LogLevel::Debug => console::debug_1(&value),
            LogLevel::Info => console::info_1(&value),
            LogLevel::Warn => console::warn_1(&value),
            LogLevel::Error => console::error_1(&value),
        }
    }
}

fn forward_to_support_log(level: LogLevel, formatted: &JsValue) -> bool {
    let global = js_sys::global();
    let Ok(callback) = Reflect::get(&global, &JsValue::from_str("__blackboxCaptureEngineLog"))
    else {
        return false;
    };
    let Some(callback) = callback.dyn_ref::<Function>() else {
        return false;
    };

    callback
        .call2(
            &JsValue::UNDEFINED,
            &JsValue::from_str(level.as_str()),
            formatted,
        )
        .is_ok()
}

pub fn install() {
    blackbox_engine::logging::set_log_sink(Arc::new(ConsoleSink));
}

pub fn set_log_level_name(level: &str) -> Result<(), String> {
    let parsed = match level {
        "debug" => LogLevel::Debug,
        "info" => LogLevel::Info,
        "warn" => LogLevel::Warn,
        "error" => LogLevel::Error,
        _ => {
            return Err(format!(
                "invalid log level '{level}' (expected debug, info, warn, or error)"
            ));
        }
    };
    blackbox_engine::logging::set_log_level(parsed);
    Ok(())
}

pub fn set_log_formatter_name(format: &str) -> Result<(), String> {
    let parsed = match format {
        "text" => LogFormatter::Text,
        "structured" => LogFormatter::Structured,
        _ => return Err("invalid log formatter (expected text or structured)".to_string()),
    };
    blackbox_engine::logging::set_log_formatter(parsed);
    Ok(())
}
