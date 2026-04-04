import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { isSafeInternalPath } from "@/utils/navigation";

export type NotificationPriority = "critical" | "important" | "info";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_id: string | null;
  related_type: string | null;
  is_read: boolean;
  created_at: string;
  priority: NotificationPriority;
  action_url: string | null;
}

interface NotificationsContextValue {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function dedupeNotificationsById(items: Notification[]): Notification[] {
  const seen = new Set<string>();
  const deduped: Notification[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function useNotificationsState(): NotificationsContextValue {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const notificationIdSetRef = useRef<Set<string>>(new Set());

  const userId = user?.id ?? null;

  const normalizeNotification = useCallback((notification: Notification): Notification => {
    const safeActionUrl = notification.action_url && isSafeInternalPath(notification.action_url)
      ? notification.action_url
      : null;

    return {
      ...notification,
      action_url: safeActionUrl,
    };
  }, []);

  const syncNotificationIds = useCallback((items: Notification[]) => {
    notificationIdSetRef.current = new Set(items.map((notification) => notification.id));
  }, []);

  const teardownChannel = useCallback((channel: ReturnType<typeof supabase.channel> | null) => {
    if (!channel) {
      return;
    }

    void channel.unsubscribe();
    void supabase.removeChannel(channel);
  }, []);

  const fetchNotifications = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!userId) {
      setNotifications([]);
      syncNotificationIds([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextNotifications = dedupeNotificationsById((data || []).map(normalizeNotification));
      syncNotificationIds(nextNotifications);
      setNotifications(nextNotifications);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error("Error fetching notifications:", error);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [normalizeNotification, syncNotificationIds, userId]);

  const upsertNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === notification.id);
      const next = existingIndex >= 0
        ? [...prev.slice(0, existingIndex), notification, ...prev.slice(existingIndex + 1)]
        : [notification, ...prev];
      const deduped = dedupeNotificationsById(next);

      syncNotificationIds(deduped);
      return deduped;
    });
  }, [syncNotificationIds]);

  const removeNotificationById = useCallback((notificationId: string) => {
    setNotifications((prev) => {
      const next = prev.filter((item) => item.id !== notificationId);
      syncNotificationIds(next);
      return next;
    });
  }, [syncNotificationIds]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId)
        .eq("user_id", userId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success("อ่านทั้งหมดแล้ว");
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }, [userId]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", userId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      syncNotificationIds([]);
      teardownChannel(channelRef.current);
      channelRef.current = null;
      setLoading(false);
      return;
    }

    if (channelRef.current) {
      teardownChannel(channelRef.current);
      channelRef.current = null;
    }

    void fetchNotifications();
    let cancelled = false;

    const channel = supabase
      .channel(`notifications-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (cancelled) return;
          const newNotification = normalizeNotification(payload.new as Notification);
          if (notificationIdSetRef.current.has(newNotification.id)) {
            return;
          }

          notificationIdSetRef.current.add(newNotification.id);
          upsertNotification(newNotification);

          toast(newNotification.title, {
            description: newNotification.message,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (cancelled) return;
          const updated = normalizeNotification(payload.new as Notification);
          notificationIdSetRef.current.add(updated.id);
          upsertNotification(updated);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (cancelled) return;
          const deleted = payload.old as Notification;
          removeNotificationById(deleted.id);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      teardownChannel(channel);
    };
  }, [fetchNotifications, normalizeNotification, removeNotificationById, syncNotificationIds, teardownChannel, upsertNotification, userId]);

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotificationsState();

  return createElement(NotificationsContext.Provider, { value }, children);
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }

  return context;
}
