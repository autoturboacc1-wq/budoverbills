import { useEffect, useRef, useCallback, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatNotificationSound } from "./useChatNotificationSound";

interface ChatTargets {
  agreementIds: string[];
  directChatIds: string[];
}

type MessageRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: {
    sender_id?: string;
  };
};

function uniqueStrings(values?: Array<string | null | undefined>): string[] {
  return Array.from(new Set((values ?? []).filter((value): value is string => Boolean(value))));
}

let unreadChatMessageCount = 0;
const unreadChatMessageListeners = new Set<() => void>();

function emitUnreadChatMessageChange() {
  unreadChatMessageListeners.forEach((listener) => listener());
}

function setUnreadChatMessageCount(nextCount: number) {
  const normalizedCount = Number.isFinite(nextCount) ? Math.max(0, Math.trunc(nextCount)) : 0;

  if (normalizedCount === unreadChatMessageCount) {
    return;
  }

  unreadChatMessageCount = normalizedCount;
  emitUnreadChatMessageChange();
}

function subscribeUnreadChatMessageCount(listener: () => void) {
  unreadChatMessageListeners.add(listener);

  return () => {
    unreadChatMessageListeners.delete(listener);
  };
}

function getUnreadChatMessageSnapshot() {
  return unreadChatMessageCount;
}

async function fetchChatTargets(userId: string): Promise<ChatTargets> {
  const [agreementsResult, directChatsResult] = await Promise.all([
    supabase
      .from("debt_agreements")
      .select("id")
      .or(`lender_id.eq.${userId},borrower_id.eq.${userId}`)
      .in("status", ["active", "pending", "pending_transfer", "pending_confirmation"]),
    supabase
      .from("direct_chats")
      .select("id")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
  ]);

  return {
    agreementIds: uniqueStrings(agreementsResult.data?.map((agreement) => agreement.id)),
    directChatIds: uniqueStrings(directChatsResult.data?.map((chat) => chat.id)),
  };
}

async function fetchUnreadCount(userId: string, targets: ChatTargets): Promise<number> {
  const [agreementCountResult, directCountResult] = await Promise.all([
    targets.agreementIds.length > 0
      ? supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("agreement_id", targets.agreementIds)
          .neq("sender_id", userId)
          .is("read_at", null)
      : Promise.resolve({ count: 0 }),
    targets.directChatIds.length > 0
      ? supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("direct_chat_id", targets.directChatIds)
          .neq("sender_id", userId)
          .is("read_at", null)
      : Promise.resolve({ count: 0 }),
  ]);

  return (agreementCountResult.count || 0) + (directCountResult.count || 0);
}

async function fetchChatTargetsAndUnreadCount(userId: string): Promise<{
  chatTargets: ChatTargets;
  unreadCount: number;
}> {
  const chatTargets = await fetchChatTargets(userId);
  const unreadCount = await fetchUnreadCount(userId, chatTargets);
  return { chatTargets, unreadCount };
}

async function refreshUnreadChatMessageCount(userId?: string | null): Promise<number> {
  if (!userId) {
    setUnreadChatMessageCount(0);
    return 0;
  }

  const { unreadCount } = await fetchChatTargetsAndUnreadCount(userId);
  setUnreadChatMessageCount(unreadCount);
  return unreadCount;
}

export function useUnreadChatMessageCount(): number {
  return useSyncExternalStore(
    subscribeUnreadChatMessageCount,
    getUnreadChatMessageSnapshot,
    () => 0
  );
}

export function useRefreshUnreadChatMessageCount() {
  return useCallback((userId?: string | null) => refreshUnreadChatMessageCount(userId), []);
}

/**
 * Global hook to play notification sound when a new message arrives
 * while the user is NOT in the chat page
 */
export const useGlobalChatNotification = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { playNotificationSound } = useChatNotificationSound({ enabled: true, userId: user?.id });
  const [chatTargets, setChatTargets] = useState<ChatTargets>({
    agreementIds: [],
    directChatIds: [],
  });
  const isInChatPage = location.pathname.startsWith("/chat");
  const isInChatPageRef = useRef(isInChatPage);
  const userId = user?.id ?? null;

  // Keep ref updated
  useEffect(() => {
    isInChatPageRef.current = isInChatPage;
  }, [isInChatPage]);

  // Refresh the full target list AND the unread count. Used on mount and when
  // a room/agreement membership row changes (rare).
  const refreshChatTargets = useCallback(async () => {
    if (!userId) {
      setChatTargets({ agreementIds: [], directChatIds: [] });
      setUnreadChatMessageCount(0);
      return;
    }

    const { chatTargets: nextChatTargets, unreadCount } = await fetchChatTargetsAndUnreadCount(userId);

    setChatTargets(nextChatTargets);
    setUnreadChatMessageCount(unreadCount);
  }, [userId]);

  // Refresh only the unread count using the cached target list. Used when a
  // message INSERT/UPDATE/DELETE arrives (frequent). Avoids re-fetching the
  // agreement/direct_chat ID lists on every message.
  const chatTargetsRef = useRef(chatTargets);
  useEffect(() => {
    chatTargetsRef.current = chatTargets;
  }, [chatTargets]);

  const refreshUnreadOnly = useCallback(async () => {
    if (!userId) {
      setUnreadChatMessageCount(0);
      return;
    }
    const unread = await fetchUnreadCount(userId, chatTargetsRef.current);
    setUnreadChatMessageCount(unread);
  }, [userId]);

  // Debounce timers — coalesce bursts of realtime events into one DB query.
  const targetsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unreadRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleTargetsRefresh = useCallback(() => {
    if (targetsRefreshTimerRef.current) {
      clearTimeout(targetsRefreshTimerRef.current);
    }
    targetsRefreshTimerRef.current = setTimeout(() => {
      void refreshChatTargets();
    }, 500);
  }, [refreshChatTargets]);

  const scheduleUnreadRefresh = useCallback(() => {
    if (unreadRefreshTimerRef.current) {
      clearTimeout(unreadRefreshTimerRef.current);
    }
    unreadRefreshTimerRef.current = setTimeout(() => {
      void refreshUnreadOnly();
    }, 300);
  }, [refreshUnreadOnly]);

  useEffect(() => {
    void refreshChatTargets();
    return () => {
      if (targetsRefreshTimerRef.current) clearTimeout(targetsRefreshTimerRef.current);
      if (unreadRefreshTimerRef.current) clearTimeout(unreadRefreshTimerRef.current);
    };
  }, [refreshChatTargets]);

  useEffect(() => {
    if (!userId) return;

    const roomUpdatesChannel = supabase
      .channel(`global-chat-rooms-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `lender_id=eq.${userId}`,
        },
        scheduleTargetsRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `borrower_id=eq.${userId}`,
        },
        scheduleTargetsRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user1_id=eq.${userId}`,
        },
        scheduleTargetsRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user2_id=eq.${userId}`,
        },
        scheduleTargetsRefresh
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(roomUpdatesChannel);
    };
  }, [scheduleTargetsRefresh, userId]);

  useEffect(() => {
    if (!userId || (chatTargets.agreementIds.length === 0 && chatTargets.directChatIds.length === 0)) {
      setUnreadChatMessageCount(0);
      return;
    }

    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    const handleMessageChange = (payload: MessageRealtimePayload) => {
      // Only the unread count needs refreshing on every message — the
      // target list (agreement/direct chat IDs) hasn't changed. Debounced
      // so a burst of messages collapses into one DB query.
      scheduleUnreadRefresh();

      if (payload.eventType !== "INSERT") return;

      const message = payload.new;
      if (message?.sender_id === userId) return;
      if (!isInChatPageRef.current) {
        playNotificationSound();
      }
    };

    chatTargets.agreementIds.forEach((agreementId) => {
      const channel = supabase
        .channel(`global-chat-agreement-${userId}-${agreementId}`)
        .on(
          "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `agreement_id=eq.${agreementId}`,
        },
          handleMessageChange
        )
        .subscribe();

      channels.push(channel);
    });

    chatTargets.directChatIds.forEach((directChatId) => {
      const channel = supabase
        .channel(`global-chat-direct-${userId}-${directChatId}`)
        .on(
          "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `direct_chat_id=eq.${directChatId}`,
        },
          handleMessageChange
        )
        .subscribe();

      channels.push(channel);
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [chatTargets.agreementIds, chatTargets.directChatIds, playNotificationSound, scheduleUnreadRefresh, userId]);
};
