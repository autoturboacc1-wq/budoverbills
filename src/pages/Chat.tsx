import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Users, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BottomNav } from "@/components/BottomNav";
import { ChatThreadList, ChatRoom, ChatThread, RoomType, PendingActionType } from "@/components/chat";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/ux";

type ChatProfileRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type ChatMessageRow = {
  agreement_id: string | null;
  direct_chat_id: string | null;
  sender_id: string;
  read_at: string | null;
  content: string | null;
  created_at: string;
};

type ThreadSummary = {
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

function updateThreadSummary(
  summaryMap: Map<string, ThreadSummary>,
  threadId: string,
  message: ChatMessageRow,
  currentUserId: string
) {
  const existing = summaryMap.get(threadId) ?? {
    last_message: null,
    last_message_at: null,
    unread_count: 0,
  };

  if (
    !existing.last_message_at ||
    new Date(message.created_at).getTime() > new Date(existing.last_message_at).getTime()
  ) {
    existing.last_message = message.content;
    existing.last_message_at = message.created_at;
  }

  if (message.sender_id !== currentUserId && message.read_at === null) {
    existing.unread_count += 1;
  }

  summaryMap.set(threadId, existing);
}

const Chat = () => {
  const { chatId } = useParams(); // Can be agreementId or directChatId
  const navigate = useNavigate();
  const { user } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [activeTab, setActiveTab] = useState<"chats" | "friends">("chats");

  // Fetch all chat threads (both agreement-based and direct chats)
  const fetchThreads = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const allThreads: ChatThread[] = [];

      const [agreementsResult, directChatsResult] = await Promise.all([
        supabase
          .from("debt_agreements")
          .select(`
            id,
            lender_id,
            borrower_id,
            borrower_name,
            status,
            principal_amount
          `)
          .or(`lender_id.eq.${user.id},borrower_id.eq.${user.id}`)
          .in("status", ["active", "pending_confirmation"]),
        supabase
          .from("direct_chats")
          .select("id, user1_id, user2_id")
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
      ]);

      if (agreementsResult.error) throw agreementsResult.error;
      if (directChatsResult.error) throw directChatsResult.error;

      const agreements = agreementsResult.data || [];
      const directChats = directChatsResult.data || [];
      const agreementIds = agreements.map((agreement) => agreement.id);
      const directChatIds = directChats.map((chat) => chat.id);

      const chatRoomsResult = agreementIds.length > 0
        ? await supabase
            .from("chat_rooms")
            .select("agreement_id, room_type, has_pending_action, pending_action_type, pending_action_for")
            .in("agreement_id", agreementIds)
        : {
            data: [] as Array<{
              agreement_id: string;
              room_type: string;
              has_pending_action: boolean;
              pending_action_type: string | null;
              pending_action_for: string | null;
            }>,
            error: null,
          };

      if (chatRoomsResult.error) throw chatRoomsResult.error;

      const counterpartyIds = new Set<string>();
      agreements.forEach((agreement) => {
        if (agreement.lender_id === user.id && agreement.borrower_id) {
          counterpartyIds.add(agreement.borrower_id);
        } else if (agreement.borrower_id) {
          counterpartyIds.add(agreement.lender_id);
        }
      });

      directChats.forEach((chat) => {
        const counterpartyId = chat.user1_id === user.id ? chat.user2_id : chat.user1_id;
        counterpartyIds.add(counterpartyId);
      });

      const profilesResult = counterpartyIds.size > 0
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", Array.from(counterpartyIds))
        : {
            data: [] as ChatProfileRow[],
            error: null,
          };

      if (profilesResult.error) throw profilesResult.error;

      const agreementMessagesResult = agreementIds.length > 0
        ? await supabase
            .from("messages")
            .select("agreement_id, sender_id, read_at, content, created_at")
            .in("agreement_id", agreementIds)
            .order("created_at", { ascending: true })
        : {
            data: [] as ChatMessageRow[],
            error: null,
          };

      if (agreementMessagesResult.error) throw agreementMessagesResult.error;

      const directChatRoomsResult = directChatIds.length > 0
        ? await supabase
            .from("chat_rooms")
            .select("direct_chat_id, room_type")
            .in("direct_chat_id", directChatIds)
        : {
            data: [] as Array<{ direct_chat_id: string; room_type: string }>,
            error: null,
          };

      if (directChatRoomsResult.error) throw directChatRoomsResult.error;

      const directMessagesResult = directChatIds.length > 0
        ? await supabase
            .from("messages")
            .select("direct_chat_id, sender_id, read_at, content, created_at")
            .in("direct_chat_id", directChatIds)
            .order("created_at", { ascending: true })
        : {
            data: [] as ChatMessageRow[],
            error: null,
          };

      if (directMessagesResult.error) throw directMessagesResult.error;

      const chatRoomMap = new Map<string, (typeof chatRoomsResult.data)[number]>();
      (chatRoomsResult.data || []).forEach((room) => {
        chatRoomMap.set(room.agreement_id, room);
      });

      const directRoomMap = new Map<string, (typeof directChatRoomsResult.data)[number]>();
      (directChatRoomsResult.data || []).forEach((room) => {
        directRoomMap.set(room.direct_chat_id, room);
      });
      const profileMap = new Map<string, ChatProfileRow>();
      (profilesResult.data || []).forEach((profile) => {
        profileMap.set(profile.user_id, profile);
      });

      const agreementSummaries = new Map<string, ThreadSummary>();
      (agreementMessagesResult.data || []).forEach((message) => {
        if (!message.agreement_id) return;
        updateThreadSummary(agreementSummaries, message.agreement_id, message, user.id);
      });

      const directSummaries = new Map<string, ThreadSummary>();
      (directMessagesResult.data || []).forEach((message) => {
        if (!message.direct_chat_id) return;
        updateThreadSummary(directSummaries, message.direct_chat_id, message, user.id);
      });

      agreements.forEach((agreement) => {
        const isLender = agreement.lender_id === user.id;
        const counterpartyId = isLender ? agreement.borrower_id : agreement.lender_id;
        const roomMeta = chatRoomMap.get(agreement.id);
        const summary = agreementSummaries.get(agreement.id);
        const counterpartyProfile = counterpartyId ? profileMap.get(counterpartyId) : null;

        allThreads.push({
          chat_id: agreement.id,
          chat_type: "agreement" as const,
          agreement_id: agreement.id,
          room_type: (roomMeta?.room_type || "agreement") as RoomType,
          has_pending_action: roomMeta?.has_pending_action || false,
          pending_action_type: (roomMeta?.pending_action_type || "none") as PendingActionType,
          pending_action_for: roomMeta?.pending_action_for || undefined,
          counterparty_id: counterpartyId || "",
          counterparty_name: counterpartyProfile?.display_name || agreement.borrower_name || "ผู้ยืม",
          counterparty_avatar: counterpartyProfile?.avatar_url || null,
          last_message: summary?.last_message || null,
          last_message_at: summary?.last_message_at || null,
          unread_count: summary?.unread_count || 0,
          role: isLender ? "lender" as const : "borrower" as const,
          agreement_status: agreement.status,
          principal_amount: agreement.principal_amount,
        });
      });

      directChats.forEach((chat) => {
        const counterpartyId = chat.user1_id === user.id ? chat.user2_id : chat.user1_id;
        const roomMeta = directRoomMap.get(chat.id);
        const summary = directSummaries.get(chat.id);
        const profile = profileMap.get(counterpartyId);

        allThreads.push({
          chat_id: chat.id,
          chat_type: "direct" as const,
          direct_chat_id: chat.id,
          room_type: (roomMeta?.room_type || "casual") as RoomType,
          counterparty_id: counterpartyId,
          counterparty_name: profile?.display_name || "ผู้ใช้",
          counterparty_avatar: profile?.avatar_url || null,
          last_message: summary?.last_message || null,
          last_message_at: summary?.last_message_at || null,
          unread_count: summary?.unread_count || 0,
        });
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

  // Realtime subscription for new messages and chat_rooms updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("chat-threads-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          fetchThreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_chats",
        },
        () => {
          fetchThreads();
        }
      )
      // Listen for chat_rooms updates (action status changes)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_rooms",
        },
        () => {
          fetchThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchThreads]);

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
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border"
      >
        <div className="px-4">
          <PageHeader
            title="Inbox"
            description="Thread ที่เกี่ยวกับการเงินจะถูกจัดไว้ด้านบนก่อนการคุยทั่วไป"
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
              {threads.reduce((acc, t) => acc + t.unread_count, 0) > 0 && (
                <span className="ml-2 min-w-[20px] h-5 px-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center">
                  {threads.reduce((acc, t) => acc + t.unread_count, 0)}
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

      <BottomNav />
    </div>
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
        const { data: friendsData, error } = await supabase
          .from("friends")
          .select("id, friend_user_id, friend_name, nickname")
          .eq("user_id", user.id);

        if (error) throw error;

        const friendIds = (friendsData || [])
          .map((friend) => friend.friend_user_id)
          .filter((friendId): friendId is string => Boolean(friendId));

        const [profilesResult, directChatsResult] = await Promise.all([
          friendIds.length > 0
            ? supabase
                .from("profiles")
                .select("user_id, avatar_url")
                .in("user_id", friendIds)
            : Promise.resolve({ data: [] as Array<{ user_id: string; avatar_url: string | null }> }),
          supabase
            .from("direct_chats")
            .select("id, user1_id, user2_id")
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
        ]);

        if (directChatsResult.error) throw directChatsResult.error;
        if (profilesResult && "error" in profilesResult && profilesResult.error) {
          throw profilesResult.error;
        }

        const directChatByCounterparty = new Map<string, string>();
        (directChatsResult.data || []).forEach((directChat) => {
          const counterpartyId = directChat.user1_id === user.id ? directChat.user2_id : directChat.user1_id;
          directChatByCounterparty.set(counterpartyId, directChat.id);
        });

        const directChatIds = Array.from(directChatByCounterparty.values());
        const unreadMessagesResult = directChatIds.length > 0
          ? await supabase
              .from("messages")
              .select("direct_chat_id, sender_id, read_at")
              .in("direct_chat_id", directChatIds)
          : { data: [] as Array<{ direct_chat_id: string | null; sender_id: string; read_at: string | null }> };

        if ("error" in unreadMessagesResult && unreadMessagesResult.error) {
          throw unreadMessagesResult.error;
        }

        const profileMap = new Map<string, string | null>();
        (profilesResult.data || []).forEach((profile) => {
          profileMap.set(profile.user_id, profile.avatar_url);
        });

        const unreadCountMap = new Map<string, number>();
        (unreadMessagesResult.data || []).forEach((message) => {
          if (!message.direct_chat_id) return;
          if (message.sender_id === user.id || message.read_at !== null) return;
          unreadCountMap.set(message.direct_chat_id, (unreadCountMap.get(message.direct_chat_id) || 0) + 1);
        });

        const friendsWithDetails = (friendsData || []).map((friend) => {
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
        console.error("Error creating direct chat:", createError);
        toast.error("ไม่สามารถเริ่มการสนทนาได้");
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
