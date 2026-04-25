import { useEffect, useRef, useCallback, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatNotificationSound } from "./useChatNotificationSound";

interface ChatTargets {
  agreementIds: string[];
  directChatIds: string[];
}

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

export function useUnreadChatMessageCount(): number {
  return useSyncExternalStore(
    subscribeUnreadChatMessageCount,
    getUnreadChatMessageSnapshot,
    () => 0
  );
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

  const refreshChatTargets = useCallback(async () => {
    if (!userId) {
      setChatTargets({ agreementIds: [], directChatIds: [] });
      setUnreadChatMessageCount(0);
      return;
    }

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

    const agreementIds = uniqueStrings(agreementsResult.data?.map((agreement) => agreement.id));
    const directChatIds = uniqueStrings(directChatsResult.data?.map((chat) => chat.id));

    setChatTargets({
      agreementIds,
      directChatIds,
    });

    const [agreementCountResult, directCountResult] = await Promise.all([
      agreementIds.length > 0
        ? supabase
            .from("messages")
            .select("id", { count: "exact" })
            .in("agreement_id", agreementIds)
            .neq("sender_id", userId)
            .is("read_at", null)
        : Promise.resolve({ count: 0 }),
      directChatIds.length > 0
        ? supabase
            .from("messages")
            .select("id", { count: "exact" })
            .in("direct_chat_id", directChatIds)
            .neq("sender_id", userId)
            .is("read_at", null)
        : Promise.resolve({ count: 0 }),
    ]);

    setUnreadChatMessageCount((agreementCountResult.count || 0) + (directCountResult.count || 0));
  }, [userId]);

  useEffect(() => {
    void refreshChatTargets();
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
        () => {
          void refreshChatTargets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `borrower_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user1_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user2_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(roomUpdatesChannel);
    };
  }, [refreshChatTargets, userId]);

  useEffect(() => {
    if (!userId || (chatTargets.agreementIds.length === 0 && chatTargets.directChatIds.length === 0)) {
      setUnreadChatMessageCount(0);
      return;
    }

    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    const handleMessage = (payload: { new: { sender_id: string } }) => {
      const message = payload.new;

      if (message.sender_id === userId) return;
      void refreshChatTargets();
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
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `agreement_id=eq.${agreementId}`,
          },
          handleMessage
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
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `direct_chat_id=eq.${directChatId}`,
          },
          handleMessage
        )
        .subscribe();

      channels.push(channel);
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [chatTargets.agreementIds, chatTargets.directChatIds, playNotificationSound, refreshChatTargets, userId]);
};
