import { useTranslation } from "react-i18next";
import { useMediaPreview } from "../../hooks/useMediaPreview.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";

interface TextureRefThumbProps {
  textureRef?: string;
  variant: "icon" | "portrait";
  emptyLabel: string;
}

export function TextureRefThumb({ textureRef, variant, emptyLabel }: TextureRefThumbProps) {
  const { t } = useTranslation();
  const projectId = useScenarioStore((s) => s.projectId);
  const bundle = useScenarioStore((s) => s.bundle);

  const srcPath = bundle && textureRef ? (bundle.assets.textures?.[textureRef]?.src ?? null) : null;
  const { url, failed, loading } = useMediaPreview(projectId, srcPath, true);

  const loaded = Boolean(url);
  const missingRef = !textureRef;
  const missingAsset = Boolean(textureRef && !srcPath);

  return (
    <div className="inspector-asset-thumb">
      <div
        className={[
          "inspector-asset-thumb-frame",
          `inspector-asset-thumb-frame--${variant}`,
          loaded ? "inspector-asset-thumb-frame--loaded" : "",
          missingRef ? "inspector-asset-thumb-frame--empty" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {url ? (
          <img src={url} alt={textureRef} className="inspector-asset-thumb-img" />
        ) : (
          <span className="inspector-asset-thumb-empty">
            {loading
              ? "…"
              : failed
                ? t("inspector.previewUnavailable")
                : missingAsset
                  ? t("inspector.textureMissing")
                  : emptyLabel}
          </span>
        )}
        {textureRef && loaded ? (
          <span className="inspector-asset-thumb-key">{textureRef}</span>
        ) : null}
      </div>
    </div>
  );
}
