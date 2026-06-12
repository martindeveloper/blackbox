import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../ui/EmptyState.js";

export function MetaCatalogOverview() {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const createMetaCatalog = useScenarioStore((s) => s.createMetaCatalog);

  if (!bundle) return null;

  if (!bundle.meta) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState>{t("meta.noCatalog")}</EmptyState>
        <div className="mt-4 flex justify-center">
          <Button size="sm" leadingIcon={Plus} onClick={() => createMetaCatalog()}>
            {t("scenario.createMetaCatalog")}
          </Button>
        </div>
      </div>
    );
  }

  const { events, flags } = bundle.meta;
  const eventCount = Object.keys(events).length;
  const flagCount = Object.keys(flags).length;
  const visibleEvents = Object.values(events).filter((e) => !e.internal).length;
  const visibleFlags = Object.values(flags).filter((f) => !f.internal).length;
  const internalCount = eventCount + flagCount - visibleEvents - visibleFlags;

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="mb-1 text-base font-semibold text-primary">{t("meta.overviewTitle")}</h1>
      <p className="mb-6 text-[11px] text-muted">{t("meta.overviewSubtitle")}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          value={eventCount}
          label={t("meta.statEvents", { count: eventCount })}
          accent="accent"
        />
        <StatCard
          value={flagCount}
          label={t("meta.statFlags", { count: flagCount })}
          accent="secondary"
        />
        <StatCard
          value={visibleEvents + visibleFlags}
          label={t("meta.statVisible", { count: visibleEvents + visibleFlags })}
          accent="success"
        />
        <StatCard
          value={internalCount}
          label={t("meta.statInternal", { count: internalCount })}
          accent="muted"
        />
      </div>

      <p className="mt-8 text-[11px] text-muted">{t("meta.selectEntry")}</p>
    </div>
  );
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: "accent" | "secondary" | "success" | "muted";
}) {
  const colorMap: Record<string, string> = {
    accent: "text-accent",
    secondary: "text-secondary",
    success: "text-success",
    muted: "text-muted-2",
  };
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className={`text-2xl font-bold tabular-nums ${colorMap[accent] ?? ""}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted">{label}</div>
    </div>
  );
}
