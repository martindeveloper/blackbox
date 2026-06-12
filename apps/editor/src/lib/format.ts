import { translate } from "./i18n.js";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return translate("media.sizeBytes", { n: bytes });
  if (bytes < 1024 * 1024) {
    return translate("media.sizeKilobytes", { n: (bytes / 1024).toFixed(1) });
  }
  return translate("media.sizeMegabytes", { n: (bytes / (1024 * 1024)).toFixed(1) });
}

export function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return translate("welcome.relative.justNow");
  if (diff < 60) return translate("welcome.relative.secondsAgo", { count: diff });
  if (diff < 3600) {
    return translate("welcome.relative.minutesAgo", { count: Math.floor(diff / 60) });
  }
  return translate("welcome.relative.hoursAgo", { count: Math.floor(diff / 3600) });
}

export function formatTrashedAt(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}
