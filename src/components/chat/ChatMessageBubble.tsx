/**
 * ChatMessageBubble - DUMB COMPONENT (Presentation Only)
 * 
 * ห้าม:
 * - คำนวณว่าใครเป็นผู้ส่ง
 * - มี layout logic (flex, justify)
 * 
 * รับ props แล้ว render อย่างเดียว
 */

export interface Message {
  id: string;
  text: string;
  sender_id: string;
  created_at: string;
}

interface ChatMessageBubbleProps {
  message: Message;
  isMe: boolean;
}

export const ChatMessageBubble = ({ message, isMe }: ChatMessageBubbleProps) => {
  return (
    <div
      className={`
        max-w-[70%]
        px-3 py-2
        rounded-2xl text-sm
        ${isMe
          ? "bg-primary text-primary-foreground rounded-br-none"
          : "bg-muted text-foreground rounded-bl-none"
        }
      `}
    >
      {message.text}
    </div>
  );
};
