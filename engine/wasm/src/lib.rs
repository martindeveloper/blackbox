//! Browser WASM bindings via wasm-bindgen (web only). Mobile hosts use `engine/ffi`.

mod logging;

use blackbox_engine::{
    Engine, GameView, encode_command_delta_json, encode_view_revision_mismatch_json,
    encode_view_snapshot_json,
};
use blackbox_format::{JsonFormat, decode_catalog_document, decode_msgpack_bundle_bytes};
use js_sys::{Array, Uint8Array};
use wasm_bindgen::prelude::*;

fn chapters_from_array(chapters: &Array) -> Result<Vec<Vec<u8>>, JsValue> {
    let mut buffers = Vec::with_capacity(chapters.length() as usize);
    for index in 0..chapters.length() {
        let value = chapters.get(index);
        if !value.is_instance_of::<Uint8Array>() {
            return Err(JsValue::from_str(&format!(
                "chapters[{index}] must be a Uint8Array"
            )));
        }
        buffers.push(Uint8Array::from(value).to_vec());
    }
    Ok(buffers)
}

#[wasm_bindgen]
pub struct BlackboxEngine {
    engine: Engine,
    format: JsonFormat,
    view_revision: u32,
    last_view: Option<GameView>,
}

#[wasm_bindgen]
impl BlackboxEngine {
    fn encode_debug_view(&mut self, view: GameView) -> Result<String, JsValue> {
        self.view_revision = self.view_revision.wrapping_add(1);
        let encoded = encode_view_snapshot_json(&view, self.view_revision)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.last_view = Some(view);
        Ok(encoded)
    }

    #[wasm_bindgen(constructor)]
    pub fn new(
        scenario: &[u8],
        items: &[u8],
        characters: &[u8],
        assets: &[u8],
        chapters: Array,
        library: Option<Vec<u8>>,
        random_seed_override: Option<u64>,
    ) -> Result<BlackboxEngine, JsValue> {
        let chapter_buffers = chapters_from_array(&chapters)?;
        let chapter_refs: Vec<&[u8]> = chapter_buffers.iter().map(Vec::as_slice).collect();
        let mut content = decode_msgpack_bundle_bytes(
            scenario,
            items,
            characters,
            assets,
            chapter_refs,
            library.as_deref(),
        )
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
        if let Some(seed) = random_seed_override {
            content.random_seed = Some(seed);
        }
        let engine =
            Engine::new_game(content).map_err(|error| JsValue::from_str(&error.to_string()))?;

        Ok(Self {
            engine,
            format: JsonFormat,
            view_revision: 0,
            last_view: None,
        })
    }

    #[wasm_bindgen(js_name = get_current_view)]
    pub fn get_current_view(&mut self) -> Result<String, JsValue> {
        let view = self
            .engine
            .get_current_view()
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let encoded = encode_view_snapshot_json(&view, self.view_revision)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.last_view = Some(view);
        Ok(encoded)
    }

    #[wasm_bindgen(js_name = debugGotoNode)]
    pub fn debug_goto_node(&mut self, node_id: &str) -> Result<String, JsValue> {
        let view = self
            .engine
            .debug_goto_node(node_id)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.encode_debug_view(view)
    }

    #[wasm_bindgen(js_name = debugChangeChapter)]
    pub fn debug_change_chapter(
        &mut self,
        chapter_id: &str,
        node_id: Option<String>,
    ) -> Result<String, JsValue> {
        let view = self
            .engine
            .debug_change_chapter(chapter_id, node_id.as_deref())
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.encode_debug_view(view)
    }

    #[wasm_bindgen(js_name = debugAddItem)]
    pub fn debug_add_item(&mut self, item_ref: &str, count: u32) -> Result<String, JsValue> {
        let view = self
            .engine
            .debug_add_item(item_ref, count)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.encode_debug_view(view)
    }

    #[wasm_bindgen(js_name = debugRemoveItem)]
    pub fn debug_remove_item(&mut self, item_ref: &str, count: u32) -> Result<String, JsValue> {
        let view = self
            .engine
            .debug_remove_item(item_ref, count)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.encode_debug_view(view)
    }

    #[wasm_bindgen(js_name = debugKillPlayer)]
    pub fn debug_kill_player(&mut self) -> Result<String, JsValue> {
        let view = self
            .engine
            .debug_kill_player()
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.encode_debug_view(view)
    }

    #[wasm_bindgen(js_name = submit_command)]
    pub fn submit_command(
        &mut self,
        command_json: &str,
        view_revision: u32,
    ) -> Result<String, JsValue> {
        if view_revision != self.view_revision {
            return encode_view_revision_mismatch_json(self.view_revision, view_revision)
                .map_err(|error| JsValue::from_str(&error.to_string()));
        }

        let command = self
            .format
            .decode_command(command_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let mut result = self.engine.submit_command(command);
        let base_revision = self.view_revision;
        let next_revision = if result.ok {
            self.view_revision.wrapping_add(1)
        } else {
            self.view_revision
        };
        let encoded = encode_command_delta_json(
            &result,
            self.last_view.as_ref(),
            base_revision,
            next_revision,
        );

        if result.ok {
            self.view_revision = next_revision;
            self.last_view = result.view.take();
        }

        encoded.map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = loadCatalog)]
    pub fn load_catalog(&mut self, catalog: &[u8]) -> Result<(), JsValue> {
        let meta = decode_catalog_document(catalog)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.engine.load_catalog(meta);
        Ok(())
    }

    #[wasm_bindgen(js_name = loadLibrary)]
    pub fn load_library(&mut self, library: &[u8]) -> Result<(), JsValue> {
        blackbox_format::decode_library_document(library)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.engine.load_library_source(library.to_vec());
        Ok(())
    }

    #[wasm_bindgen(js_name = loadChapter)]
    pub fn load_chapter(&mut self, chapter: &[u8]) -> Result<(), JsValue> {
        use blackbox_format::MsgpackFormat;
        let format = MsgpackFormat;
        self.engine
            .merge_chapter(chapter, &format)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = unloadChapter)]
    pub fn unload_chapter(&mut self, chapter_id: &str) -> Result<(), JsValue> {
        self.engine
            .unload_chapter(chapter_id)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = serialize_state)]
    pub fn serialize_state(&self) -> Result<String, JsValue> {
        self.format
            .encode_state_utf8(self.engine.get_state())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = restore_state)]
    pub fn restore_state(&mut self, state_json: &str) -> Result<String, JsValue> {
        let state = self
            .format
            .decode_state_utf8(state_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let view = self
            .engine
            .restore_state(state)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.view_revision = self.view_revision.wrapping_add(1);
        let encoded = encode_view_snapshot_json(&view, self.view_revision)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.last_view = Some(view);
        Ok(encoded)
    }
}

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    logging::install();
}

#[wasm_bindgen(js_name = setWasmLogLevel)]
pub fn set_wasm_log_level(level: &str) -> Result<(), JsValue> {
    logging::set_log_level_name(level).map_err(|message| JsValue::from_str(&message))
}

#[wasm_bindgen(js_name = setWasmLogFormatter)]
pub fn set_wasm_log_formatter(format: &str) -> Result<(), JsValue> {
    logging::set_log_formatter_name(format).map_err(|message| JsValue::from_str(&message))
}
