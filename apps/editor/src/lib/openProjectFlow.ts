import { confirmModal } from "./modalApi.js";
import { translate } from "./i18n.js";
import {
  ApiError,
  openProject as openProjectApi,
  setProjectCodeTrust,
  type ProjectSnapshot,
} from "./projectApi.js";

export async function openProjectWithPrompts(projectId: string): Promise<ProjectSnapshot | false> {
  let acceptEditorVersion = false;
  while (true) {
    try {
      return await openProjectApi(projectId, acceptEditorVersion);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.code === "editor_version_mismatch") {
        const accepted = await confirmModal({
          title: translate("welcome.editorVersionMismatchTitle"),
          message: translate("welcome.editorVersionMismatchMessage", {
            projectVersion: error.projectVersion ?? "?",
            editorVersion: error.editorVersion ?? "?",
          }),
          confirmLabel: translate("welcome.editorVersionMismatchAction"),
          cancelLabel: translate("common.cancel"),
          closeAborts: true,
        });
        if (accepted !== true) return false;
        acceptEditorVersion = true;
        continue;
      }
      if (error.code !== "project_trust_required") throw error;
      const trusted = await confirmModal({
        title: translate("welcome.trustProjectTitle"),
        message: translate("welcome.trustProjectMessage"),
        confirmLabel: translate("welcome.trustProjectAction"),
        cancelLabel: translate("welcome.openProjectSafely"),
        closeAborts: true,
      });
      if (trusted === null) return false;
      await setProjectCodeTrust(projectId, trusted);
    }
  }
}
