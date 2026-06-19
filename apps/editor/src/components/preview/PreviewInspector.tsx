import { usePreviewStore } from "../../store/usePreviewStore.js";
import { PreviewInspectorRuntime } from "./PreviewInspectorRuntime.js";
import { PreviewInspectorCheckpoints } from "./PreviewInspectorCheckpoints.js";
import { PreviewInspectorStorage } from "./PreviewInspectorStorage.js";

export function PreviewInspector() {
  const runtimeState = usePreviewStore((state) => state.runtimeState);
  const storageState = usePreviewStore((state) => state.storageState);

  return (
    <div className="preview-inspector">
      <PreviewInspectorRuntime state={runtimeState} />
      <PreviewInspectorCheckpoints />
      <PreviewInspectorStorage state={storageState} />
    </div>
  );
}
