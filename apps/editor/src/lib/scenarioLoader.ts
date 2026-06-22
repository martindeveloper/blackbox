import type {
  AssetCatalog,
  Chapter,
  CharacterCatalog,
  EditorLayout,
  GameContent,
  ItemCatalog,
  LibraryDocument,
  MetaCatalog,
} from "@/types/wire.js";

export interface LoadedBundle {
  scenarioName: string;
  scenarioDir: string;
  folderName: string;
  scenario: GameContent;
  chapters: Record<string, Chapter>;
  chapterFiles: Record<string, string>;
  items: ItemCatalog;
  characters: CharacterCatalog;
  assets: AssetCatalog;
  meta: MetaCatalog | null;
  library: LibraryDocument | null;
  layout: EditorLayout;
  filePaths: {
    scenario: string;
    items: string;
    characters: string;
    assets: string;
    meta: string | null;
    library: string | null;
    chapters: Record<string, string>;
    layout: string;
  };
}
