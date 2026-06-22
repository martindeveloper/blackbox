import {
  ChevronDown,
  ChevronRight,
  FileAudio,
  FileImage,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Music as MusicIcon,
  RefreshCw,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MediaCategory, MediaFileEntry } from "@/lib/mediaLibrary.js";
import { MEDIA_CATEGORIES, parseMediaCategory } from "@/lib/mediaLibrary.js";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate, useEditorSearch } from "@/lib/routeHelpers.js";
import { useMediaPreview } from "@/hooks/useMediaPreview.js";
import { formatSize } from "@/lib/format.js";
import { Icon } from "@/components/icons/Icon.js";
import { Button } from "@/components/ui/Button.js";
import { PanelHeader } from "@/components/ui/Panel.js";
import { TrashView } from "./TrashView.js";
import { TRASH_DIR as TRASH_FOLDER } from "@shared/blackboxPaths.js";

interface TreeNode {
  path: string;
  name: string;
  children: TreeNode[];
  isCategory: boolean;
  category: MediaCategory;
}

const CATEGORY_META: Record<MediaCategory, { icon: LucideIcon; labelKey: string; accent: string }> =
  {
    textures: {
      icon: ImageIcon,
      labelKey: "media.categoryLabels.textures",
      accent: "var(--editor-primary)",
    },
    music: {
      icon: MusicIcon,
      labelKey: "media.categoryLabels.music",
      accent: "var(--editor-success)",
    },
    sfx: { icon: Volume2, labelKey: "media.categoryLabels.sfx", accent: "var(--editor-warning)" },
  };

function buildTree(files: MediaFileEntry[]): TreeNode[] {
  return MEDIA_CATEGORIES.map((cat) => {
    const root: TreeNode = { path: cat, name: cat, children: [], isCategory: true, category: cat };
    const nodeMap = new Map<string, TreeNode>([[cat, root]]);

    for (const file of files) {
      if (file.category !== cat) continue;
      const parts = file.path.split("/");
      let path: string = cat;
      for (let depth = 1; depth < parts.length - 1; depth++) {
        const parentPath = path;
        path = `${path}/${parts[depth]}`;
        if (!nodeMap.has(path)) {
          const node: TreeNode = {
            path,
            name: parts[depth] ?? path,
            children: [],
            isCategory: false,
            category: cat,
          };
          nodeMap.set(path, node);
          nodeMap.get(parentPath)?.children.push(node);
        }
      }
    }

    return root;
  });
}

function groupFilesByFolder(files: MediaFileEntry[]): Map<string, MediaFileEntry[]> {
  const map = new Map<string, MediaFileEntry[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const folder = slash === -1 ? file.category : file.path.slice(0, slash);
    const list = map.get(folder);
    if (list) list.push(file);
    else map.set(folder, [file]);
  }
  return map;
}

function TreeItem({
  node,
  depth,
  selectedFolder,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedFolder: string;
  onSelect: (path: string) => void;
}) {
  const { t } = useTranslation();
  const isSelected = selectedFolder === node.path;
  const isAncestor = selectedFolder.startsWith(node.path + "/");
  const [expanded, setExpanded] = useState(() => node.isCategory || isSelected || isAncestor);
  const hasChildren = node.children.length > 0;
  const meta = CATEGORY_META[node.category];

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div>
      <div
        className={`media-tree-item${isSelected ? " media-tree-item--selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span className="media-tree-chevron">
          {hasChildren ? (
            <button
              type="button"
              className="media-tree-chevron-btn"
              onClick={toggle}
              aria-label={expanded ? t("media.collapseFolder") : t("media.expandFolder")}
            >
              <Icon icon={expanded ? ChevronDown : ChevronRight} size={10} />
            </button>
          ) : (
            <span style={{ width: 10, display: "inline-block" }} />
          )}
        </span>
        <button type="button" className="media-tree-select" onClick={() => onSelect(node.path)}>
          <Icon
            icon={node.isCategory ? meta.icon : isSelected || expanded ? FolderOpen : Folder}
            size={12}
            style={{ color: node.isCategory ? meta.accent : undefined, flexShrink: 0 }}
          />
          <span className="media-tree-label">{node.isCategory ? t(meta.labelKey) : node.name}</span>
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileThumbnail({ file, projectId }: { file: MediaFileEntry; projectId: string | null }) {
  const isImage = file.mimeType.startsWith("image/");
  const { url } = useMediaPreview(projectId, file.path, isImage);

  if (isImage && url) {
    return <img src={url} alt={file.name} className="media-card-thumb-img" />;
  }
  return (
    <Icon
      icon={isImage ? FileImage : FileAudio}
      size={28}
      style={{ color: "var(--editor-text-subtle)", opacity: 0.7 }}
    />
  );
}

function FileCard({
  file,
  selected,
  projectId,
  onClick,
}: {
  file: MediaFileEntry;
  selected: boolean;
  projectId: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`media-card${selected ? " media-card--selected" : ""}`}
      onClick={onClick}
      title={file.path}
      onDoubleClick={onClick}
    >
      <div className="media-card-thumb">
        <FileThumbnail file={file} projectId={projectId} />
      </div>
      <div className="media-card-name">{file.name}</div>
      <div className="media-card-meta">{formatSize(file.size)}</div>
    </button>
  );
}

function FolderCard({
  node,
  fileCount,
  onClick,
}: {
  node: TreeNode;
  fileCount: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button type="button" className="media-card" onClick={onClick} title={node.path}>
      <div className="media-card-thumb media-card-thumb--folder">
        <Icon icon={Folder} size={34} style={{ color: "var(--editor-warning)" }} />
      </div>
      <div className="media-card-name">{node.name}</div>
      <div className="media-card-meta">{t("media.folderItemCount", { count: fileCount })}</div>
    </button>
  );
}

export function MediaLibraryEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useEditorSearch();

  const selectedFolder = search.folder ?? search.category ?? "textures";
  const selectedPath = search.file;
  const isTrash = selectedFolder === TRASH_FOLDER;
  const category = parseMediaCategory(selectedFolder.split("/")[0]);

  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const trashItems = useScenarioStore((s) => s.trashItems);
  const projectId = useScenarioStore((s) => s.projectId);
  const importMediaFile = useScenarioStore((s) => s.importMediaFile);
  const refreshMediaLibrary = useScenarioStore((s) => s.refreshMediaLibrary);

  const tree = useMemo(() => buildTree(mediaFiles), [mediaFiles]);
  const filesByFolder = useMemo(() => groupFilesByFolder(mediaFiles), [mediaFiles]);

  const currentNode = useMemo(() => {
    if (isTrash) return null;
    const find = (nodes: TreeNode[]): TreeNode | null => {
      for (const node of nodes) {
        if (node.path === selectedFolder) return node;
        const child = find(node.children);
        if (child) return child;
      }
      return null;
    };
    return find(tree);
  }, [tree, selectedFolder, isTrash]);

  const subfolders = currentNode?.children ?? [];
  const directFiles = isTrash ? [] : (filesByFolder.get(selectedFolder) ?? []);

  const goToFolder = (folder: string) => {
    void editorNavigate(navigate, {
      to: Page.EditorMedia,
      search: { category: parseMediaCategory(folder.split("/")[0]), folder, file: null },
    });
  };

  const goToFile = (file: string) => {
    void editorNavigate(navigate, {
      to: Page.EditorMedia,
      search: { category, folder: selectedFolder, file },
    });
  };

  const handleImport = async () => {
    const path = await importMediaFile(category);
    if (path) goToFile(path);
  };

  const isEmpty = !isTrash && subfolders.length === 0 && directFiles.length === 0;

  return (
    <div className="media-browser">
      <aside className="media-tree-sidebar">
        <PanelHeader uppercase>{t("media.filesHeader")}</PanelHeader>
        <div className="media-tree-body">
          {tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedFolder={selectedFolder}
              onSelect={goToFolder}
            />
          ))}

          <div className="media-tree-separator" />
          <button
            type="button"
            className={`media-tree-item${isTrash ? " media-tree-item--selected media-tree-item--trash-active" : ""}`}
            style={{ paddingLeft: 8 }}
            onClick={() => goToFolder(TRASH_FOLDER)}
          >
            <span className="media-tree-chevron">
              <span style={{ width: 10, display: "inline-block" }} />
            </span>
            <Icon
              icon={Trash2}
              size={12}
              style={{
                color: isTrash ? "var(--editor-danger)" : "var(--editor-text-subtle)",
                flexShrink: 0,
              }}
            />
            <span className="media-tree-label">{t("media.trash")}</span>
            {trashItems.length > 0 && <span className="media-tree-badge">{trashItems.length}</span>}
          </button>
        </div>
      </aside>

      {isTrash ? (
        <TrashView />
      ) : (
        <div className="media-content">
          <div className="media-toolbar">
            <span className="media-toolbar-path">{selectedFolder.split("/").join(" / ")}</span>
            <div className="media-toolbar-actions">
              <Button size="sm" leadingIcon={Upload} onClick={() => void handleImport()}>
                {t("common.import")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={RefreshCw}
                onClick={() => void refreshMediaLibrary()}
              >
                {t("common.refresh")}
              </Button>
            </div>
          </div>

          <div className="media-grid-area">
            {isEmpty ? (
              <div className="media-empty">{t("media.emptyFolder")}</div>
            ) : (
              <div className="media-grid">
                {subfolders.map((sub) => (
                  <FolderCard
                    key={sub.path}
                    node={sub}
                    fileCount={filesByFolder.get(sub.path)?.length ?? 0}
                    onClick={() => goToFolder(sub.path)}
                  />
                ))}
                {directFiles.map((file) => (
                  <FileCard
                    key={file.path}
                    file={file}
                    selected={selectedPath === file.path}
                    projectId={projectId}
                    onClick={() => goToFile(file.path)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
