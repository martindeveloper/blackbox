import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LockReason } from "./LockReason.js";
import { UI_FLAGS } from "../uiConfig.js";
import { useAssetScope, useManagedTexture } from "../../../engine/hooks/useAssetScope.js";
import type {
  GameView,
  ItemActionView,
  ItemExamineView,
  InventoryItemView,
} from "../../../engine/types/game.js";

interface InventoryPanelProps {
  view: GameView;
  examine: ItemExamineView | null;
  commandPending: boolean;
  onExamine: (itemRef: string) => void;
  onUse: (itemRef: string, actionId: string) => void;
}

function resolveItemIconSrc(
  item: InventoryItemView,
  examine: ItemExamineView | null,
): string | undefined {
  return item.icon?.src ?? (examine?.ref_id === item.ref_id ? examine.icon?.src : undefined);
}

function InventorySlotIcon({
  itemRef,
  name,
  iconSrc,
  compact,
}: {
  itemRef: string;
  name: string;
  iconSrc?: string;
  compact?: boolean;
}) {
  const { url, status } = useAssetScope(`inventory:icon:${itemRef}`, "texture", iconSrc);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const iconClass = `inventory-slot-icon${compact ? " inventory-slot-icon--compact" : ""}`;

  if (iconSrc && url) {
    return (
      <div className={iconClass} aria-hidden>
        <img
          src={url}
          alt=""
          className={status === "ready" ? undefined : "inventory-slot-icon-img--loading"}
        />
      </div>
    );
  }

  if (iconSrc) {
    return <div className={`${iconClass} inventory-slot-icon--pending`} aria-hidden />;
  }

  return (
    <div className={`${iconClass} inventory-slot-icon--placeholder`} aria-hidden>
      <span>{initial}</span>
    </div>
  );
}

function actionsByItem(view: GameView): Map<string, ItemActionView[]> {
  const map = new Map<string, ItemActionView[]>();
  for (const action of view.item_actions) {
    const existing = map.get(action.item_ref);
    if (existing) existing.push(action);
    else map.set(action.item_ref, [action]);
  }
  return map;
}

function InventoryDetailPane({
  item,
  examine,
  loading,
  actions,
  onUse,
}: {
  item: InventoryItemView | undefined;
  examine: ItemExamineView | null;
  loading: boolean;
  actions: ItemActionView[];
  onUse: (itemRef: string, actionId: string) => void;
}) {
  const { t } = useTranslation();
  const detailReady = item != null && examine?.ref_id === item.ref_id;
  const iconSrc = item ? resolveItemIconSrc(item, examine) : undefined;
  const { ready, url } = useManagedTexture(
    item ? `inventory:detail:${item.ref_id}` : "inventory:detail:none",
    iconSrc,
  );

  if (!item) {
    return (
      <div className="inventory-detail-pane inventory-detail-pane--idle">
        <span className="inventory-detail-idle-mark" aria-hidden />
        <p>{t("inventory.selectPrompt")}</p>
      </div>
    );
  }

  return (
    <div className="inventory-detail-pane">
      <header className="inventory-detail-header">
        <span className="inventory-detail-kicker">{t("inventory.dossier")}</span>
        <div className="inventory-detail-heading">
          <h3 className="inventory-detail-title">{item.name}</h3>
          {item.count > 1 && <span className="inventory-detail-count">×{item.count}</span>}
        </div>
      </header>

      <div
        className={`inventory-detail-body${loading && !detailReady ? " inventory-detail-body--loading" : ""}`}
      >
        <div className="inventory-detail-icon-stage">
          {ready && url ? (
            <img className="inventory-detail-icon" src={url} alt="" />
          ) : (
            <InventorySlotIcon
              itemRef={`detail:${item.ref_id}`}
              name={item.name}
              iconSrc={iconSrc}
            />
          )}
        </div>

        {detailReady ? (
          <>
            <p className="inventory-detail-lead">{examine.description}</p>
            <p className="inventory-detail-text">{examine.examine_text}</p>
            <div className="inventory-detail-meta">
              <span className="inventory-detail-meta-label">{t("examine.ref")}</span>
              <span className="inventory-detail-meta-value">{examine.ref_id}</span>
            </div>
          </>
        ) : loading ? (
          <div className="inventory-detail-skeleton" aria-live="polite">
            <span className="inventory-detail-skeleton-line" />
            <span className="inventory-detail-skeleton-line inventory-detail-skeleton-line--short" />
            <span className="inventory-detail-skeleton-line" />
            <p className="inventory-detail-loading-label">{t("inventory.loading")}</p>
          </div>
        ) : (
          <p className="inventory-detail-lead inventory-detail-lead--muted">
            {t("inventory.selectPrompt")}
          </p>
        )}
      </div>

      {actions.length > 0 && (
        <footer className="inventory-detail-actions">
          {actions.map((action) => {
            const disabled = !action.enabled;
            return (
              <button
                key={action.action_id}
                type="button"
                className={`inventory-detail-action${disabled ? " inventory-detail-action--disabled" : ""}`}
                disabled={disabled}
                title={disabled ? action.disabledReason : undefined}
                onClick={() => onUse(item.ref_id, action.action_id)}
              >
                <span>{action.label}</span>
                {disabled && action.disabledReason && (
                  <LockReason
                    reason={action.disabledReason}
                    showDetail={UI_FLAGS.showGateDetails}
                  />
                )}
              </button>
            );
          })}
        </footer>
      )}
    </div>
  );
}

export function InventoryPanel({
  view,
  examine,
  commandPending,
  onExamine,
  onUse,
}: InventoryPanelProps) {
  const { t } = useTranslation();
  const items = view.inventory_items;
  const itemActions = useMemo(() => actionsByItem(view), [view.item_actions]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  useEffect(() => {
    if (!items.length) {
      setSelectedRef(null);
      return;
    }

    const firstItem = items[0];
    let autoExamine: string | null = null;
    setSelectedRef((prev) => {
      if (prev && items.some((item) => item.ref_id === prev)) return prev;
      autoExamine = firstItem?.ref_id ?? null;
      return autoExamine;
    });
    if (autoExamine) onExamine(autoExamine);
  }, [items, onExamine]);

  const selectItem = (ref: string) => {
    setSelectedRef(ref);
    if (ref !== selectedRef || examine?.ref_id !== ref) onExamine(ref);
  };

  if (!items.length) {
    return (
      <div className="inventory-empty">
        <span className="inventory-empty-mark" aria-hidden />
        <p>{t("inventory.empty")}</p>
      </div>
    );
  }

  const selectedItem = items.find((item) => item.ref_id === selectedRef);
  const selectedActions = (selectedRef ? (itemActions.get(selectedRef) ?? []) : []).filter(
    (action) => action.enabled,
  );
  const detailLoading = commandPending && examine?.ref_id !== selectedRef;

  return (
    <div className="inventory-modal-content inventory-split">
      <div className="inventory-split-grid">
        <div className="inventory-grid" role="list">
          {items.map((item, index) => {
            const isSelected = item.ref_id === selectedRef;
            const slotStyle = { "--slot-i": index } as CSSProperties;

            return (
              <article
                key={item.ref_id}
                className={`inventory-slot${isSelected ? " inventory-slot--selected" : ""}`}
                style={slotStyle}
                role="listitem"
              >
                <button
                  type="button"
                  className={`inventory-slot-examine${isSelected ? " is-selected" : ""}`}
                  onClick={() => selectItem(item.ref_id)}
                  aria-pressed={isSelected}
                  aria-label={t("inventory.examineItem", { name: item.name })}
                >
                  {item.count > 1 && (
                    <span className="inventory-slot-count" aria-hidden>
                      ×{item.count}
                    </span>
                  )}
                  <InventorySlotIcon
                    itemRef={item.ref_id}
                    name={item.name}
                    iconSrc={resolveItemIconSrc(item, examine)}
                    compact
                  />
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="inventory-split-detail" aria-live="polite">
        <InventoryDetailPane
          item={selectedItem}
          examine={examine}
          loading={detailLoading}
          actions={selectedActions}
          onUse={onUse}
        />
      </aside>
    </div>
  );
}
