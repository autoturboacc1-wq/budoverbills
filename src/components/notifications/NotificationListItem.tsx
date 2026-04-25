import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  type LucideIcon,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

import type { Notification, NotificationPriority } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface NotificationListItemProps {
  notification: Notification;
  index: number;
  onOpen: (notification: Notification) => void;
  onDelete?: (notificationId: string) => void;
  compact?: boolean;
}

const iconMap: Record<string, LucideIcon> = {
  payment_due: Clock,
  payment_reminder: Clock,
  payment_uploaded: AlertCircle,
  payment_received: Check,
  payment_confirmed: Check,
  payment_rejected: AlertCircle,
  agreement_created: FileText,
  agreement_confirmed: CheckCircle2,
  agreement_completed: CheckCircle2,
  reschedule_request: Clock,
  reschedule_approved: CheckCircle2,
  reschedule_rejected: AlertCircle,
  post_published: CheckCircle2,
  friend_request: Bell,
  friend_accepted: CheckCircle2,
  security_alert: AlertCircle,
  default: Bell,
};

const toneConfig: Record<
  NotificationPriority,
  {
    accentClass: string;
    iconClass: string;
    label: string;
    labelClass: string;
  }
> = {
  critical: {
    accentClass: "bg-destructive",
    iconClass: "bg-destructive/10 text-destructive",
    label: "ด่วน",
    labelClass: "text-destructive",
  },
  important: {
    accentClass: "bg-status-pending",
    iconClass: "bg-status-pending/10 text-status-pending",
    label: "สำคัญ",
    labelClass: "text-status-pending",
  },
  info: {
    accentClass: "bg-foreground",
    iconClass: "bg-muted text-muted-foreground",
    label: "ใหม่",
    labelClass: "text-foreground",
  },
};

function formatNotificationTime(timestamp: string) {
  return formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: th,
  });
}

export function NotificationListItem({
  notification,
  index,
  onOpen,
  onDelete,
  compact = false,
}: NotificationListItemProps) {
  const priority = notification.priority ?? "info";
  const tone = toneConfig[priority] ?? toneConfig.info;
  const isUnread = !notification.is_read;
  const Icon = priority === "critical" && isUnread
    ? AlertTriangle
    : iconMap[notification.type] ?? iconMap.default;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        duration: 0.22,
        delay: Math.min(index * 0.025, 0.14),
        ease: [0.22, 1, 0.36, 1],
      }}
      className="list-none"
    >
      <div
        className={cn(
          "relative flex min-h-[76px] overflow-hidden rounded-md border transition-colors",
          isUnread
            ? "border-border bg-card shadow-soft"
            : "border-transparent bg-transparent hover:bg-muted/55",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute bottom-3 left-0 top-3 w-0.5 rounded-r-full",
            isUnread ? tone.accentClass : "bg-transparent",
          )}
        />

        <button
          type="button"
          onClick={() => onOpen(notification)}
          aria-label={`เปิดการแจ้งเตือน: ${notification.title}${isUnread ? " ยังไม่อ่าน" : " อ่านแล้ว"}`}
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3.5 text-left outline-none transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              isUnread ? tone.iconClass : "bg-muted/70 text-muted-foreground/70",
            )}
            aria-hidden
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-start justify-between gap-2">
              <span
                className={cn(
                  "line-clamp-1 min-w-0 flex-1 text-sm font-medium leading-5",
                  isUnread ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {notification.title}
              </span>
              <span
                className={cn(
                  "shrink-0 pt-0.5 text-[10px] font-medium",
                  isUnread ? tone.labelClass : "text-muted-foreground/60",
                )}
              >
                {isUnread ? tone.label : "อ่านแล้ว"}
              </span>
            </span>

            {!compact ? (
              <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {notification.message}
              </span>
            ) : null}

            <span className="mt-1 block text-[11px] text-muted-foreground/70">
              {formatNotificationTime(notification.created_at)}
            </span>
          </span>
        </button>

        {onDelete ? (
          <button
            type="button"
            className="m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`ลบการแจ้งเตือน: ${notification.title}`}
            onClick={() => onDelete(notification.id)}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <ChevronRight
            className="mr-3 mt-5 h-4 w-4 shrink-0 text-muted-foreground/50"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </div>
    </motion.li>
  );
}
