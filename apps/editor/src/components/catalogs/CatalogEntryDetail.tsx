import { ExternalLink, FolderOpen, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  getCatalogEntry,
  getCatalogFileStatus,
  mediaPathSet,
  mediaSearchForCatalogSrc,
} from "../../lib/catalogHealth.js";
import type { CatalogCategory } from "../../lib/catalogUsage.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, navigateToCatalogEntry } from "../../lib/routeHelpers.js";
import { useMediaPreview } from "../../hooks/useMediaPreview.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import type { MediaCategory } from "../../lib/mediaLibrary.js";
import type { AssetUsage } from "../../types/wire.js";
import { ObjectSelector } from "../pickers/ObjectSelector.js";
import { Button } from "../ui/Button.js";
import { Checkbox } from "../ui/Checkbox.js";
import { FieldRow } from "../ui/FieldRow.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Select } from "../ui/Select.js";
import { CatalogDeleteDialog } from "./CatalogDeleteDialog.js";
import { CatalogUsageList } from "./CatalogUsageList.js";

interface Props {
  category: CatalogCategory;
  assetKey: string;
  onDeleted?: () => void;
}

export function CatalogEntryDetail({ category, assetKey, onDeleted }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const projectId = useScenarioStore((s) => s.projectId);
  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const updateAssets = useScenarioStore((s) => s.updateAssets);
  const renameAssetEntry = useScenarioStore((s) => s.renameAssetEntry);
  const deleteAssetEntry = useScenarioStore((s) => s.deleteAssetEntry);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(assetKey.startsWith("new_"));
  const [renameValue, setRenameValue] = useState(assetKey);
  const [trackedAssetKey, setTrackedAssetKey] = useState(assetKey);

  if (trackedAssetKey !== assetKey) {
    setTrackedAssetKey(assetKey);
    setRenameValue(assetKey);
    setRenameOpen(assetKey.startsWith("new_"));
  }

  const mediaPaths = useMemo(() => mediaPathSet(mediaFiles), [mediaFiles]);
  const entry = bundle ? getCatalogEntry(bundle.assets, category, assetKey) : undefined;
  const src = entry?.src;
  const fileStatus = getCatalogFileStatus(src, mediaPaths);
  const mediaTarget = src ? mediaSearchForCatalogSrc(src) : null;
  const { url: previewUrl } = useMediaPreview(
    projectId,
    src,
    fileStatus === "found" && Boolean(src),
  );

  if (!bundle || !entry) return null;

  const openInFiles = () => {
    if (!mediaTarget) return;
    void editorNavigate(navigate, {
      to: Page.EditorMedia,
      search: {
        category: mediaTarget.category,
        folder: mediaTarget.folder,
        file: mediaTarget.file,
      },
    });
  };

  const patchSrc = (nextSrc: string) => {
    if (category === "textures") {
      updateAssets({ textures: { ...bundle.assets.textures, [assetKey]: { src: nextSrc } } });
    } else if (category === "music") {
      const current = bundle.assets.music?.[assetKey];
      if (!current) return;
      updateAssets({ music: { ...bundle.assets.music, [assetKey]: { ...current, src: nextSrc } } });
    } else {
      updateAssets({ sfx: { ...bundle.assets.sfx, [assetKey]: { src: nextSrc } } });
    }
  };

  const patchLoop = (loop: boolean) => {
    if (category !== "music") return;
    const current = bundle.assets.music?.[assetKey];
    if (!current) return;
    updateAssets({
      music: { ...bundle.assets.music, [assetKey]: { ...current, loop } },
    });
  };

  const handleRename = () => {
    const newKey = renameValue.trim();
    if (!renameAssetEntry(category, assetKey, newKey)) return;
    setRenameOpen(false);
    void navigateToCatalogEntry(navigate, category, newKey);
  };

  const patchUsage = (usage: AssetUsage | undefined) => {
    if (category === "textures") {
      updateAssets({
        textures: { ...bundle.assets.textures, [assetKey]: { ...entry, usage } },
      });
    } else if (category === "music") {
      const current = bundle.assets.music?.[assetKey];
      if (!current) return;
      updateAssets({ music: { ...bundle.assets.music, [assetKey]: { ...current, usage } } });
    } else {
      updateAssets({ sfx: { ...bundle.assets.sfx, [assetKey]: { ...entry, usage } } });
    }
  };

  return (
    <div className="catalog-detail catalog-detail--inspector">
      <header className="catalog-detail-header">
        <span className={`catalog-file-status catalog-file-status--${fileStatus}`}>
          {t(`catalog.fileStatus.${fileStatus}`)}
        </span>
        <div className="catalog-detail-header-actions">
          <Button
            variant="ghost"
            size="sm"
            icon
            leadingIcon={Pencil}
            className="catalog-detail-action"
            aria-label={t("common.rename")}
            title={t("common.rename")}
            onClick={() => {
              setRenameValue(assetKey);
              setRenameOpen(true);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            icon
            leadingIcon={Trash2}
            className="catalog-detail-action catalog-detail-action--danger"
            aria-label={t("common.delete")}
            title={t("common.delete")}
            onClick={() => setDeleteOpen(true)}
          />
        </div>
      </header>

      {renameOpen ? (
        <div className="catalog-rename">
          <FormField label={t("catalog.rename.label")} hint={t("catalog.rename.hint")}>
            <FieldRow>
              <Input
                autoFocus
                mono
                value={renameValue}
                aria-label={t("catalog.rename.label")}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleRename();
                  if (event.key === "Escape") setRenameOpen(false);
                }}
              />
              <Button size="sm" onClick={handleRename}>
                {t("common.rename")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon
                leadingIcon={X}
                title={t("common.cancel")}
                onClick={() => setRenameOpen(false)}
              />
            </FieldRow>
          </FormField>
        </div>
      ) : null}

      {deleteOpen && bundle ? (
        <CatalogDeleteDialog
          bundle={bundle}
          category={category}
          assetKey={assetKey}
          onClose={() => setDeleteOpen(false)}
          onConfirm={(replacement) => {
            deleteAssetEntry(category, assetKey, replacement);
            setDeleteOpen(false);
            onDeleted?.();
          }}
        />
      ) : null}

      <div className="catalog-detail-preview">
        {category === "textures" && previewUrl ? (
          <img src={previewUrl} alt={assetKey} className="catalog-detail-preview-img" />
        ) : category !== "textures" && previewUrl ? (
          <audio
            controls
            className="catalog-detail-preview-audio"
            src={previewUrl}
            aria-label={assetKey}
          >
            <track kind="captions" />
          </audio>
        ) : (
          <div className="catalog-detail-preview-empty">
            {fileStatus === "empty"
              ? t("catalog.previewNoSource")
              : t("catalog.previewUnavailable")}
          </div>
        )}
      </div>

      <div className="catalog-detail-fields">
        <FormField
          label={t("assets.sourcePath")}
          hint={category === "textures" ? t("assets.textureSourceHint") : undefined}
        >
          <FieldRow>
            <Input mono value={entry.src} onChange={(e) => patchSrc(e.target.value)} />
            <Button
              size="sm"
              icon
              title={t("objectSelector.browse")}
              onClick={() => setPickerOpen(true)}
            >
              <FolderOpen size={14} />
            </Button>
          </FieldRow>
        </FormField>

        {pickerOpen && (
          <ObjectSelector
            mode={{ kind: "media", categories: [category as MediaCategory] }}
            value={entry.src}
            title={t("assets.sourcePath")}
            onSelect={(v) => {
              patchSrc(v);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {category === "music" && "loop" in entry ? (
          <Checkbox
            label={t("common.loop")}
            checked={entry.loop !== false}
            onChange={(e) => patchLoop(e.target.checked)}
          />
        ) : null}

        <FormField label={t("assets.usage")} hint={t("assets.usageHint")}>
          <Select
            options={[
              { value: "internal", label: t("assets.usageInternal") },
              { value: "external", label: t("assets.usageExternal") },
            ]}
            value={entry.usage ?? "internal"}
            onChange={(e) => patchUsage(e.target.value as AssetUsage)}
          />
        </FormField>

        {mediaTarget ? (
          <Button size="sm" leadingIcon={ExternalLink} onClick={openInFiles}>
            {t("catalog.openInFiles")}
          </Button>
        ) : null}
      </div>

      <CatalogUsageList bundle={bundle} category={category} assetKey={assetKey} />
    </div>
  );
}
