/**
 * ChatMessageBubble - DUMB COMPONENT (Presentation Only)
 * 
 * ห้าม:
 * - คำนวณว่าใครเป็นผู้ส่ง
 * - มี layout logic (flex, justify)
 * 
 * รับ props แล้ว render อย่างเดียว
 */

import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

export interface Message {
  id: string;
  text: string;
  sender_id: string;
  created_at: string;
  read_at?: string | null;
  voice_url?: string | null;
  voice_duration?: number | null;
}

interface ChatMessageBubbleProps {
  message: Message;
  isMe: boolean;
}

export const ChatMessageBubble = ({ message, isMe }: ChatMessageBubbleProps) => {
  const readStatus = isMe ? (message.read_at ? "อ่านแล้ว" : "ยังไม่อ่าน") : null;
  const bubble = message.voice_url ? (
    <VoiceMessagePlayer
      duration={message.voice_duration ?? 0}
      isSender={isMe}
      voicePath={message.voice_url}
    />
  ) : (
    <div
      className={`
        max-w-full
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

  return (
    <div className={`flex max-w-[80%] flex-col ${isMe ? "items-end" : "items-start"}`}>
      {bubble}
      {readStatus ? (
        <span className="mt-1 px-1 text-[11px] leading-none text-muted-foreground">
          {readStatus}
        </span>
      ) : null}
    </div>
  );
};
