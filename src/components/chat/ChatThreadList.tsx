import { motion } from "framer-motion";
import { MessageCircle, CircleAlert, CreditCard } from "lucide-react";
import { ChatThread } from "./ChatRoom";
import { EmptyState } from "@/components/ux";

// Re-export types for compatibility
export type { ChatThread };
export type RoomType = "debt" | "agreement" | "casual";
export type PendingActionType = "pay" | "confirm" | "extend" | "none";

interface ChatThreadListProps {
  threads: ChatThread[];
  loading: boolean;
  onSelectThread: (thread: ChatThread) => void;
  selectedThreadId?: string;
}

export const ChatThreadList = ({
  threads,
  loading,
  onSelectThread,
  selectedThreadId,
}: ChatThreadListProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="px-4 py-8">
        <EmptyState
          icon={<MessageCircle className="h-7 w-7" />}
          title="ยังไม่มีข้อความ"
          description="เริ่มสนทนากับเพื่อนหรือสร้างข้อตกลงใหม่ แล้ว thread การเงินจะปรากฏที่นี่"
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {threads.map((thread) => {
        const isUnread = thread.unread_count > 0;

        return (
          <motion.button
            key={thread.chat_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelectThread(thread)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
              selectedThreadId === thread.chat_id ? "bg-muted/50" : ""
            }`}
          >
            {/* Avatar */}
            {thread.counterparty_avatar ? (
              <img
                src={thread.counterparty_avatar}
                alt={thread.counterparty_name}
                className="w-12 h-12 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold shrink-0">
                {thread.counterparty_name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{thread.counterparty_name}</span>
                    {thread.has_pending_action ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <CreditCard className="h-3 w-3" />
                        Action
                      </span>
                    ) : null}
                    {thread.room_type === "debt" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        <CircleAlert className="h-3 w-3" />
                        การเงิน
                      </span>
                    ) : null}
                    {thread.chat_type === "direct" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        แชททั่วไป
                      </span>
                    ) : null}
                  </div>
                </div>
                {thread.last_message_at && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(thread.last_message_at).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">{thread.last_message || "ยังไม่มีข้อความ"}</p>
              <p className={`mt-0.5 text-xs font-medium ${isUnread ? "text-primary" : "text-muted-foreground"}`}>
                {isUnread ? "ยังไม่อ่าน" : "อ่านแล้ว"}
              </p>
            </div>

            {/* Unread badge */}
            {isUnread && (
              <div className="min-w-[20px] h-5 px-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center shrink-0">
                {thread.unread_count}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
