import { decompress as zstdDecompress } from "fzstd";
import { getLogLevel, logger } from "./logger.js";

const BUNDLE_BASE = "/bundle/";
const BOX_HEADER_SIZE = 16;
const BOX_MAGIC = [0x42, 0x42, 0x58, 0x00] as const;

export interface BundleLoadProgress {
  received: number;
  total: number;
  phase: string;
}

export type BundleProgressCallback = (progress: BundleLoadProgress) => void;
const SHARED_PART_ID = "shared";

interface BundleMapEntry {
  offset: number;
  length: number;
  codec: string;
}

interface BundleMap {
  spec: string;
  formatVersion: number;
  platform: string;
  scenario: string;
  blob: string;
  bundleId?: string;
  dependencies?: string[];
  archiveCompression?: string;
  entries: Record<string, BundleMapEntry>;
}

interface ProjectChapterRef {
  id: string;
  title: string;
  meta: string;
  blob: string;
  dependencies: string[];
}

interface ProjectMap {
  spec: string;
  formatVersion: number;
  platform: string;
  scenario: string;
  title: string;
  revision?: string;
  shared: { meta: string; blob: string };
  chapters: ProjectChapterRef[];
}

interface LoadedBundlePart {
  map: BundleMap;
  box: ArrayBuffer;
}

export interface ProjectBundleInfo {
  title: string;
  revision?: string;
  chapters: ProjectChapterRef[];
  startChapterId: string;
}

const CODEC_MIME: Record<string, string> = {
  msgpack: "application/msgpack",
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
};

class BundleStore {
  private baseUrl = BUNDLE_BASE;
  private project: ProjectMap | null = null;
  private parts = new Map<string, LoadedBundlePart>();
  private blobUrls = new Map<string, string>();
  private loading: Promise<void> | null = null;

  get loaded(): boolean {
    return this.parts.has(SHARED_PART_ID);
  }

  get projectInfo(): ProjectBundleInfo | null {
    if (!this.project) return null;
    const startChapter = this.project.chapters[0];
    if (!startChapter) return null;
    return {
      title: this.project.title,
      revision: this.project.revision,
      chapters: this.project.chapters,
      startChapterId: startChapter.id,
    };
  }

  chapterPartIds(): string[] {
    return [...this.parts.keys()].filter((id) => id !== SHARED_PART_ID);
  }

  get meta(): Pick<BundleMap, "platform" | "scenario"> | null {
    const part = this.parts.get(SHARED_PART_ID);
    if (!part) return null;
    return { platform: part.map.platform, scenario: part.map.scenario };
  }

  get catalogBytes(): Uint8Array | null {
    return this.read("content/catalog");
  }

  get libraryBytes(): Uint8Array | null {
    return this.read("content/library");
  }

  get diagnostics(): Record<string, unknown> | null {
    const part = this.parts.get(SHARED_PART_ID);
    if (!part) return null;
    return {
      layout: "project",
      spec: part.map.spec,
      formatVersion: part.map.formatVersion,
      platform: part.map.platform,
      scenario: part.map.scenario,
      loadedChapters: this.chapterPartIds(),
      entryCount: [...this.parts.values()].reduce(
        (total, bundle) => total + Object.keys(bundle.map.entries).length,
        0,
      ),
    };
  }

  async load(baseUrl = BUNDLE_BASE, onProgress?: BundleProgressCallback): Promise<void> {
    if (this.loaded) return;
    if (!this.loading) {
      this.baseUrl = baseUrl;
      this.loading = this.fetchRoot(baseUrl, onProgress);
    }
    try {
      await this.loading;
    } catch (error) {
      this.loading = null;
      throw error;
    }
  }

  async ensureChapter(chapterId: string): Promise<void> {
    if (!this.project) return;
    if (this.parts.has(chapterId)) return;

    const chapter = this.project.chapters.find((entry) => entry.id === chapterId);
    if (!chapter) {
      throw new Error(`Unknown chapter '${chapterId}'`);
    }

    await this.loadPart(chapter.id, chapter.meta, chapter.blob);
    logger.info("bundle", `Chapter loaded: ${chapterId}`);
  }

  unloadChapter(chapterId: string): void {
    const part = this.parts.get(chapterId);
    if (!part) return;

    for (const path of Object.keys(part.map.entries)) {
      const url = this.blobUrls.get(path);
      if (url) {
        URL.revokeObjectURL(url);
        this.blobUrls.delete(path);
      }
    }

    this.parts.delete(chapterId);
    logger.info("bundle", `Chapter unloaded: ${chapterId}`);
  }

  listPaths(prefix: string): string[] {
    const paths = new Set<string>();
    for (const part of this.parts.values()) {
      for (const path of Object.keys(part.map.entries)) {
        if (path.startsWith(prefix)) paths.add(path);
      }
    }
    return [...paths].sort();
  }

  hasEntry(path: string): boolean {
    return this.findEntry(path) !== null;
  }

  read(path: string): Uint8Array | null {
    const match = this.findEntry(path);
    if (!match) {
      this.logRead(path, null, undefined, "not_found");
      return null;
    }

    const bytes = this.sliceEntry(match.part.box, match.entry);
    if (!bytes) {
      this.logRead(path, match.entry.offset, match.entry, "not_found");
      return null;
    }

    this.logRead(path, match.entry.offset, match.entry, "ok");
    return bytes;
  }

  getBlobUrl(path: string): string | null {
    const cached = this.blobUrls.get(path);
    if (cached) return cached;

    const match = this.findEntry(path);
    if (!match) return null;

    const bytes = this.sliceEntry(match.part.box, match.entry);
    if (!bytes) return null;

    this.logRead(path, match.entry.offset, match.entry, "ok");
    const mime = CODEC_MIME[match.entry.codec] ?? "application/octet-stream";
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
    this.blobUrls.set(path, url);
    return url;
  }

  private findEntry(path: string): { part: LoadedBundlePart; entry: BundleMapEntry } | null {
    for (const part of this.parts.values()) {
      const entry = part.map.entries[path];
      if (entry) return { part, entry };
    }
    return null;
  }

  private async fetchRoot(baseUrl: string, onProgress?: BundleProgressCallback): Promise<void> {
    const projectUrl = `${baseUrl}project.box.meta`;
    const projectResponse = await fetch(projectUrl);
    if (projectResponse.ok) {
      this.project = (await projectResponse.json()) as ProjectMap;
      await this.loadPart(
        SHARED_PART_ID,
        this.project.shared.meta,
        this.project.shared.blob,
        onProgress,
      );
      logger.info("bundle", "Project bundle loaded", {
        scenario: this.project.scenario,
        title: this.project.title,
        revision: this.project.revision,
        chapters: this.project.chapters.map((chapter) => chapter.id),
      });
      return;
    }

    throw new Error(`Bundle not found at ${projectUrl}`);
  }

  private async loadPart(
    id: string,
    metaName: string,
    blobName: string,
    onProgress?: BundleProgressCallback,
  ): Promise<void> {
    const metaUrl = `${this.baseUrl}${metaName}`;
    const mapResponse = await fetch(metaUrl);
    if (!mapResponse.ok) {
      throw new Error(`Failed to load bundle meta (${mapResponse.status}): ${metaUrl}`);
    }

    const map = (await mapResponse.json()) as BundleMap;
    const boxUrl = `${this.baseUrl}${map.blob || blobName}`;
    const boxResponse = await fetch(boxUrl);
    if (!boxResponse.ok) {
      throw new Error(`Failed to load bundle blob (${boxResponse.status}): ${boxUrl}`);
    }

    const rawBox = await this.streamResponse(boxResponse, id, onProgress);
    const box =
      map.archiveCompression === "zstd"
        ? toArrayBuffer(zstdDecompress(new Uint8Array(rawBox)))
        : rawBox;
    assertBoxHeader(box);
    this.parts.set(id, { map, box });
  }

  private async streamResponse(
    response: Response,
    phase: string,
    onProgress?: BundleProgressCallback,
  ): Promise<ArrayBuffer> {
    if (!onProgress || !response.body) {
      return response.arrayBuffer();
    }
    const total = Number(response.headers.get("content-length") ?? 0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress({ received, total, phase });
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged.buffer as ArrayBuffer;
  }

  private sliceEntry(box: ArrayBuffer, entry: BundleMapEntry): Uint8Array | null {
    const start = BOX_HEADER_SIZE + entry.offset;
    const end = start + entry.length;
    if (end > box.byteLength) return null;

    return new Uint8Array(box, start, entry.length);
  }

  private logRead(
    path: string,
    offset: number | null,
    entry: BundleMapEntry | undefined,
    result: "ok" | "not_found",
  ): void {
    if (getLogLevel() !== "debug") return;
    logger.debug("bundle", "Read entry", {
      path,
      offset,
      length: entry?.length,
      codec: entry?.codec,
      success: result === "ok",
      ...(result !== "ok" ? { reason: result } : {}),
    });
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertBoxHeader(box: ArrayBuffer): void {
  if (box.byteLength < BOX_HEADER_SIZE) {
    throw new Error("bundle.box is too small");
  }
  const header = new Uint8Array(box, 0, BOX_HEADER_SIZE);
  for (let i = 0; i < BOX_MAGIC.length; i += 1) {
    if (header[i] !== BOX_MAGIC[i]) {
      throw new Error("bundle.box has invalid magic header");
    }
  }
}

export const bundleStore = new BundleStore();
