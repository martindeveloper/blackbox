import { usePreviewStore } from "../../store/usePreviewStore.js";
import { PreviewInspectorProfiler } from "./PreviewInspectorProfiler.js";
import { PreviewInspectorRuntime } from "./PreviewInspectorRuntime.js";
import { PreviewInspectorStorage } from "./PreviewInspectorStorage.js";

export function PreviewInspector() {
  const runtimeState = usePreviewStore((state) => state.runtimeState);
  const storageState = usePreviewStore((state) => state.storageState);

  return (
    <div className="preview-inspector">
      <PreviewInspectorRuntime state={runtimeState} />
      <PreviewInspectorProfiler />
      <PreviewInspectorStorage state={storageState} />
    </div>
  );
}
