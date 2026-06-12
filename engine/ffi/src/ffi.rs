use std::alloc::{Layout, alloc, dealloc};
use std::ptr;
use std::sync::Mutex;

use blackbox_engine::{
    Engine, GameView, PlayerCommand, encode_command_delta_json, encode_view_revision_mismatch_json,
    encode_view_snapshot_json,
};
use blackbox_format::{
    JsonFormat, MsgpackFormat, decode_catalog_document, decode_library_document,
    decode_msgpack_bundle_bytes,
};

use crate::logging;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct ByteSlice {
    pub ptr: usize,
    pub len: u32,
}

struct EngineSlot {
    engine: Engine,
    format: JsonFormat,
    view_revision: u32,
    last_view: Option<GameView>,
}

static ENGINES: Mutex<Vec<Option<EngineSlot>>> = Mutex::new(Vec::new());
static LAST_ERROR: Mutex<String> = Mutex::new(String::new());

fn set_last_error(message: impl Into<String>) {
    if let Ok(mut slot) = LAST_ERROR.lock() {
        *slot = message.into();
    }
}

fn clear_last_error() {
    if let Ok(mut slot) = LAST_ERROR.lock() {
        slot.clear();
    }
}

fn write_output(out_ptr: usize, out_cap: u32, bytes: &[u8]) -> i32 {
    let needed = bytes.len();
    if needed > out_cap as usize {
        return -(needed as i32);
    }
    if needed > 0 && out_ptr == 0 {
        return 0;
    }
    if needed > 0 {
        // SAFETY: The caller supplied a non-null output buffer with at least `needed` bytes.
        unsafe {
            ptr::copy_nonoverlapping(bytes.as_ptr(), out_ptr as *mut u8, needed);
        }
    }
    needed as i32
}

fn read_slice(ptr: usize, len: u32) -> Result<&'static [u8], String> {
    if len == 0 {
        return Ok(&[]);
    }
    if ptr == 0 {
        return Err("null input pointer".to_string());
    }
    // SAFETY: The caller guarantees that `ptr` references `len` readable bytes for this call.
    Ok(unsafe { std::slice::from_raw_parts(ptr as *const u8, len as usize) })
}

fn with_engine<F, T>(handle: u32, f: F) -> Result<T, String>
where
    F: FnOnce(&mut EngineSlot) -> Result<T, String>,
{
    if handle == 0 {
        return Err("invalid engine handle".to_string());
    }
    let mut engines = ENGINES
        .lock()
        .map_err(|_| "engine registry poisoned".to_string())?;
    let index = handle as usize - 1;
    let slot = engines
        .get_mut(index)
        .and_then(|entry| entry.as_mut())
        .ok_or_else(|| format!("unknown engine handle {handle}"))?;
    f(slot)
}

fn utf8_command(bytes: &[u8]) -> Result<PlayerCommand, String> {
    let json = std::str::from_utf8(bytes).map_err(|error| error.to_string())?;
    JsonFormat
        .decode_command(json)
        .map_err(|error| error.to_string())
}

fn read_chapters(chapters_ptr: usize, chapter_count: u32) -> Result<Vec<&'static [u8]>, String> {
    if chapter_count == 0 {
        return Ok(Vec::new());
    }
    if chapters_ptr == 0 {
        return Err("null chapters pointer".to_string());
    }

    // SAFETY: The caller provides a table with `chapter_count` valid `ByteSlice` entries and
    // keeps the table and each referenced byte buffer alive for this call.
    let table = unsafe {
        std::slice::from_raw_parts(chapters_ptr as *const ByteSlice, chapter_count as usize)
    };
    table
        .iter()
        .enumerate()
        .map(|(index, entry)| {
            read_slice(entry.ptr, entry.len).map_err(|error| format!("chapters[{index}]: {error}"))
        })
        .collect()
}

fn encode_view_snapshot(slot: &mut EngineSlot) -> Result<Vec<u8>, String> {
    let view = slot
        .engine
        .get_current_view()
        .map_err(|error| error.to_string())?;
    let encoded = encode_view_snapshot_json(&view, slot.view_revision)
        .map_err(|error| error.to_string())
        .map(String::into_bytes)?;
    slot.last_view = Some(view);
    Ok(encoded)
}

fn finish_status(result: Result<(), String>) -> i32 {
    match result {
        Ok(()) => 1,
        Err(error) => {
            set_last_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_init() {
    logging::install_panic_hook();
    logging::install();
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_alloc(len: u32) -> usize {
    if len == 0 {
        return 0;
    }
    let Ok(layout) = Layout::from_size_align(len as usize, 1) else {
        return 0;
    };
    unsafe {
        let ptr = alloc(layout);
        if ptr.is_null() { 0 } else { ptr as usize }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_free(ptr: usize, len: u32) {
    if ptr == 0 || len == 0 {
        return;
    }
    let Ok(layout) = Layout::from_size_align(len as usize, 1) else {
        return;
    };
    unsafe {
        dealloc(ptr as *mut u8, layout);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_engine_new(
    scenario_ptr: usize,
    scenario_len: u32,
    items_ptr: usize,
    items_len: u32,
    characters_ptr: usize,
    characters_len: u32,
    assets_ptr: usize,
    assets_len: u32,
    chapters_ptr: usize,
    chapter_count: u32,
    library_ptr: usize,
    library_len: u32,
    has_random_seed_override: bool,
    random_seed_override: u64,
) -> u32 {
    clear_last_error();

    let result = (|| -> Result<u32, String> {
        let scenario = read_slice(scenario_ptr, scenario_len)?;
        let items = read_slice(items_ptr, items_len)?;
        let characters = read_slice(characters_ptr, characters_len)?;
        let assets = read_slice(assets_ptr, assets_len)?;

        let chapters = read_chapters(chapters_ptr, chapter_count)?;
        let library = if library_len == 0 {
            None
        } else {
            Some(read_slice(library_ptr, library_len)?)
        };
        let mut content =
            decode_msgpack_bundle_bytes(scenario, items, characters, assets, chapters, library)
                .map_err(|error| error.to_string())?;
        if has_random_seed_override {
            content.random_seed = Some(random_seed_override);
        }
        let engine = Engine::new_game(content).map_err(|error| error.to_string())?;

        let mut engines = ENGINES
            .lock()
            .map_err(|_| "engine registry poisoned".to_string())?;

        for (index, slot) in engines.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(EngineSlot {
                    engine,
                    format: JsonFormat,
                    view_revision: 0,
                    last_view: None,
                });
                return Ok((index + 1) as u32);
            }
        }

        engines.push(Some(EngineSlot {
            engine,
            format: JsonFormat,
            view_revision: 0,
            last_view: None,
        }));
        Ok(engines.len() as u32)
    })();

    match result {
        Ok(handle) => handle,
        Err(error) => {
            set_last_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_engine_free(handle: u32) {
    if handle == 0 {
        return;
    }
    if let Ok(mut engines) = ENGINES.lock() {
        let index = handle as usize - 1;
        if let Some(slot) = engines.get_mut(index) {
            *slot = None;
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_get_view(handle: u32, out_ptr: usize, out_cap: u32) -> i32 {
    clear_last_error();
    match with_engine(handle, encode_view_snapshot) {
        Ok(bytes) => write_output(out_ptr, out_cap, &bytes),
        Err(error) => {
            set_last_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_submit(
    handle: u32,
    in_ptr: usize,
    in_len: u32,
    view_revision: u32,
    out_ptr: usize,
    out_cap: u32,
) -> i32 {
    clear_last_error();
    let input = match read_slice(in_ptr, in_len) {
        Ok(bytes) => bytes,
        Err(error) => {
            set_last_error(error);
            return 0;
        }
    };

    match with_engine(handle, |slot| {
        if view_revision != slot.view_revision {
            return encode_view_revision_mismatch_json(slot.view_revision, view_revision)
                .map(String::into_bytes)
                .map_err(|error| error.to_string());
        }

        let command = utf8_command(input)?;
        let mut result = slot.engine.submit_command(command);
        let base_revision = slot.view_revision;
        let next_revision = if result.ok {
            slot.view_revision.wrapping_add(1)
        } else {
            slot.view_revision
        };
        let encoded = encode_command_delta_json(
            &result,
            slot.last_view.as_ref(),
            base_revision,
            next_revision,
        )
        .map(String::into_bytes)
        .map_err(|error| error.to_string())?;

        if result.ok {
            slot.view_revision = next_revision;
            slot.last_view = result.view.take();
        }

        Ok(encoded)
    }) {
        Ok(bytes) => write_output(out_ptr, out_cap, &bytes),
        Err(error) => {
            set_last_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_serialize(handle: u32, out_ptr: usize, out_cap: u32) -> i32 {
    clear_last_error();
    match with_engine(handle, |slot| {
        slot.format
            .encode_state_utf8(slot.engine.get_state())
            .map_err(|error| error.to_string())
            .map(|json| json.into_bytes())
    }) {
        Ok(bytes) => write_output(out_ptr, out_cap, &bytes),
        Err(error) => {
            set_last_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_restore(
    handle: u32,
    in_ptr: usize,
    in_len: u32,
    out_ptr: usize,
    out_cap: u32,
) -> i32 {
    clear_last_error();
    let input = match read_slice(in_ptr, in_len) {
        Ok(bytes) => bytes,
        Err(error) => {
            set_last_error(error);
            return 0;
        }
    };

    match with_engine(handle, |slot| {
        let json = std::str::from_utf8(input).map_err(|error| error.to_string())?;
        let state = slot
            .format
            .decode_state_utf8(json)
            .map_err(|error| error.to_string())?;
        let view = slot
            .engine
            .restore_state(state)
            .map_err(|error| error.to_string())?;
        slot.view_revision = slot.view_revision.wrapping_add(1);
        let encoded = encode_view_snapshot_json(&view, slot.view_revision)
            .map(String::into_bytes)
            .map_err(|error| error.to_string())?;
        slot.last_view = Some(view);
        Ok(encoded)
    }) {
        Ok(bytes) => write_output(out_ptr, out_cap, &bytes),
        Err(error) => {
            set_last_error(error);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_load_catalog(handle: u32, in_ptr: usize, in_len: u32) -> i32 {
    clear_last_error();
    let result = (|| {
        let input = read_slice(in_ptr, in_len)?;
        let catalog = decode_catalog_document(input).map_err(|error| error.to_string())?;
        with_engine(handle, |slot| {
            slot.engine.load_catalog(catalog);
            Ok(())
        })
    })();
    finish_status(result)
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_load_library(handle: u32, in_ptr: usize, in_len: u32) -> i32 {
    clear_last_error();
    let result = (|| {
        let input = read_slice(in_ptr, in_len)?;
        decode_library_document(input).map_err(|error| error.to_string())?;
        with_engine(handle, |slot| {
            slot.engine.load_library_source(input.to_vec());
            Ok(())
        })
    })();
    finish_status(result)
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_load_chapter(handle: u32, in_ptr: usize, in_len: u32) -> i32 {
    clear_last_error();
    let result = (|| {
        let input = read_slice(in_ptr, in_len)?;
        with_engine(handle, |slot| {
            slot.engine
                .merge_chapter(input, &MsgpackFormat)
                .map_err(|error| error.to_string())
        })
    })();
    finish_status(result)
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_unload_chapter(handle: u32, in_ptr: usize, in_len: u32) -> i32 {
    clear_last_error();
    let result = (|| {
        let input = read_slice(in_ptr, in_len)?;
        let chapter_id = std::str::from_utf8(input).map_err(|error| error.to_string())?;
        with_engine(handle, |slot| {
            slot.engine
                .unload_chapter(chapter_id)
                .map_err(|error| error.to_string())
        })
    })();
    finish_status(result)
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_last_error(out_ptr: usize, out_cap: u32) -> i32 {
    let Ok(mut message) = LAST_ERROR.lock() else {
        return 0;
    };
    let written = write_output(out_ptr, out_cap, message.as_bytes());
    if written >= 0 {
        message.clear();
    }
    written
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_set_log_level(level: u32) -> i32 {
    match logging::set_log_level_code(level) {
        Ok(()) => 1,
        Err(message) => {
            set_last_error(message);
            0
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bb_set_log_formatter(format: u32) -> i32 {
    match logging::set_log_formatter_code(format) {
        Ok(()) => 1,
        Err(message) => {
            set_last_error(message);
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use blackbox_format::{
        encode_assets_document, encode_catalog_document, encode_chapter_document,
        encode_characters_document, encode_items_document, encode_library_document,
        encode_scenario_document,
    };

    use super::*;

    const SCENARIO: &[u8] = br#"{
        "spec": "com.blackbox.scenario",
        "formatVersion": 1,
        "title": "FFI Test",
        "defaultStats": { "hp": 10, "max_hp": 10 },
        "chapters": [
            { "id": "one", "title": "One", "ref": "one.json" },
            { "id": "two", "title": "Two", "ref": "two.json" }
        ]
    }"#;
    const ITEMS: &[u8] = br#"{ "spec": "com.blackbox.items", "formatVersion": 1, "items": {} }"#;
    const CHARACTERS: &[u8] =
        br#"{ "spec": "com.blackbox.characters", "formatVersion": 1, "characters": {} }"#;
    const ASSETS: &[u8] = br#"{
        "spec": "com.blackbox.assets.bundle",
        "formatVersion": 1,
        "music": {},
        "sfx": {},
        "textures": {}
    }"#;
    const CHAPTER_ONE: &[u8] = br#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "one",
        "title": "One",
        "startNodeId": "start",
        "nodes": {
            "start": {
                "id": "start",
                "text": [{ "kind": "paragraph", "text": "Ready." }],
                "choices": [{
                    "id": "hurt",
                    "label": "Touch the panel.",
                    "effects": [{ "type": "modifyStat", "stat": "hp", "amount": -1 }],
                    "goto": "start"
                }]
            }
        }
    }"#;
    const CHAPTER_TWO: &[u8] = br#"{
        "spec": "com.blackbox.chapter",
        "formatVersion": 1,
        "id": "two",
        "title": "Two",
        "startNodeId": "two_start",
        "nodes": {
            "two_start": {
                "id": "two_start",
                "mode": "ending",
                "text": ["@greeting"],
                "choices": []
            }
        }
    }"#;
    const LIBRARY: &[u8] = br#"{
        "spec": "com.blackbox.library",
        "formatVersion": 1,
        "snippets": {
            "greeting": { "kind": "paragraph", "text": "Loaded later." }
        },
        "templates": {}
    }"#;
    const CATALOG: &[u8] = br#"{
        "spec": "com.blackbox.catalog",
        "formatVersion": 1,
        "events": {},
        "flags": {}
    }"#;

    struct TestDocuments {
        scenario: Vec<u8>,
        items: Vec<u8>,
        characters: Vec<u8>,
        assets: Vec<u8>,
        chapter_one: Vec<u8>,
        chapter_two: Vec<u8>,
        library: Vec<u8>,
        catalog: Vec<u8>,
    }

    impl TestDocuments {
        fn encode() -> Self {
            Self {
                scenario: encode_scenario_document(SCENARIO).unwrap(),
                items: encode_items_document(ITEMS).unwrap(),
                characters: encode_characters_document(CHARACTERS).unwrap(),
                assets: encode_assets_document(ASSETS).unwrap(),
                chapter_one: encode_chapter_document(CHAPTER_ONE).unwrap(),
                chapter_two: encode_chapter_document(CHAPTER_TWO).unwrap(),
                library: encode_library_document(LIBRARY).unwrap(),
                catalog: encode_catalog_document(CATALOG).unwrap(),
            }
        }

        fn create_engine(&self, include_library: bool, seed: Option<u64>) -> u32 {
            let chapters = [byte_slice(&self.chapter_one)];
            let library = if include_library {
                self.library.as_slice()
            } else {
                &[]
            };
            bb_engine_new(
                self.scenario.as_ptr() as usize,
                self.scenario.len() as u32,
                self.items.as_ptr() as usize,
                self.items.len() as u32,
                self.characters.as_ptr() as usize,
                self.characters.len() as u32,
                self.assets.as_ptr() as usize,
                self.assets.len() as u32,
                chapters.as_ptr() as usize,
                chapters.len() as u32,
                library.as_ptr() as usize,
                library.len() as u32,
                seed.is_some(),
                seed.unwrap_or_default(),
            )
        }
    }

    fn byte_slice(bytes: &[u8]) -> ByteSlice {
        ByteSlice {
            ptr: bytes.as_ptr() as usize,
            len: bytes.len() as u32,
        }
    }

    fn call_output(call: impl FnOnce(usize, u32) -> i32) -> String {
        let mut output = vec![0u8; 64 * 1024];
        let written = call(output.as_mut_ptr() as usize, output.len() as u32);
        let last_error = LAST_ERROR
            .lock()
            .map(|message| message.clone())
            .unwrap_or_default();
        assert!(written > 0, "FFI call failed: {last_error}");
        String::from_utf8(output[..written as usize].to_vec()).unwrap()
    }

    #[test]
    fn constructor_applies_library_and_random_seed_override() {
        let docs = TestDocuments::encode();
        let handle = docs.create_engine(true, Some(42));
        assert_ne!(handle, 0, "engine creation failed");

        let state: Value =
            serde_json::from_str(&call_output(|ptr, cap| bb_serialize(handle, ptr, cap))).unwrap();
        bb_engine_free(handle);

        assert_eq!(state["randomSeed"], 42);
    }

    #[test]
    fn revisioned_commands_and_restore_match_wasm_protocol() {
        let docs = TestDocuments::encode();
        let handle = docs.create_engine(false, None);
        assert_ne!(handle, 0, "engine creation failed");

        let initial: Value =
            serde_json::from_str(&call_output(|ptr, cap| bb_get_view(handle, ptr, cap))).unwrap();
        let saved = call_output(|ptr, cap| bb_serialize(handle, ptr, cap));
        let command = br#"{ "type": "choose", "choice_id": "hurt" }"#;
        let delta: Value = serde_json::from_str(&call_output(|ptr, cap| {
            bb_submit(
                handle,
                command.as_ptr() as usize,
                command.len() as u32,
                0,
                ptr,
                cap,
            )
        }))
        .unwrap();
        let stale: Value = serde_json::from_str(&call_output(|ptr, cap| {
            bb_submit(
                handle,
                command.as_ptr() as usize,
                command.len() as u32,
                0,
                ptr,
                cap,
            )
        }))
        .unwrap();
        let restored: Value = serde_json::from_str(&call_output(|ptr, cap| {
            bb_restore(
                handle,
                saved.as_ptr() as usize,
                saved.len() as u32,
                ptr,
                cap,
            )
        }))
        .unwrap();
        bb_engine_free(handle);

        assert_eq!(initial["revision"], 0);
        assert_eq!(delta["revision"], 1);
        assert_eq!(delta["delta"]["player_stats"]["hp"], 9);
        assert_eq!(stale["error"]["type"], "viewRevisionMismatch");
        assert_eq!(restored["revision"], 2);
        assert_eq!(restored["view"]["player_stats"]["hp"], 10);
    }

    #[test]
    fn streaming_content_methods_match_wasm_surface() {
        let docs = TestDocuments::encode();
        let handle = docs.create_engine(false, None);
        assert_ne!(handle, 0, "engine creation failed");

        assert_eq!(
            bb_load_catalog(
                handle,
                docs.catalog.as_ptr() as usize,
                docs.catalog.len() as u32
            ),
            1
        );
        assert_eq!(
            bb_load_library(
                handle,
                docs.library.as_ptr() as usize,
                docs.library.len() as u32
            ),
            1
        );
        assert_eq!(
            bb_load_chapter(
                handle,
                docs.chapter_two.as_ptr() as usize,
                docs.chapter_two.len() as u32
            ),
            1
        );
        assert_eq!(
            bb_unload_chapter(handle, "two".as_ptr() as usize, "two".len() as u32),
            1
        );
        bb_engine_free(handle);
    }

    #[test]
    fn last_error_survives_output_buffer_resize_retry() {
        set_last_error("buffer resize test");
        let mut small = [0u8; 4];
        let needed = bb_last_error(small.as_mut_ptr() as usize, small.len() as u32);
        assert_eq!(needed, -("buffer resize test".len() as i32));

        let message = call_output(|ptr, cap| bb_last_error(ptr, cap));
        assert_eq!(message, "buffer resize test");
    }
}
