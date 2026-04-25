import React from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushReact, renderReact } from "@/test/reactHarness";
import { ChatRoom, type ChatThread } from "@/components/chat/ChatRoom";

const chatRoomMocks = vi.hoisted(() => ({
  user: { id: "user-1" },
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  insert: vi.fn(),
  messageInsertCallback: undefined as undefined | ((payload: { new: unknown }) => void),
  startTyping: vi.fn(),
  stopTyping: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: chatRoomMocks.user }),
}));

vi.mock("@/hooks/useTypingIndicator", () => ({
  useTypingIndicator: () => ({
    isCounterpartyTyping: false,
    startTyping: chatRoomMocks.startTyping,
    stopTyping: chatRoomMocks.stopTyping,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: chatRoomMocks.toastError,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: chatRoomMocks.rpc,
    from: chatRoomMocks.from,
    channel: chatRoomMocks.channel,
    removeChannel: chatRoomMocks.removeChannel,
  },
}));

function createMessagesQuery(messages: unknown[]) {
  const query = {
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    lt: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve({ data: messages, error: null })),
  };

  return query;
}

function setupSupabaseMessages(messages: unknown[]) {
  const messagesQuery = createMessagesQuery(messages);

  chatRoomMocks.from.mockImplementation((table: string) => {
    if (table !== "messages") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: vi.fn(() => messagesQuery),
      insert: chatRoomMocks.insert,
    };
  });

  return messagesQuery;
}

function setupRealtimeChannel() {
  const channel = {
    on: vi.fn((_event: string, _config: unknown, callback: (payload: { new: unknown }) => void) => {
      chatRoomMocks.messageInsertCallback = callback;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };

  chatRoomMocks.channel.mockReturnValue(channel);
  return channel;
}

async function flushEffects() {
  await flushReact();
  await flushReact();
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ChatRoom", () => {
  const agreementThread: ChatThread = {
    chat_id: "agreement-1",
    chat_type: "agreement",
    agreement_id: "agreement-1",
    counterparty_id: "user-2",
    counterparty_name: "Niran",
    unread_count: 1,
  };

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });

    chatRoomMocks.rpc.mockReset();
    chatRoomMocks.from.mockReset();
    chatRoomMocks.channel.mockReset();
    chatRoomMocks.removeChannel.mockReset();
    chatRoomMocks.insert.mockReset();
    chatRoomMocks.messageInsertCallback = undefined;
    chatRoomMocks.startTyping.mockReset();
    chatRoomMocks.stopTyping.mockReset();
    chatRoomMocks.toastError.mockReset();

    chatRoomMocks.rpc.mockResolvedValue({ data: { success: true, updated_count: 1 }, error: null });
    chatRoomMocks.insert.mockResolvedValue({ error: null });
    setupRealtimeChannel();
  });

  it("fetches messages and marks unread counterparty messages through the RPC", async () => {
    setupSupabaseMessages([
      {
        id: "message-1",
        content: "สวัสดี",
        sender_id: "user-2",
        created_at: "2026-04-25T10:00:00.000Z",
        voice_url: null,
        voice_duration: null,
      },
    ]);

    const { container, unmount } = await renderReact(<ChatRoom thread={agreementThread} onBack={vi.fn()} />);
    await flushEffects();

    expect(container.textContent).toContain("สวัสดี");
    expect(chatRoomMocks.rpc).toHaveBeenCalledWith("mark_chat_messages_read", {
      p_agreement_id: "agreement-1",
      p_direct_chat_id: null,
    });

    await unmount();
  });

  it("sends direct text messages with the direct chat id and stops typing", async () => {
    setupSupabaseMessages([]);

    const directThread: ChatThread = {
      chat_id: "direct-1",
      chat_type: "direct",
      direct_chat_id: "direct-1",
      counterparty_id: "user-2",
      counterparty_name: "Mali",
      unread_count: 0,
    };

    const { container, unmount } = await renderReact(<ChatRoom thread={directThread} onBack={vi.fn()} />);
    await flushEffects();

    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      setInputValue(input, "hello");
    });
    await flushReact();

    const sendButton = Array.from(container.querySelectorAll("button")).at(-1);
    await act(async () => {
      sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    expect(chatRoomMocks.insert).toHaveBeenCalledWith([
      {
        sender_id: "user-1",
        content: "hello",
        agreement_id: null,
        direct_chat_id: "direct-1",
      },
    ]);
    expect(chatRoomMocks.stopTyping).toHaveBeenCalled();

    await unmount();
  });

  it("appends realtime counterparty messages and marks them read", async () => {
    setupSupabaseMessages([]);

    const { container, unmount } = await renderReact(<ChatRoom thread={agreementThread} onBack={vi.fn()} />);
    await flushEffects();
    chatRoomMocks.rpc.mockClear();

    await act(async () => {
      chatRoomMocks.messageInsertCallback?.({
        new: {
          id: "message-2",
          content: "incoming",
          sender_id: "user-2",
          created_at: "2026-04-25T10:01:00.000Z",
          voice_url: null,
          voice_duration: null,
        },
      });
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.textContent).toContain("incoming");
    expect(chatRoomMocks.rpc).toHaveBeenCalledWith("mark_chat_messages_read", {
      p_agreement_id: "agreement-1",
      p_direct_chat_id: null,
    });

    await unmount();
  });
});
