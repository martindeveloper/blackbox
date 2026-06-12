import {
  CATALOG_SPEC,
  LIBRARY_SPEC,
  SUPPORTED_FORMAT_VERSION,
  type LibraryDocument,
  type MetaCatalog,
} from "../types/wire.js";
import type { LoadedBundle } from "./scenarioLoader.js";

export function createMetaCatalogSidecar(
  bundle: LoadedBundle,
  fileName = "catalog.json",
): MetaCatalog {
  const meta: MetaCatalog = {
    spec: CATALOG_SPEC,
    formatVersion: SUPPORTED_FORMAT_VERSION,
    events: {},
    flags: {},
  };
  bundle.meta = meta;
  bundle.filePaths.meta = fileName;
  bundle.scenario.catalogRef = fileName;
  return meta;
}

export function createLibrarySidecar(
  bundle: LoadedBundle,
  fileName = "library.json",
): LibraryDocument {
  const library: LibraryDocument = {
    spec: LIBRARY_SPEC,
    formatVersion: SUPPORTED_FORMAT_VERSION,
    snippets: {},
    templates: {},
    conditions: {},
  };
  bundle.library = library;
  bundle.filePaths.library = fileName;
  bundle.scenario.libraryRef = fileName;
  return library;
}
