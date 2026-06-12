import { Trash2, X, ZoomIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { findCatalogKeysBySrc } from "../../lib/catalogHealth.js";
import { formatSize } from "../../lib/format.js";
import { mediaCategoryFromPath } from "../../lib/mediaLibrary.js";
import { useMediaPreview } from "../../hooks/useMediaPreview.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { navigateToCatalogEntry } from "../../lib/routeHelpers.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../icons/Icon.js";

interface Props {
  selectedPath: string | null;
  onDeleted: () => void;
}

interface ImageDimensions {
  width: number;
  height: number;
}

type InspectorView = {
  path: string | null;
  dimensions: ImageDimensions | null;
  showLightbox: boolean;
};

function Lightbox({
  src,
  path,
  size: fileSize,
  dimensions,
  onClose,
}: {
  src: string;
  path: string;
  size: number;
  dimensions: ImageDimensions | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filename = path.split("/").pop() ?? path;

  return (
    <div className="media-lightbox">
      <button
        type="button"
        className="media-lightbox-close"
        onClick={onClose}
        title={t("media.closeLightboxEsc")}
      >
        <Icon icon={X} size={16} />
      </button>

      <img src={src} alt={filename} className="media-lightbox-img" />

      <div className="media-lightbox-info">
        <div className="media-lightbox-filename">{filename}</div>
        {dimensions && (
          <div>
            {t("media.dimensionsPx", {
              width: dimensions.width,
              height: dimensions.height,
            })}
          </div>
        )}
        <div>{formatSize(fileSize)}</div>
        <div className="media-lightbox-path">{path}</div>
      </div>
    </div>
  );
}

export function MediaInspector({ selectedPath, onDeleted }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projectId = useScenarioStore((s) => s.projectId);
  const bundle = useScenarioStore((s) => s.bundle);
  const mediaFiles = useScenarioStore((s) => s.mediaFiles);
  const deleteMediaFile = useScenarioStore((s) => s.deleteMediaFile);

  const [view, setView] = useState<InspectorView>({
    path: selectedPath,
    dimensions: null,
    showLightbox: false,
  });

  if (selectedPath !== view.path) {
    setView({ path: selectedPath, dimensions: null, showLightbox: false });
  }

  const fileEntry = selectedPath ? mediaFiles.find((f) => f.path === selectedPath) : null;
  const { url: previewUrl, failed: loadFailed } = useMediaPreview(projectId, selectedPath, true);

  if (!selectedPath) {
    return <p className="text-[11px] text-muted">{t("media.selectFile")}</p>;
  }

  const category = mediaCategoryFromPath(selectedPath);
  const isImage = category === "textures";
  const isAudio = category === "music" || category === "sfx";
  const refs = bundle ? findCatalogKeysBySrc(bundle.assets, selectedPath) : [];

  const handleDelete = async () => {
    const moved = await deleteMediaFile(selectedPath);
    if (moved) onDeleted();
  };

  return (
    <div className="media-inspector">
      {loadFailed ? (
        <p className="text-[11px] text-danger mb-2">{t("media.previewFailed")}</p>
      ) : isImage && previewUrl ? (
        <div className="media-preview-wrap">
          <img
            src={previewUrl}
            alt={selectedPath}
            className="media-preview-img"
            onLoad={(e) => {
              const img = e.currentTarget;
              setView((current) => ({
                ...current,
                dimensions: { width: img.naturalWidth, height: img.naturalHeight },
              }));
            }}
          />
          <button
            type="button"
            className="media-zoom-btn"
            onClick={() => setView((current) => ({ ...current, showLightbox: true }))}
            title={t("media.viewFullSize")}
          >
            <Icon icon={ZoomIn} size={13} />
          </button>
        </div>
      ) : isAudio && previewUrl ? (
        <audio controls className="w-full mb-2" src={previewUrl} aria-label={selectedPath}>
          <track kind="captions" />
        </audio>
      ) : null}

      <div className="media-meta-list">
        {fileEntry && (
          <>
            <div className="media-meta-row">
              <span>{t("media.meta.name")}</span>
              <span>{fileEntry.name}</span>
            </div>
            {view.dimensions && (
              <div className="media-meta-row">
                <span>{t("media.meta.dimensions")}</span>
                <span>
                  {t("media.dimensionsPx", {
                    width: view.dimensions.width,
                    height: view.dimensions.height,
                  })}
                </span>
              </div>
            )}
            <div className="media-meta-row">
              <span>{t("media.meta.fileSize")}</span>
              <span>{formatSize(fileEntry.size)}</span>
            </div>
            <div className="media-meta-row">
              <span>{t("media.meta.type")}</span>
              <span>{fileEntry.mimeType}</span>
            </div>
            <div className="media-meta-row">
              <span>{t("media.meta.path")}</span>
              <span className="font-mono text-[9px]">{selectedPath}</span>
            </div>
          </>
        )}
      </div>

      {bundle ? (
        refs.length > 0 ? (
          <div className="media-catalog-refs">
            <p className="media-catalog-refs-label">{t("media.referencedAs")}</p>
            <ul className="media-catalog-refs-list">
              {refs.map((ref) => (
                <li key={`${ref.category}.${ref.id}`}>
                  <button
                    type="button"
                    className="media-catalog-ref-link"
                    onClick={() => void navigateToCatalogEntry(navigate, ref.category, ref.id)}
                  >
                    {ref.id}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="media-catalog-refs-empty">{t("media.notReferenced")}</p>
        )
      ) : null}

      <Button variant="danger" size="sm" leadingIcon={Trash2} onClick={() => void handleDelete()}>
        {t("media.moveToTrash")}
      </Button>

      {view.showLightbox && previewUrl && fileEntry && (
        <Lightbox
          src={previewUrl}
          path={selectedPath}
          size={fileEntry.size}
          dimensions={view.dimensions}
          onClose={() => setView((current) => ({ ...current, showLightbox: false }))}
        />
      )}
    </div>
  );
}
