import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDirectChatThreadForFriend } from "@/lib/chatThreads";

const chatPageMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: chatPageMocks.rpc,
  },
}));

describe("Chat direct chat helpers", () => {
  beforeEach(() => {
    chatPageMocks.rpc.mockReset();
  });

  it("creates or reuses a direct chat through the RPC and opens the summarized thread", async () => {
    chatPageMocks.rpc.mockImplementation((functionName: string) => {
      if (functionName === "create_direct_chat_room") {
        return Promise.resolve({
          data: { success: true, direct_chat_id: "direct-1" },
          error: null,
        });
      }

      if (functionName === "get_chat_thread_summaries") {
        return Promise.resolve({
          data: [
            {
              chat_id: "direct-1",
              chat_type: "direct",
              agreement_id: null,
              direct_chat_id: "direct-1",
              room_type: "casual",
              has_pending_action: false,
              pending_action_type: "none",
              pending_action_for: null,
              counterparty_id: "friend-1",
              counterparty_name: "Mali",
              counterparty_avatar: "avatar.png",
              last_message: "ล่าสุด",
              last_message_at: "2026-04-25T10:00:00.000Z",
              unread_count: "2",
              role: null,
              agreement_status: null,
              principal_amount: null,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC: ${functionName}`);
    });

    const thread = await createDirectChatThreadForFriend({
      friendUserId: "friend-1",
      friendName: "Fallback",
      friendAvatar: null,
    });

    expect(chatPageMocks.rpc).toHaveBeenNthCalledWith(1, "create_direct_chat_room", {
      p_other_user_id: "friend-1",
    });
    expect(thread).toMatchObject({
      chat_id: "direct-1",
      chat_type: "direct",
      direct_chat_id: "direct-1",
      counterparty_id: "friend-1",
      counterparty_name: "Mali",
      unread_count: 2,
    });
  });
});
