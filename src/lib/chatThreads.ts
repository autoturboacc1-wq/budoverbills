import type { ChatThread } from "@/components/chat/ChatRoom";
import type { PendingActionType, RoomType } from "@/components/chat/ChatThreadList";
import { supabase } from "@/integrations/supabase/client";

export type ChatThreadSummaryRow = {
  chat_id: string;
  chat_type: "agreement" | "direct";
  agreement_id: string | null;
  direct_chat_id: string | null;
  room_type: "debt" | "agreement" | "casual" | null;
  has_pending_action: boolean;
  pending_action_type: "pay" | "confirm" | "extend" | "none" | null;
  pending_action_for: string | null;
  counterparty_id: string;
  counterparty_name: string | null;
  counterparty_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | string | null;
  role: "lender" | "borrower" | null;
  agreement_status: string | null;
  principal_amount: number | null;
};

type ChatThreadSummaryRpcResult = {
  data: ChatThreadSummaryRow[] | null;
  error: { message: string } | null;
};

type CreateDirectChatRoomRpcResult = {
  data: {
    success?: boolean;
    direct_chat_id?: string;
    error?: string;
    message?: string;
  } | null;
  error: { message: string } | null;
};

export const fetchChatThreadSummaries = () =>
  supabase.rpc("get_chat_thread_summaries" as never) as unknown as Promise<ChatThreadSummaryRpcResult>;

export function mapChatThreadSummaryRow(row: ChatThreadSummaryRow): ChatThread {
  return {
    chat_id: row.chat_id,
    chat_type: row.chat_type,
    agreement_id: row.agreement_id || undefined,
    direct_chat_id: row.direct_chat_id || undefined,
    room_type: (row.room_type || "casual") as RoomType,
    has_pending_action: row.has_pending_action,
    pending_action_type: (row.pending_action_type || "none") as PendingActionType,
    pending_action_for: row.pending_action_for || undefined,
    counterparty_id: row.counterparty_id,
    counterparty_name: row.counterparty_name || "ผู้ใช้",
    counterparty_avatar: row.counterparty_avatar,
    last_message: row.last_message || null,
    last_message_at: row.last_message_at || null,
    unread_count: typeof row.unread_count === "string" ? Number(row.unread_count) : row.unread_count || 0,
    role: row.role || undefined,
    agreement_status: row.agreement_status || undefined,
    principal_amount: row.principal_amount ?? undefined,
  };
}

export async function createDirectChatThreadForFriend(params: {
  friendUserId: string;
  friendName: string;
  friendAvatar: string | null;
}): Promise<ChatThread> {
  const { friendUserId, friendName, friendAvatar } = params;
  const { data, error } = (await supabase.rpc("create_direct_chat_room" as never, {
    p_other_user_id: friendUserId,
  } as never)) as unknown as CreateDirectChatRoomRpcResult;

  if (error) throw error;
  if (!data?.success || !data.direct_chat_id) {
    throw new Error(data?.message || data?.error || "ไม่สามารถเริ่มการสนทนาได้");
  }

  const directChatId = data.direct_chat_id;

  try {
    const summariesResult = await fetchChatThreadSummaries();
    if (!summariesResult.error) {
      const summary = summariesResult.data?.find(
        (thread) => thread.chat_type === "direct"
          && (thread.direct_chat_id === directChatId || thread.chat_id === directChatId)
      );

      if (summary) {
        return mapChatThreadSummaryRow(summary);
      }
    }
  } catch (summaryError) {
    console.error("Error refreshing direct chat summary:", summaryError);
  }

  return {
    chat_id: directChatId,
    chat_type: "direct",
    direct_chat_id: directChatId,
    counterparty_id: friendUserId,
    counterparty_name: friendName,
    counterparty_avatar: friendAvatar,
    last_message: null,
    last_message_at: null,
    unread_count: 0,
  };
}
