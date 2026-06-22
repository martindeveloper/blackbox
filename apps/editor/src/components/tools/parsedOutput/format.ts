import { translate } from "@/lib/i18n.js";
import type { InspectEntry, LintResultStatus } from "@/lib/toolsApi.js";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return translate("tools.parsed.bytes.b", { n: bytes });
  if (bytes < 1024 * 1024) {
    return translate("tools.parsed.bytes.kib", { n: (bytes / 1024).toFixed(1) });
  }
  return translate("tools.parsed.bytes.mib", { n: (bytes / (1024 * 1024)).toFixed(2) });
}

export function formatSimCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function shortNodeId(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 12)}…${id.slice(-10)}`;
}

export function inspectEntryStatusClass(status: InspectEntry["status"]): "ok" | "warn" | "error" {
  if (status === "WARN") return "warn";
  if (status === "ERROR") return "error";
  return "ok";
}

export function resultTagClass(result: LintResultStatus): string {
  if (result === "failed") return "parsed-result-tag--error";
  if (result === "passed with warnings") return "parsed-result-tag--warn";
  return "parsed-result-tag--ok";
}

export function resultTagLabel(result: LintResultStatus): string {
  if (result === "failed") return translate("tools.status.failed");
  if (result === "passed with warnings") return translate("tools.status.warnings");
  return translate("tools.status.passed");
}
