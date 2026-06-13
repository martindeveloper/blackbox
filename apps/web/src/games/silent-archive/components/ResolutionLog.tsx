import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { RollRecord, UiNotification } from "../../../engine/types/game.js";
import { rollsSequenceMs, UI_TIMING } from "../uiConfig.js";
import { ArchiveIcon, DamageIcon, HealingIcon, KeycardIcon, StatIcon } from "./Icons.js";

interface ResolutionLogProps {
  rolls: RollRecord[];
  notifications: UiNotification[];
  onNotificationActivate?: (notification: UiNotification) => void;
}

export function ResolutionLog({
  rolls,
  notifications,
  onNotificationActivate,
}: ResolutionLogProps) {
  const { t } = useTranslation();
  const notificationEntries = useMemo(() => {
    const counts = new Map<string, number>();
    return notifications.map((notification, index) => {
      const categoryIndex = (counts.get(notification.category) ?? 0) + 1;
      counts.set(notification.category, categoryIndex);
      return { notification, categoryIndex, index };
    });
  }, [notifications]);

  if (!rolls?.length && !notifications.length) return null;

  const notificationBaseDelay = rollsSequenceMs(rolls.length);

  return (
    <div className="mb-7">
      <div className="section-rule mb-3">{t("resolution.title")}</div>
      <div className="resolution-entry-stack">
        {rolls.map((roll, i) => (
          <RollEntry key={i} roll={roll} startDelay={i * UI_TIMING.rollStaggerMs} />
        ))}
        {notificationEntries.map(({ notification, categoryIndex, index }) => (
          <NotificationEntry
            key={notification.id}
            notification={notification}
            startDelay={notificationBaseDelay + index * UI_TIMING.notificationStaggerMs}
            categoryIndex={categoryIndex}
            onActivate={
              (notification.category === "item" || notification.category === "intel") &&
              notification.change === "acquired" &&
              onNotificationActivate
                ? () => onNotificationActivate(notification)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function NotificationEntry({
  notification,
  categoryIndex,
  startDelay,
  onActivate,
}: {
  notification: UiNotification;
  categoryIndex: number;
  startDelay: number;
  onActivate?: () => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(startDelay === 0);

  useEffect(() => {
    if (startDelay === 0) return;
    const timer = setTimeout(() => setVisible(true), startDelay);
    return () => clearTimeout(timer);
  }, [startDelay]);

  if (!visible) return null;

  if (notification.category === "damage") {
    return (
      <NotificationShell
        category="damage"
        assertive
        icon={<DamageIcon size={16} />}
        label={t("resolution.hit", { number: String(categoryIndex).padStart(2, "0") })}
        subject={t("resolution.hpLost", { amount: notification.amount })}
        detail={
          notification.maxHp === undefined
            ? t("resolution.hpRemaining", { hp: notification.hp })
            : t("resolution.hpRemainingOf", {
                hp: notification.hp,
                maxHp: notification.maxHp,
              })
        }
      />
    );
  }

  if (notification.category === "healing") {
    return (
      <NotificationShell
        category="healing"
        icon={<HealingIcon size={16} />}
        label={t("resolution.recovery", { number: String(categoryIndex).padStart(2, "0") })}
        subject={t("resolution.hpGained", { amount: notification.amount })}
        detail={
          notification.maxHp === undefined
            ? t("resolution.hpRemaining", { hp: notification.hp })
            : t("resolution.hpRemainingOf", {
                hp: notification.hp,
                maxHp: notification.maxHp,
              })
        }
      />
    );
  }

  if (notification.category === "stat") {
    const statName = statNotificationLabel(notification.stat, t);
    return (
      <NotificationShell
        category="stat"
        modifier={notification.change}
        icon={<StatIcon size={16} />}
        label={
          notification.change === "gained" ? t("resolution.statGained") : t("resolution.statLost")
        }
        subject={
          notification.change === "gained"
            ? t("resolution.statUp", { stat: statName, amount: notification.amount })
            : t("resolution.statDown", { stat: statName, amount: notification.amount })
        }
        detail={t("resolution.statNow", { stat: statName, value: notification.value })}
      />
    );
  }

  if (notification.category === "intel") {
    return (
      <NotificationShell
        category="intel"
        modifier={notification.change}
        icon={<ArchiveIcon size={15} />}
        label={
          notification.change === "acquired"
            ? t("resolution.intelAcquired")
            : t("resolution.intelLost")
        }
        subject={notification.intelName}
        detail={t("resolution.intelUpdated")}
        onActivate={onActivate}
      />
    );
  }

  return (
    <NotificationShell
      category="item"
      modifier={notification.change}
      icon={<KeycardIcon size={17} />}
      label={
        notification.change === "acquired" ? t("resolution.itemAcquired") : t("resolution.itemLost")
      }
      subject={notification.itemName}
      detail={
        notification.change === "acquired"
          ? t("resolution.itemAdded", { amount: notification.amount })
          : t("resolution.itemRemoved", { amount: notification.amount })
      }
      onActivate={onActivate}
    />
  );
}

function statNotificationLabel(stat: string, t: TFunction): string {
  const key = `vitals.stats.${stat}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return stat.replace(/_/g, " ").toUpperCase();
}

function NotificationShell({
  category,
  modifier,
  icon,
  label,
  subject,
  detail,
  assertive = false,
  onActivate,
}: {
  category: UiNotification["category"];
  modifier?: "acquired" | "lost" | "gained";
  icon: ReactNode;
  label: string;
  subject: string;
  detail: string;
  assertive?: boolean;
  onActivate?: () => void;
}) {
  const content = (
    <>
      <span className="ui-notification-icon" aria-hidden>
        {icon}
      </span>
      <span className="ui-notification-label">{label}</span>
      <strong className="ui-notification-subject">{subject}</strong>
      <span className="ui-notification-detail">{detail}</span>
    </>
  );
  const className = `ui-notification ui-notification--${category}${
    modifier ? ` ui-notification--${modifier}` : ""
  }${onActivate ? " ui-notification--interactive" : ""}`;

  if (onActivate) {
    return (
      <button
        type="button"
        className={className}
        role="status"
        aria-live={assertive ? "assertive" : "polite"}
        onClick={onActivate}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} role="status" aria-live={assertive ? "assertive" : "polite"}>
      {content}
    </div>
  );
}

function AnimatedPip({
  value,
  sides,
  rolling,
}: {
  value: number;
  sides: number;
  rolling: boolean;
}) {
  const [display, setDisplay] = useState(() =>
    rolling ? Math.floor(Math.random() * sides) + 1 : value,
  );
  const [settled, setSettled] = useState(!rolling);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (rolling) {
      setSettled(false);
      intervalRef.current = setInterval(() => {
        setDisplay(Math.floor(Math.random() * sides) + 1);
      }, UI_TIMING.rollPipIntervalMs);
    } else {
      setDisplay(value);
      setSettled(true);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [rolling, value, sides]);

  return (
    <span
      className={`roll-dice-pip${rolling ? " roll-dice-pip--rolling" : ""}${settled && !rolling ? " roll-dice-pip--settled" : ""}`}
    >
      {display}
    </span>
  );
}

function RollEntry({ roll, startDelay }: { roll: RollRecord; startDelay: number }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"hidden" | "rolling" | "settled">("hidden");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("rolling"), startDelay);
    const t2 = setTimeout(() => setPhase("settled"), startDelay + UI_TIMING.rollDurationMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "hidden") return null;

  const rolling = phase === "rolling";
  const sides = roll.kind === "skillCheck" ? 20 : (roll.sides ?? 6);

  if (roll.kind === "skillCheck") {
    const label = (roll.label ?? roll.stat).toUpperCase();
    const passed = roll.success;

    const entryClass = `roll-entry roll-entry--fade-in ${
      phase === "settled"
        ? passed
          ? "roll-entry--pass"
          : "roll-entry--fail"
        : "roll-entry--resolving"
    }`;

    const rollModeTag =
      roll.rollMode === "advantage"
        ? t("resolution.rollModeAdvantage")
        : roll.rollMode === "disadvantage"
          ? t("resolution.rollModeDisadvantage")
          : null;

    return (
      <div className={entryClass}>
        <div className="roll-entry-header">
          <span className="roll-entry-label">{label}</span>
          <span className="roll-entry-meta">
            {roll.stat.toUpperCase()} · {t("resolution.dc")} {roll.difficulty}
            {rollModeTag && (
              <span className={`roll-entry-mode-tag roll-entry-mode-tag--${roll.rollMode}`}>
                {" "}
                · {rollModeTag}
              </span>
            )}
          </span>
        </div>
        <div className="roll-entry-row">
          <span className="roll-entry-hint">d{sides}</span>
          <AnimatedPip value={roll.roll} sides={sides} rolling={rolling} />
          {roll.modifier !== 0 && (
            <>
              <span className="roll-entry-op">+</span>
              <span className="roll-entry-mod">{roll.modifier}</span>
            </>
          )}
          <span className="roll-entry-op">=</span>
          <span className="roll-entry-total">
            {phase === "settled" ? roll.total : t("resolution.unknownTotal")}
          </span>
          {phase === "settled" && (
            <span
              className="roll-entry-verdict"
              style={{ color: passed ? "var(--color-success)" : "var(--color-danger)" }}
            >
              {passed ? t("resolution.pass") : t("resolution.fail")}
            </span>
          )}
        </div>
      </div>
    );
  }

  const label = (roll.label ?? roll.kind).toUpperCase();
  const rollSides = roll.sides ? `d${roll.sides}` : "—";

  return (
    <div className="roll-entry roll-entry--fade-in">
      <div className="roll-entry-row">
        <span className="roll-entry-label">{label}</span>
        <span className="roll-entry-hint">{rollSides}</span>
        <AnimatedPip value={roll.roll} sides={sides} rolling={rolling} />
        {roll.modifier !== 0 && phase === "settled" && (
          <>
            <span className="roll-entry-op">+</span>
            <span className="roll-entry-mod">{roll.modifier}</span>
            <span className="roll-entry-op">=</span>
            <span className="roll-entry-total">{roll.total}</span>
          </>
        )}
      </div>
    </div>
  );
}
