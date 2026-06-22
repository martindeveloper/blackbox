import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NotificationType } from "../../lib/notifyApi.js";
import { Icon } from "../icons/Icon.js";
import { IconButton } from "../ui/IconButton.js";

const ICONS: Record<NotificationType, LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

interface NotificationToastProps {
  message: string;
  type: NotificationType;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

export function NotificationToast({
  message,
  type,
  actionLabel,
  onAction,
  onDismiss,
}: NotificationToastProps) {
  return (
    <div className={`notification-toast notification-toast--${type}`}>
      <span className="notification-toast-accent" aria-hidden />
      <Icon icon={ICONS[type]} size={16} className="notification-toast-icon shrink-0" />
      <div className="notification-toast-content">
        <p className="notification-toast-message">{message}</p>
        {actionLabel && onAction ? (
          <button className="notification-toast-action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
      <IconButton icon={X} className="notification-toast-dismiss" onClick={onDismiss} />
    </div>
  );
}
