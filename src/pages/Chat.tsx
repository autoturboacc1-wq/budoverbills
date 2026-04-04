import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Users, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChatThreadList, ChatRoom, ChatThread, RoomType, PendingActionType } from "@/components/chat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/ux";
import { PageTransition } from "@/components/ux/PageTransition";

type ChatThreadSummaryRow = {
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

interface ChatTargets {
  agreementIds: string[];
  directChatIds: string[];
}

function uniqueStrings(values?: Array<string | null | undefined>): string[] {
  return Array.from(new Set((values ?? []).filter((value): value is string => Boolean(value))));
}

const fetchChatThreadSummaries = () =>
  supabase.rpc("get_chat_thread_summaries" as never) as unknown as Promise<ChatThreadSummaryRpcResult>;

const Chat = () => {
  const { chatId } = useParams(); // Can be agreementId or directChatId
  const navigate = useNavigate();
  const { user } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [activeTab, setActiveTab] = useState<"chats" | "friends">("chats");
  const [chatTargets, setChatTargets] = useState<ChatTargets>({
    agreementIds: [],
    directChatIds: [],
  });
  const totalUnreadCount = useMemo(() => threads.reduce((acc, t) => acc + t.unread_count, 0), [threads]);

  // Fetch all chat threads (both agreement-based and direct chats)
  const fetchThreads = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await fetchChatThreadSummaries();

      if (error) throw error;

      const allThreads: ChatThread[] = (data || []).map((row: ChatThreadSummaryRow) => ({
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
        unread_count:
          typeof row.unread_count === "string" ? Number(row.unread_count) : row.unread_count || 0,
        role: row.role || undefined,
        agreement_status: row.agreement_status || undefined,
        principal_amount: row.principal_amount ?? undefined,
      }));

      setChatTargets({
        agreementIds: uniqueStrings((data || []).filter((row) => row.chat_type === "agreement").map((row) => row.agreement_id)),
        directChatIds: uniqueStrings((data || []).filter((row) => row.chat_type === "direct").map((row) => row.direct_chat_id)),
      });

      // Sort: pending actions first (debt with pending action), then by last message time
      allThreads.sort((a, b) => {
        // Priority 1: Debt with pending action for current user
        const aHasAction = a.room_type === "debt" && a.has_pending_action && a.pending_action_for === user.id;
        const bHasAction = b.room_type === "debt" && b.has_pending_action && b.pending_action_for === user.id;
        if (aHasAction && !bHasAction) return -1;
        if (!aHasAction && bHasAction) return 1;
        
        // Priority 2: Any pending action
        if (a.has_pending_action && !b.has_pending_action) return -1;
        if (!a.has_pending_action && b.has_pending_action) return 1;
        
        // Priority 3: By last message time
        if (!a.last_message_at && !b.last_message_at) return 0;
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setThreads(allThreads);

      // If chatId is provided, select that thread
      if (chatId) {
        const thread = allThreads.find((t) => t.chat_id === chatId);
        if (thread) {
          setSelectedThread(thread);
        }
      }
    } catch (error) {
      console.error("Error fetching threads:", error);
    } finally {
      setLoading(false);
    }
  }, [user, chatId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Realtime subscription for thread list updates only.
  useEffect(() => {
    if (!user || selectedThread) return;

    const channel = supabase
      .channel("chat-threads-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `lender_id=eq.${user.id}`,
        },
        () => {
          fetchThreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `borrower_id=eq.${user.id}`,
        },
        () => {
          fetchThreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user1_id=eq.${user.id}`,
        },
        () => {
          fetchThreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user2_id=eq.${user.id}`,
        },
        () => {
          fetchThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchThreads, selectedThread, user]);

  useEffect(() => {
    if (!user || selectedThread) return;
    if (chatTargets.agreementIds.length === 0 && chatTargets.directChatIds.length === 0) return;

    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    const refreshThreads = () => {
      void fetchThreads();
    };

    chatTargets.agreementIds.forEach((agreementId) => {
      const channel = supabase
        .channel(`chat-thread-agreement-${user.id}-${agreementId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `agreement_id=eq.${agreementId}`,
          },
          refreshThreads
        )
        .subscribe();

      channels.push(channel);
    });

    chatTargets.directChatIds.forEach((directChatId) => {
      const channel = supabase
        .channel(`chat-thread-direct-${user.id}-${directChatId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `direct_chat_id=eq.${directChatId}`,
          },
          refreshThreads
        )
        .subscribe();

      channels.push(channel);
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [chatTargets.agreementIds, chatTargets.directChatIds, fetchThreads, selectedThread, user]);

  const handleSelectThread = (thread: ChatThread) => {
    setSelectedThread(thread);
    navigate(`/chat/${thread.chat_id}`, { replace: true });
  };

  const handleBack = () => {
    setSelectedThread(null);
    navigate("/chat", { replace: true });
  };

  // If a thread is selected, show the chat room
  if (selectedThread) {
    return <ChatRoom thread={selectedThread} onBack={handleBack} />;
  }

  // Thread list view with tabs
  return (
    <PageTransition>
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border"
      >
        <div className="px-4">
          <PageHeader
            title="กล่องข้อความ"
            description="บทสนทนาที่เกี่ยวกับการเงินจะแสดงไว้ด้านบนก่อนแชททั่วไป"
            className="py-4"
          />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chats" | "friends")} className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-transparent border-b border-border rounded-none h-auto p-0">
            <TabsTrigger
              value="chats"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              ข้อความ
              {totalUnreadCount > 0 && (
                <span className="ml-2 min-w-[20px] h-5 px-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center">
                  {totalUnreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="friends"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3"
            >
              <Users className="w-4 h-4 mr-2" />
              เพื่อน
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.header>

      <main className="flex-1">
        {activeTab === "chats" ? (
          <ChatThreadList
            threads={threads}
            loading={loading}
            onSelectThread={handleSelectThread}
            selectedThreadId={chatId}
          />
        ) : (
          <FriendsList onStartChat={(thread) => {
            setSelectedThread(thread);
            navigate(`/chat/${thread.chat_id}`, { replace: true });
          }} />
        )}
      </main>

    </div>
    </PageTransition>
  );
};

// Friends List Component with direct chat support
interface FriendsListProps {
  onStartChat: (thread: ChatThread) => void;
}

const FriendsList = ({ onStartChat }: FriendsListProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Array<{
    id: string;
    friend_user_id: string | null;
    friend_name: string;
    nickname: string | null;
    avatar_url: string | null;
    unreadCount: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startingChat, setStartingChat] = useState<string | null>(null);

  useEffect(() => {
    const fetchFriends = async () => {
      if (!user) return;

      try {
        const [friendsResult, summariesResult] = await Promise.all([
          supabase
            .from("friends")
            .select("id, friend_user_id, friend_name, nickname")
            .eq("user_id", user.id),
          fetchChatThreadSummaries(),
        ]);

        if (friendsResult.error) throw friendsResult.error;
        if (summariesResult.error) throw summariesResult.error;

        const profileMap = new Map<string, string | null>();
        const friendsData = friendsResult.data || [];
        const friendIds = friendsData
          .map((friend) => friend.friend_user_id)
          .filter((friendId): friendId is string => Boolean(friendId));

        if (friendIds.length > 0) {
          const { data: profilesData, error } = await supabase
            .from("profiles")
            .select("user_id, avatar_url")
            .in("user_id", friendIds);

          if (error) throw error;

          (profilesData || []).forEach((profile) => {
            profileMap.set(profile.user_id, profile.avatar_url);
          });
        }

        const directChatByCounterparty = new Map<string, string>();
        const unreadCountMap = new Map<string, number>();
        (summariesResult.data || [])
          .filter((thread: ChatThreadSummaryRow) => thread.chat_type === "direct")
          .forEach((thread: ChatThreadSummaryRow) => {
            const directChatId = thread.direct_chat_id || thread.chat_id;
            directChatByCounterparty.set(thread.counterparty_id, directChatId);
            unreadCountMap.set(
              directChatId,
              typeof thread.unread_count === "string" ? Number(thread.unread_count) : thread.unread_count || 0
            );
          });

        const friendsWithDetails = friendsData.map((friend) => {
          const avatar_url = friend.friend_user_id ? profileMap.get(friend.friend_user_id) || null : null;
          const directChatId = friend.friend_user_id ? directChatByCounterparty.get(friend.friend_user_id) : null;
          const unreadCount = directChatId ? unreadCountMap.get(directChatId) || 0 : 0;

          return { ...friend, avatar_url, unreadCount };
        });

        setFriends(friendsWithDetails);
      } catch (error) {
        console.error("Error fetching friends:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
  }, [user]);

  // Start or get direct chat with a friend
  const startDirectChat = async (friendUserId: string, friendName: string, friendAvatar: string | null) => {
    if (!user || !friendUserId) return;

    setStartingChat(friendUserId);

    try {
      // Order user IDs to match the constraint (user1_id < user2_id)
      const [user1_id, user2_id] = [user.id, friendUserId].sort();

      // Try to find existing direct chat
      const { data: existingChat, error: findError } = await supabase
        .from("direct_chats")
        .select("*")
        .eq("user1_id", user1_id)
        .eq("user2_id", user2_id)
        .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (existingChat) {
        // Direct chat exists, navigate to it
        const thread: ChatThread = {
          chat_id: existingChat.id,
          chat_type: "direct",
          direct_chat_id: existingChat.id,
          counterparty_id: friendUserId,
          counterparty_name: friendName,
          counterparty_avatar: friendAvatar,
          last_message: null,
          last_message_at: null,
          unread_count: 0,
        };
        onStartChat(thread);
        return;
      }

      // Create new direct chat
      const { data: newChat, error: createError } = await supabase
        .from("direct_chats")
        .insert({ user1_id, user2_id })
        .select()
        .maybeSingle();

      if (createError) {
        const isDuplicateError = "code" in createError && createError.code === "23505";

        if (!isDuplicateError) {
          console.error("Error creating direct chat:", createError);
          toast.error("ไม่สามารถเริ่มการสนทนาได้");
          return;
        }

        const { data: racedChat, error: refetchError } = await supabase
          .from("direct_chats")
          .select("*")
          .eq("user1_id", user1_id)
          .eq("user2_id", user2_id)
          .maybeSingle();

        if (refetchError || !racedChat) {
          console.error("Error refetching raced direct chat:", refetchError);
          toast.error("ไม่สามารถเริ่มการสนทนาได้");
          return;
        }

        const racedThread: ChatThread = {
          chat_id: racedChat.id,
          chat_type: "direct",
          direct_chat_id: racedChat.id,
          counterparty_id: friendUserId,
          counterparty_name: friendName,
          counterparty_avatar: friendAvatar,
          last_message: null,
          last_message_at: null,
          unread_count: 0,
        };
        onStartChat(racedThread);
        return;
      }

      if (!newChat) {
        toast.error("ไม่สามารถเริ่มการสนทนาได้");
        return;
      }

      const thread: ChatThread = {
        chat_id: newChat.id,
        chat_type: "direct",
        direct_chat_id: newChat.id,
        counterparty_id: friendUserId,
        counterparty_name: friendName,
        counterparty_avatar: friendAvatar,
        last_message: null,
        last_message_at: null,
        unread_count: 0,
      };
      onStartChat(thread);
    } catch (error) {
      console.error("Error starting direct chat:", error);
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setStartingChat(null);
    }
  };

  // Filter friends by search query
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const query = searchQuery.toLowerCase().trim();
    return friends.filter((friend) => {
      const name = friend.friend_name.toLowerCase();
      const nickname = (friend.nickname || "").toLowerCase();
      return name.includes(query) || nickname.includes(query);
    });
  }, [friends, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="px-4 py-10">
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="ยังไม่มีเพื่อน"
          description="เพิ่มเพื่อนจากหน้าโปรไฟล์ก่อน แล้วคุณจะเริ่มคุยหรือสร้างข้อตกลงได้ทันที"
          action={
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="text-sm font-medium text-primary hover:underline"
            >
              ไปที่โปรไฟล์
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="ค้นหาเพื่อน..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {filteredFriends.length === 0 && searchQuery ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <p className="text-muted-foreground">ไม่พบเพื่อนที่ค้นหา</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filteredFriends.map((friend, index) => (
            <motion.div
              key={friend.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                startingChat === friend.friend_user_id ? "opacity-50" : ""
              }`}
              onClick={() => {
                if (friend.friend_user_id && !startingChat) {
                  startDirectChat(friend.friend_user_id, friend.nickname || friend.friend_name, friend.avatar_url);
                }
              }}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  {friend.avatar_url ? (
                    <img
                      src={friend.avatar_url}
                      alt={friend.friend_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-primary text-lg font-semibold">
                      {friend.friend_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {/* Unread badge on avatar */}
                {friend.unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-xs font-medium rounded-full flex items-center justify-center">
                    {friend.unreadCount > 99 ? "99+" : friend.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {friend.nickname || friend.friend_name}
                </p>
                {friend.nickname ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {friend.friend_name}
                  </p>
                ) : (
                  <p className="text-xs text-primary/70 truncate flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    แตะเพื่อสนทนา
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Create agreement button - stop propagation to prevent row click */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/create", { 
                      state: { 
                        selectedFriend: { 
                          id: friend.id, 
                          friend_user_id: friend.friend_user_id,
                          friend_name: friend.friend_name 
                        } 
                      } 
                    });
                  }}
                  className="text-xs text-primary font-medium px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  สร้างข้อตกลง
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Chat;
