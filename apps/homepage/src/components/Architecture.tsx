import { useTranslation } from "react-i18next";

type Layer = { id: string; label: string; detail: string };

export function Architecture() {
  const { t } = useTranslation();
  const layers = t("architecture.layers", { returnObjects: true }) as Layer[];
  const flowLayers = layers.filter((layer) => layer.id !== "host");
  const hostLayer = layers.find((layer) => layer.id === "host");

  return (
    <section className="architecture section" id="architecture">
      <div className="container">
        <div className="arch-inner">
          <div className="arch-copy">
            <span className="section-label">{t("architecture.label")}</span>
            <h2 className="section-headline">{t("architecture.headline")}</h2>
            <p className="arch-body">{t("architecture.body")}</p>
          </div>
          <div className="arch-diagram" aria-label={t("architecture.headline")}>
            <div className="arch-frame-head" aria-hidden="true">
              <span>{t("architecture.diagram.frame_left")}</span>
              <span>{t("architecture.diagram.frame_right")}</span>
            </div>
            <div className="arch-flow">
              {flowLayers.map((layer, i) => (
                <div className="arch-flow-step" key={layer.id}>
                  <div className={`arch-layer arch-layer--${layer.id}`}>
                    <div className="arch-layer-header">
                      <span className="arch-layer-index">{String(i + 1).padStart(2, "0")}</span>
                      <span className="arch-layer-label">{layer.label}</span>
                    </div>
                    <p className="arch-layer-detail">{layer.detail}</p>
                    {layer.id === "engine" && (
                      <span className="arch-engine-pulse" aria-hidden="true" />
                    )}
                  </div>
                  {i < flowLayers.length - 1 && (
                    <div className="arch-connector" aria-hidden="true">
                      <span className="arch-connector-line" />
                      <span className="arch-connector-head" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hostLayer && (
              <div className="arch-host">
                <div className="arch-host-rail" aria-hidden="true">
                  <span />
                  <span />
                </div>
                <div className="arch-host-copy">
                  <div className="arch-layer-header">
                    <span className="arch-layer-index">04</span>
                    <span className="arch-layer-label">{hostLayer.label}</span>
                  </div>
                  <p className="arch-layer-detail">{hostLayer.detail}</p>
                </div>
                <span className="arch-host-tag" aria-hidden="true">
                  {t("architecture.diagram.host_tag")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
