import type { Notification } from "@/hooks/useNotifications";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function decodePathCandidate(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isSafeInternalPath(value: string): boolean {
  const candidate = decodePathCandidate(value).trim();

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return false;
  }

  if (/[\s\\]/.test(candidate)) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return false;
  }

  try {
    const url = new URL(candidate, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/");
  } catch {
    return false;
  }
}

export function getSafeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) {
    return fallback;
  }

  return isSafeInternalPath(value) ? decodePathCandidate(value) : fallback;
}

type NotificationTargetLike = Pick<Notification, "action_url" | "related_id" | "related_type">;

export function getSafeNotificationTarget(notification: NotificationTargetLike): string | null {
  if (notification.action_url && isSafeInternalPath(notification.action_url)) {
    return decodePathCandidate(notification.action_url);
  }

  if (!notification.related_id) {
    return null;
  }

  switch (notification.related_type) {
    case "agreement":
    case "debt_agreement":
    case "reschedule":
      if (!isUuid(notification.related_id)) {
        return null;
      }
      return isSafeInternalPath(`/debt/${notification.related_id}`) ? `/debt/${notification.related_id}` : null;
    case "feed_post":
      return "/";
    case "friend_request":
      return "/friends";
    case "chat":
      if (!isUuid(notification.related_id)) {
        return null;
      }
      return isSafeInternalPath(`/chat/${notification.related_id}`) ? `/chat/${notification.related_id}` : null;
    default:
      return null;
  }
}
