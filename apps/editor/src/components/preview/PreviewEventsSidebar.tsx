import { Panel, PanelBody } from "../ui/Panel.js";
import { PreviewInspectorProfiler } from "./PreviewInspectorProfiler.js";

export function PreviewEventsSidebar() {
  return (
    <Panel className="preview-events-sidebar">
      <PanelBody className="flex min-h-0 flex-col p-2">
        <PreviewInspectorProfiler dock />
      </PanelBody>
    </Panel>
  );
}
