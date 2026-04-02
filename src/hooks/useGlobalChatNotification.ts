import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatNotificationSound } from "./useChatNotificationSound";

/**
 * Global hook to play notification sound when a new message arrives
 * while the user is NOT in the chat page
 */
export const useGlobalChatNotification = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { playNotificationSound } = useChatNotificationSound({ enabled: true, userId: user?.id });
  const isInChatPage = location.pathname.startsWith("/chat");
  const isInChatPageRef = useRef(isInChatPage);

  // Keep ref updated
  useEffect(() => {
    isInChatPageRef.current = isInChatPage;
  }, [isInChatPage]);

  // Subscribe to new messages globally
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("global-chat-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as { sender_id: string; direct_chat_id?: string; agreement_id?: string };
          
          // Don't play sound for own messages
          if (message.sender_id === user.id) return;
          
          // Only play sound if NOT in chat page
          if (!isInChatPageRef.current) {
            playNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, playNotificationSound]);
};
