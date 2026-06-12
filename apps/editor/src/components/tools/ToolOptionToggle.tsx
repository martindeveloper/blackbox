import type { LucideIcon } from "lucide-react";
import { Icon } from "../icons/Icon.js";

interface ToolOptionToggleProps {
  icon: LucideIcon;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  title?: string;
  nested?: boolean;
}

export function ToolOptionToggle({
  icon,
  label,
  hint,
  checked,
  onChange,
  disabled,
  title,
  nested,
}: ToolOptionToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`tools-sim-toggle${checked ? " tools-sim-toggle--on" : ""}${nested ? " tools-sim-toggle--nested" : ""}`}
    >
      <span className="tools-sim-toggle-mark" aria-hidden>
        <Icon icon={icon} size={13} strokeWidth={2.2} />
      </span>
      <span className="tools-sim-toggle-text">
        <span className="tools-sim-toggle-label">{label}</span>
        <span className="tools-sim-toggle-hint">{hint}</span>
      </span>
    </button>
  );
}
