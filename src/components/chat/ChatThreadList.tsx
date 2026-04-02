import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { ChatThread } from "./ChatRoom";

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
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <MessageCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-2">ยังไม่มีข้อความ</h3>
        <p className="text-sm text-muted-foreground">เริ่มสนทนากับเพื่อนหรือสร้างข้อตกลงใหม่</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {threads.map((thread) => (
        <motion.button
          key={thread.chat_id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onSelectThread(thread)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
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
              <span className="font-semibold text-foreground truncate">
                {thread.counterparty_name}
              </span>
              {thread.last_message_at && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(thread.last_message_at).toLocaleDateString("th-TH", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {thread.last_message || "ยังไม่มีข้อความ"}
            </p>
          </div>

          {/* Unread badge */}
          {thread.unread_count > 0 && (
            <div className="min-w-[20px] h-5 px-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center shrink-0">
              {thread.unread_count}
            </div>
          )}
        </motion.button>
      ))}
    </div>
  );
};
