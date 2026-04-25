import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessageBubble, Message } from "./ChatMessageBubble";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { VoiceRecorder } from "./VoiceRecorder";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useRefreshUnreadChatMessageCount } from "@/hooks/useGlobalChatNotification";
import { toast } from "sonner";

/**
 * ChatRoom - เจ้าของ logic ทั้งหมด
 * 
 * - คำนวณ isMe
 * - คุม layout ซ้าย/ขวา
 * - map messages
 * - ส่ง isMe เข้า ChatMessageBubble
 */

// ChatThread type (simplified for new architecture)
export interface ChatThread {
  chat_id: string;
  chat_type: "agreement" | "direct";
  agreement_id?: string;
  direct_chat_id?: string;
  counterparty_id: string;
  counterparty_name: string;
  counterparty_avatar?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  // Optional fields for compatibility
  room_type?: "debt" | "agreement" | "casual";
  has_pending_action?: boolean;
  pending_action_type?: "pay" | "confirm" | "extend" | "none";
  pending_action_for?: string;
  role?: "lender" | "borrower";
  agreement_status?: string;
  principal_amount?: number;
}

interface ChatRoomProps {
  thread: ChatThread;
  onBack: () => void;
  onMessagesRead?: (chatId: string) => void;
}

type MarkMessagesReadRpcResult = {
  data: { success?: boolean; error?: string; updated_count?: number } | null;
  error: { message: string } | null;
};

export const ChatRoom = ({ thread, onBack, onMessagesRead }: ChatRoomProps) => {
  const PAGE_SIZE = 50;
  const { user } = useAuth();
  const refreshUnreadChatMessageCount = useRefreshUnreadChatMessageCount();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ==============================
  // CURRENT USER ID (from auth session)
  // ==============================
  const currentUserId = user?.id;
  const isDirectChat = thread.chat_type === "direct";
  const activeChatId = isDirectChat ? thread.direct_chat_id ?? thread.chat_id : thread.agreement_id ?? thread.chat_id;
  const { isCounterpartyTyping, startTyping, stopTyping } = useTypingIndicator(activeChatId, isDirectChat);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const markMessagesRead = useCallback(async () => {
    if (!currentUserId || !activeChatId) return;

    const { data, error } = (await supabase.rpc("mark_chat_messages_read" as never, {
      p_agreement_id: isDirectChat ? null : activeChatId,
      p_direct_chat_id: isDirectChat ? activeChatId : null,
    } as never)) as unknown as MarkMessagesReadRpcResult;

    if (error) throw error;
    if (data?.success === false) {
      throw new Error(data.error || "Unable to mark chat messages as read");
    }

    onMessagesRead?.(thread.chat_id);
    await refreshUnreadChatMessageCount(currentUserId);
  }, [activeChatId, currentUserId, isDirectChat, onMessagesRead, refreshUnreadChatMessageCount, thread.chat_id]);

  // Fetch messages from database
  const fetchMessages = useCallback(async () => {
    if (!thread || !user) return;

    try {
      setLoading(true);

      const isDirectChat = thread.chat_type === "direct";
      let query = supabase
        .from("messages")
        .select("id, content, sender_id, created_at, read_at, voice_url, voice_duration")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (isDirectChat) {
        if (!thread.direct_chat_id) return;
        query = query.eq("direct_chat_id", thread.direct_chat_id);
      } else {
        if (!thread.agreement_id) return;
        query = query.eq("agreement_id", thread.agreement_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Map to Message interface (content -> text)
      const mappedMessages: Message[] = ((data || []).slice().reverse()).map((m) => ({
        id: m.id,
        text: m.content,
        sender_id: m.sender_id,
        created_at: m.created_at,
        read_at: (m as { read_at?: string | null }).read_at ?? null,
        voice_url: (m as { voice_url?: string | null }).voice_url ?? null,
        voice_duration: (m as { voice_duration?: number | null }).voice_duration ?? null,
      }));

      setMessages(mappedMessages);
      setHasMoreMessages((data?.length || 0) === PAGE_SIZE);

      await markMessagesRead().catch((readError) => {
        console.error("Error marking messages as read:", readError);
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  }, [markMessagesRead, thread, user]);

  const loadOlderMessages = useCallback(async () => {
    if (!thread || !user || loadingOlder || messages.length === 0) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setLoadingOlder(true);
    try {
      const isDirectChat = thread.chat_type === "direct";
      let query = supabase
        .from("messages")
        .select("id, content, sender_id, created_at, read_at, voice_url, voice_duration")
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (isDirectChat) {
        if (!thread.direct_chat_id) return;
        query = query.eq("direct_chat_id", thread.direct_chat_id);
      } else {
        if (!thread.agreement_id) return;
        query = query.eq("agreement_id", thread.agreement_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const olderMessages: Message[] = ((data || []).slice().reverse()).map((m) => ({
        id: m.id,
        text: m.content,
        sender_id: m.sender_id,
        created_at: m.created_at,
        read_at: (m as { read_at?: string | null }).read_at ?? null,
        voice_url: (m as { voice_url?: string | null }).voice_url ?? null,
        voice_duration: (m as { voice_duration?: number | null }).voice_duration ?? null,
      }));

      setMessages((prev) => {
        const existingIds = new Set(prev.map((message) => message.id));
        const dedupedOlder = olderMessages.filter((message) => !existingIds.has(message.id));
        return [...dedupedOlder, ...prev];
      });
      setHasMoreMessages((data?.length || 0) === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading older messages:", error);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, messages, thread, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Scroll on new messages
  useEffect(() => {
    if (!loading) {
      scrollToBottom();
    }
  }, [messages, loading]);

  // Realtime subscription
  useEffect(() => {
    if (!thread || !user) return;

    const isDirectChat = thread.chat_type === "direct";
    const filterColumn = isDirectChat ? "direct_chat_id" : "agreement_id";
    const filterId = isDirectChat ? thread.direct_chat_id : thread.agreement_id;

    if (!filterId) return;

    const channel = supabase
      .channel(`chat-${thread.chat_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `${filterColumn}=eq.${filterId}`,
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string;
            content: string;
            sender_id: string;
            created_at: string;
            read_at?: string | null;
            voice_url?: string | null;
            voice_duration?: number | null;
          };
          const mapped: Message = {
            id: newMsg.id,
            text: newMsg.content,
            sender_id: newMsg.sender_id,
            created_at: newMsg.created_at,
            read_at: newMsg.read_at ?? null,
            voice_url: newMsg.voice_url ?? null,
            voice_duration: newMsg.voice_duration ?? null,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === mapped.id)) return prev;
            return [...prev, mapped];
          });
          if (newMsg.sender_id !== user.id) {
            void markMessagesRead().catch((readError) => {
              console.error("Error marking realtime message as read:", readError);
            });
          }
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `${filterColumn}=eq.${filterId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as {
            id: string;
            read_at?: string | null;
          };

          setMessages((prev) =>
            prev.map((message) =>
              message.id === updatedMsg.id
                ? { ...message, read_at: updatedMsg.read_at ?? null }
                : message
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [markMessagesRead, thread, user]);

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() || !user || !thread) return;

    setSending(true);
    try {
      const isDirectChat = thread.chat_type === "direct";
      const messageData = {
        sender_id: user.id,
        content: inputText.trim(),
        agreement_id: isDirectChat ? null : thread.agreement_id,
        direct_chat_id: isDirectChat ? thread.direct_chat_id : null,
      };

      const { error } = await supabase.from("messages").insert([messageData]);
      if (error) throw error;

      setInputText("");
      stopTyping();
      await markMessagesRead().catch((readError) => {
        console.error("Error marking messages as read after send:", readError);
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  const handleVoiceReady = async (voicePath: string, duration: number) => {
    if (!user || !thread) return;

    setSending(true);

    try {
      const isDirectChat = thread.chat_type === "direct";
      const voiceMessageData = {
        sender_id: user.id,
        content: "🎤 ข้อความเสียง",
        agreement_id: isDirectChat ? null : thread.agreement_id,
        direct_chat_id: isDirectChat ? thread.direct_chat_id : null,
        voice_url: voicePath,
        voice_duration: duration,
      };

      const { error } = await supabase.from("messages").insert([voiceMessageData]);

      if (error) throw error;

      setShowVoiceRecorder(false);
      stopTyping();
    } catch (error) {
      console.error("Error sending voice note:", error);
      toast.error("ส่งข้อความเสียงไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };

  // Guard: require authenticated user
  if (!user || !currentUserId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          {thread.counterparty_avatar ? (
            <img
              src={thread.counterparty_avatar}
              alt={thread.counterparty_name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold">
              {thread.counterparty_name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-foreground">{thread.counterparty_name}</span>
        </div>
      </header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-2 py-4 bg-muted/20">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">กำลังโหลด...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <span className="text-3xl">👋</span>
            </div>
            <p className="text-muted-foreground">ส่งข้อความแรกเพื่อเริ่มสนทนา</p>
          </div>
        ) : (
          <>
            {hasMoreMessages && (
              <div className="mb-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? "กำลังโหลด..." : "โหลดข้อความเก่า"}
                </Button>
              </div>
            )}
            {/* ==============================
                CORE LOGIC: ChatRoom owns layout
                isMe = message.sender_id === currentUserId
                isMe → justify-end (ขวา)
                !isMe → justify-start (ซ้าย)
            ============================== */}
            {messages.map((message) => {
              const isMe = message.sender_id === currentUserId;

              return (
                <div
                  key={message.id}
                  className={`w-full flex ${isMe ? "justify-end" : "justify-start"} px-2 mb-2`}
                >
                  <ChatMessageBubble message={message} isMe={isMe} />
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background px-4 py-3">
        {isCounterpartyTyping ? (
          <p className="mb-2 px-1 text-xs text-muted-foreground">
            {thread.counterparty_name} กำลังพิมพ์...
          </p>
        ) : null}
        <div className="flex items-center gap-2">
        {showVoiceRecorder ? (
          <VoiceRecorder
            chatId={thread.chat_id}
            onCancel={() => {
              setShowVoiceRecorder(false);
              stopTyping();
            }}
            onVoiceReady={handleVoiceReady}
            ownerId={user.id}
          />
        ) : (
          <>
            <Button
              disabled={sending}
              onClick={() => setShowVoiceRecorder(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Mic className="w-5 h-5" />
            </Button>
            <Input
              value={inputText}
              onChange={(e) => {
                const nextValue = e.target.value;
                setInputText(nextValue);
                if (nextValue.trim()) {
                  startTyping();
                } else {
                  stopTyping();
                }
              }}
              placeholder="พิมพ์ข้อความ..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button onClick={handleSend} disabled={!inputText.trim() || sending} size="icon">
              <Send className="w-5 h-5" />
            </Button>
          </>
        )}
        </div>
      </div>
    </div>
  );
};
