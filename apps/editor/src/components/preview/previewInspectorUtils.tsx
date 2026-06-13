import { ChevronRight, type LucideIcon } from "lucide-react";
import { Icon } from "../icons/Icon.js";

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

export function formatPlaytime(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function countEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const record = asRecord(value);
  return record ? Object.keys(record).length : 0;
}

export function activeFlagCount(value: unknown): number {
  const flags = asRecord(value);
  if (!flags) return 0;
  return Object.values(flags).filter((flag) => flag === true || flag === 1).length;
}

function StateValue({ value, name }: { value: unknown; name?: string }) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((entry, index) => [String(index), entry] as const)
      : Object.entries(value as UnknownRecord);
    return (
      <details className="preview-raw-node">
        <summary>
          {name && <span className="preview-raw-key">{name}</span>}
          <span>
            {Array.isArray(value) ? `${entries.length} items` : `${entries.length} fields`}
          </span>
        </summary>
        <div className="preview-raw-children">
          {entries.length ? (
            entries.map(([key, entry]) => <StateValue key={key} name={key} value={entry} />)
          ) : (
            <span className="preview-raw-empty">empty</span>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="preview-raw-leaf">
      {name && <span className="preview-raw-key">{name}</span>}
      <span className={`preview-raw-value preview-raw-value--${typeof value}`}>
        {displayValue(value)}
      </span>
    </div>
  );
}

export function RawData({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="preview-raw">
      <summary>
        <Icon icon={ChevronRight} size={11} />
        <span>{label}</span>
      </summary>
      <div className="preview-raw-tree">
        <StateValue value={value} />
      </div>
    </details>
  );
}

export function Fact({ label, value }: { label: string; value: unknown }) {
  const display = displayValue(value);
  return (
    <div className="preview-fact">
      <span>{label}</span>
      <strong title={display}>{display}</strong>
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  count,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
}) {
  return (
    <div className="preview-inspector-heading">
      <span>
        <Icon icon={icon} size={13} />
        {title}
      </span>
      {count !== undefined && <em>{count}</em>}
    </div>
  );
}
