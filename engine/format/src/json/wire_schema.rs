use blackbox_engine::EngineError;

pub const SCENARIO_SPEC: &str = "com.blackbox.scenario";
pub const CHAPTER_SPEC: &str = "com.blackbox.chapter";
pub const ASSETS_BUNDLE_SPEC: &str = "com.blackbox.assets.bundle";
pub const ITEMS_SPEC: &str = "com.blackbox.items";
pub const CHARACTERS_SPEC: &str = "com.blackbox.characters";
pub const CATALOG_SPEC: &str = "com.blackbox.catalog";
pub const LIBRARY_SPEC: &str = "com.blackbox.library";
pub const SUPPORTED_FORMAT_VERSION: u32 = 1;

pub fn validate_document_envelope(
    document: &str,
    spec: &str,
    expected_spec: &str,
    format_version: u32,
) -> Result<(), EngineError> {
    if spec != expected_spec {
        return Err(EngineError::ValidationError(format!(
            "{document} has spec '{spec}', expected '{expected_spec}'"
        )));
    }

    if format_version != SUPPORTED_FORMAT_VERSION {
        return Err(EngineError::ValidationError(format!(
            "{document} has formatVersion {format_version}, only formatVersion {SUPPORTED_FORMAT_VERSION} is supported"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_rejects_unknown_spec() {
        let error = validate_document_envelope("items", "wrong", ITEMS_SPEC, 1).unwrap_err();
        assert!(matches!(error, EngineError::ValidationError(_)));
    }

    #[test]
    fn validate_rejects_unsupported_version() {
        let error = validate_document_envelope("assets", ASSETS_BUNDLE_SPEC, ASSETS_BUNDLE_SPEC, 2)
            .unwrap_err();
        assert!(matches!(error, EngineError::ValidationError(_)));
    }
}
