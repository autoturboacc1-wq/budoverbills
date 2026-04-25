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
      <div className="space-y-2 px-4 py-3">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-[68px] animate-pulse rounded-md border border-border bg-card"
          />
        ))}
        <p className="px-1 pt-1 text-xs text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="px-5 py-8">
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" strokeWidth={1.5} />}
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
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-muted/60 ${
              selectedThreadId === thread.chat_id ? "bg-muted/50" : ""
            }`}
          >
            {/* Avatar */}
            {thread.counterparty_avatar ? (
              <img
                src={thread.counterparty_avatar}
                alt={thread.counterparty_name}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                {thread.counterparty_name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold leading-5 text-foreground">
                      {thread.counterparty_name}
                    </span>
                    {thread.has_pending_action ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary">
                        <CreditCard className="h-2.5 w-2.5" />
                        Action
                      </span>
                    ) : null}
                    {thread.room_type === "debt" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-pending/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-status-pending">
                        <CircleAlert className="h-2.5 w-2.5" />
                        การเงิน
                      </span>
                    ) : null}
                    {thread.chat_type === "direct" ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
                    ) : null}
                  </div>
                </div>
                {thread.last_message_at && (
                  <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                    {new Date(thread.last_message_at).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
              </div>
              <p className="truncate text-xs leading-5 text-muted-foreground">
                {thread.last_message || "ยังไม่มีข้อความ"}
              </p>
              <p className={`text-[11px] font-medium ${isUnread ? "text-primary" : "text-muted-foreground/70"}`}>
                {isUnread ? "ยังไม่อ่าน" : "อ่านแล้ว"}
              </p>
            </div>

            {/* Unread badge */}
            {isUnread && (
              <div className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                {thread.unread_count}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
