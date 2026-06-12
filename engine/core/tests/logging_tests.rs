use std::sync::Mutex;

use blackbox::logging::{
    self, LogFormatter, LogLevel, debug, get_log_formatter, get_log_level, set_log_formatter,
    set_log_level, set_test_capture, test_capture_lines,
};

static LOGGING_TEST_LOCK: Mutex<()> = Mutex::new(());

fn reset_logging_defaults() {
    set_log_level(LogLevel::Info);
    set_log_formatter(LogFormatter::Text);
    set_test_capture(None);
}

#[test]
fn log_level_filters_debug_messages() {
    let _guard = LOGGING_TEST_LOCK.lock().expect("logging test lock");
    set_log_level(LogLevel::Info);
    set_test_capture(Some(16));

    debug("test", "hidden debug");
    logging::info("test", "visible info");

    let lines = test_capture_lines();
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("visible info"));
    assert!(!lines[0].contains("hidden debug"));

    reset_logging_defaults();
}

#[test]
fn structured_formatter_emits_json() {
    let _guard = LOGGING_TEST_LOCK.lock().expect("logging test lock");
    set_log_level(LogLevel::Debug);
    set_log_formatter(LogFormatter::Structured);
    set_test_capture(Some(4));

    logging::info("test", "structured event");

    let lines = test_capture_lines();
    assert_eq!(lines.len(), 1);
    let parsed: serde_json::Value = serde_json::from_str(&lines[0]).expect("json line");
    assert_eq!(parsed["level"], "info");
    assert_eq!(parsed["category"], "test");
    assert_eq!(parsed["message"], "structured event");
    assert!(parsed.get("ts_ms").is_some());

    reset_logging_defaults();
}

#[test]
fn runtime_level_and_formatter_can_be_changed() {
    let _guard = LOGGING_TEST_LOCK.lock().expect("logging test lock");
    set_test_capture(Some(4));

    set_log_level(LogLevel::Warn);
    assert_eq!(get_log_level(), LogLevel::Warn);
    let lines = test_capture_lines();
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("Core log level changed"));
    assert!(lines[0].contains("current=warn"));

    set_log_formatter(LogFormatter::Structured);
    assert_eq!(get_log_formatter(), LogFormatter::Structured);

    reset_logging_defaults();
}

#[test]
fn log_level_parse_accepts_web_client_names() {
    assert_eq!(LogLevel::parse("debug"), Some(LogLevel::Debug));
    assert_eq!(LogLevel::parse("INFO"), Some(LogLevel::Info));
    assert_eq!(LogLevel::parse("warn"), Some(LogLevel::Warn));
    assert_eq!(LogLevel::parse("error"), Some(LogLevel::Error));
    assert_eq!(LogLevel::parse("trace"), None);
}
