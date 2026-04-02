import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface TypingUser {
  user_id: string;
  is_typing: boolean;
  updated_at: string;
}

export function useTypingIndicator(chatId: string | undefined, isDirectChat: boolean = false) {
  const { user } = useAuth();
  const [isCounterpartyTyping, setIsCounterpartyTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingRef = useRef<number>(0);

  // Determine filter column based on chat type
  const filterColumn = isDirectChat ? 'direct_chat_id' : 'agreement_id';

  // Track counterparty typing status
  useEffect(() => {
    if (!chatId || !user) return;

    // Fetch initial typing status
    const fetchTypingStatus = async () => {
      const { data } = await supabase
        .from('chat_typing')
        .select('*')
        .eq(filterColumn, chatId)
        .neq('user_id', user.id)
        .single();

      if (data && data.is_typing) {
        // Check if typing status is recent (within 5 seconds)
        const updatedAt = new Date(data.updated_at).getTime();
        const now = Date.now();
        setIsCounterpartyTyping(now - updatedAt < 5000);
      }
    };

    fetchTypingStatus();

    // Subscribe to typing status changes
    const channel = supabase
      .channel(`typing-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_typing',
          filter: `${filterColumn}=eq.${chatId}`,
        },
        (payload) => {
          const data = payload.new as TypingUser;
          if (data && data.user_id !== user.id) {
            setIsCounterpartyTyping(data.is_typing);
            
            // Auto-reset after 5 seconds if still typing
            if (data.is_typing) {
              setTimeout(() => {
                setIsCounterpartyTyping(false);
              }, 5000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, user, filterColumn]);

  // Send typing status with debounce
  const sendTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!chatId || !user) return;

    // Debounce: don't send too frequently
    const now = Date.now();
    if (isTyping && now - lastTypingRef.current < 2000) return;
    lastTypingRef.current = now;

    try {
      // Build upsert data based on chat type
      const upsertData: Record<string, unknown> = {
        user_id: user.id,
        is_typing: isTyping,
        updated_at: new Date().toISOString(),
      };

      if (isDirectChat) {
        upsertData.direct_chat_id = chatId;
      } else {
        upsertData.agreement_id = chatId;
      }

      // For direct chats, we need to handle the unique constraint differently
      // First try to find existing record
      const { data: existing } = await supabase
        .from('chat_typing')
        .select('id')
        .eq(filterColumn, chatId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from('chat_typing')
          .update({
            is_typing: isTyping,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // Insert new - build proper typed object
        if (isDirectChat) {
          await supabase
            .from('chat_typing')
            .insert({
              direct_chat_id: chatId,
              user_id: user.id,
              is_typing: isTyping,
              updated_at: new Date().toISOString(),
            });
        } else {
          await supabase
            .from('chat_typing')
            .insert({
              agreement_id: chatId,
              user_id: user.id,
              is_typing: isTyping,
              updated_at: new Date().toISOString(),
            });
        }
      }
    } catch (error) {
      console.error('Error sending typing status:', error);
    }
  }, [chatId, user, isDirectChat, filterColumn]);

  // Called when user starts typing
  const startTyping = useCallback(() => {
    sendTypingStatus(true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop typing after 3 seconds of no activity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 3000);
  }, [sendTypingStatus]);

  // Called when user stops typing (e.g., message sent)
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendTypingStatus(false);
  }, [sendTypingStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Reset typing status when leaving chat
      if (chatId && user) {
        supabase
          .from('chat_typing')
          .delete()
          .eq(filterColumn, chatId)
          .eq('user_id', user.id);
      }
    };
  }, [chatId, user, filterColumn]);

  return {
    isCounterpartyTyping,
    startTyping,
    stopTyping,
  };
}
