use serde_json::{Map, Value};

use super::{LogFormatter, LogRecord};

pub fn format_record(formatter: LogFormatter, record: &LogRecord) -> String {
    match formatter {
        LogFormatter::Text => format_text(record),
        LogFormatter::Structured => format_structured(record),
    }
}

fn format_text(record: &LogRecord) -> String {
    let level = record.level.as_str();
    let mut line = format!(
        "{} [{}] [{}] {}",
        record.timestamp_ms, level, record.category, record.message
    );
    if let Some(fields) = &record.fields {
        append_fields_text(&mut line, fields);
    }
    line
}

fn append_fields_text(line: &mut String, value: &Value) {
    match value {
        Value::Object(map) => {
            for (key, val) in map {
                line.push(' ');
                line.push_str(key);
                line.push('=');
                line.push_str(&value_to_text(val));
            }
        }
        other => {
            line.push(' ');
            line.push_str(&value_to_text(other));
        }
    }
}

fn value_to_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn format_structured(record: &LogRecord) -> String {
    let mut object = Map::new();
    object.insert("ts_ms".to_string(), Value::from(record.timestamp_ms));
    object.insert("level".to_string(), Value::from(record.level.as_str()));
    object.insert(
        "category".to_string(),
        Value::from(record.category.as_str()),
    );
    object.insert("message".to_string(), Value::from(record.message.as_str()));
    if let Some(fields) = &record.fields {
        object.insert("data".to_string(), fields.clone());
    }
    Value::Object(object).to_string()
}
