import { Gamepad2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PreviewRuntimeState } from "@/store/usePreviewStore.js";
import { displayValue, Fact, RawData, SectionTitle } from "./previewInspectorUtils.js";

export function PreviewInspectorRuntime({ state }: { state: PreviewRuntimeState }) {
  const { t } = useTranslation();
  const engine = state.phase === "ready" ? state.engine : undefined;
  const view = state.phase === "ready" ? state.view : undefined;
  const player = engine?.player;
  const stats = player?.stats;
  const inventory = engine?.inventory?.items;
  const phase = displayValue(state.phase);
  const node = engine?.current_node_id ?? view?.node_id;
  const location =
    (state.phase === "ready" ? state.presentationLocation : undefined) ?? view?.location;

  return (
    <section className="preview-inspector-section">
      <SectionTitle icon={Gamepad2} title={t("preview.runtimeState")} />
      <div className="preview-summary-card preview-summary-card--runtime">
        <div className="preview-runtime-status">
          <span>{t("preview.sessionPhase")}</span>
          <strong>{phase}</strong>
        </div>
        <div className="preview-fact-grid">
          <Fact label={t("preview.currentNode")} value={node} />
          <Fact label={t("preview.location")} value={location} />
          <Fact label={t("preview.stats")} value={stats ? Object.keys(stats).length : 0} />
          <Fact
            label={t("preview.inventory")}
            value={inventory ? Object.keys(inventory).length : 0}
          />
        </div>
        <RawData label={t("preview.inspectRuntime")} value={state} />
      </div>
    </section>
  );
}
