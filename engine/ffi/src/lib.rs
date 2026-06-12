//! Stable C ABI for native mobile hosts (iOS, Android).
//!
//! The web client uses wasm-bindgen (`engine/wasm` → `.cache/wasm/clients-web/`).
//!
//! Reference hosts:
//! - `apps/ios/Blackbox/Sources/BlackboxEngine.swift`
//! - `apps/android/blackbox/src/main/kotlin/com/blackbox/engine/BlackboxEngine.kt`

mod ffi;
mod logging;

pub use ffi::ByteSlice;
pub use ffi::{
    bb_alloc, bb_engine_free, bb_engine_new, bb_free, bb_get_view, bb_init, bb_last_error,
    bb_load_catalog, bb_load_chapter, bb_load_library, bb_restore, bb_serialize,
    bb_set_log_formatter, bb_set_log_level, bb_submit, bb_unload_chapter,
};
