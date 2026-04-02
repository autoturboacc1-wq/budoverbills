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

      // 1. Fetch agreement-based chats
      const { data: agreements, error: aggError } = await supabase
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
        .in("status", ["active", "pending_confirmation"]);

      if (aggError) throw aggError;

      // 1b. Fetch chat_rooms for agreement metadata
      const agreementIds = (agreements || []).map(a => a.id);
      const { data: chatRooms } = agreementIds.length > 0 ? await supabase
        .from("chat_rooms")
        .select("agreement_id, room_type, has_pending_action, pending_action_type, pending_action_for")
        .in("agreement_id", agreementIds) : { data: [] };

      const chatRoomMap = new Map(
        (chatRooms || []).map(r => [r.agreement_id, r])
      );

      // Process agreement threads
      const agreementPromises = (agreements || []).map(async (agreement) => {
        const isLender = agreement.lender_id === user.id;
        const counterpartyId = isLender ? agreement.borrower_id : agreement.lender_id;
        const roomMeta = chatRoomMap.get(agreement.id);

        let counterpartyName = agreement.borrower_name || "ผู้ยืม";
        let counterpartyAvatar: string | null = null;

        if (counterpartyId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("user_id", counterpartyId)
            .single();

          if (profile) {
            counterpartyName = profile.display_name || counterpartyName;
            counterpartyAvatar = profile.avatar_url;
          }
        }

        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("agreement_id", agreement.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const { count: unreadCount } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .eq("agreement_id", agreement.id)
          .neq("sender_id", user.id)
          .is("read_at", null);

        return {
          chat_id: agreement.id,
          chat_type: "agreement" as const,
          agreement_id: agreement.id,
          // Room metadata from chat_rooms
          room_type: (roomMeta?.room_type || "agreement") as RoomType,
          has_pending_action: roomMeta?.has_pending_action || false,
          pending_action_type: (roomMeta?.pending_action_type || "none") as PendingActionType,
          pending_action_for: roomMeta?.pending_action_for || undefined,
          // Other fields
          counterparty_id: counterpartyId || "",
          counterparty_name: counterpartyName,
          counterparty_avatar: counterpartyAvatar,
          last_message: lastMsg?.content || null,
          last_message_at: lastMsg?.created_at || null,
          unread_count: unreadCount || 0,
          role: isLender ? "lender" as const : "borrower" as const,
          agreement_status: agreement.status,
          principal_amount: agreement.principal_amount,
        };
      });

      // 2. Fetch direct chats
      const { data: directChats, error: dcError } = await supabase
        .from("direct_chats")
        .select("*")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (dcError) throw dcError;

      // 2b. Fetch chat_rooms for direct chat metadata
      const directChatIds = (directChats || []).map(dc => dc.id);
      const { data: directChatRooms } = directChatIds.length > 0 ? await supabase
        .from("chat_rooms")
        .select("direct_chat_id, room_type")
        .in("direct_chat_id", directChatIds) : { data: [] };

      const directRoomMap = new Map(
        (directChatRooms || []).map(r => [r.direct_chat_id, r])
      );

      // Process direct chat threads
      const directChatPromises = (directChats || []).map(async (dc) => {
        const counterpartyId = dc.user1_id === user.id ? dc.user2_id : dc.user1_id;
        const roomMeta = directRoomMap.get(dc.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", counterpartyId)
          .single();

        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("direct_chat_id", dc.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const { count: unreadCount } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .eq("direct_chat_id", dc.id)
          .neq("sender_id", user.id)
          .is("read_at", null);

        return {
          chat_id: dc.id,
          chat_type: "direct" as const,
          direct_chat_id: dc.id,
          // Room metadata
          room_type: (roomMeta?.room_type || "casual") as RoomType,
          // Common fields
          counterparty_id: counterpartyId,
          counterparty_name: profile?.display_name || "ผู้ใช้",
          counterparty_avatar: profile?.avatar_url || null,
          last_message: lastMsg?.content || null,
          last_message_at: lastMsg?.created_at || null,
          unread_count: unreadCount || 0,
        };
      });

      const [agreementThreads, directThreads] = await Promise.all([
        Promise.all(agreementPromises),
        Promise.all(directChatPromises),
      ]);

      allThreads.push(...agreementThreads, ...directThreads);

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
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border"
      >
        <div className="px-4 py-3">
          <h1 className="text-2xl font-bold font-outfit text-foreground">แชท</h1>
        </div>

        {/* Tabs */}
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

      {/* Content */}
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

        const friendsWithDetails = await Promise.all(
          (friendsData || []).map(async (friend) => {
            let avatar_url: string | null = null;
            let unreadCount = 0;

            if (friend.friend_user_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("avatar_url")
                .eq("user_id", friend.friend_user_id)
                .single();
              avatar_url = profile?.avatar_url || null;

              // Check for unread messages in direct chats
              const [id1, id2] = [user.id, friend.friend_user_id].sort();
              const { data: directChat } = await supabase
                .from("direct_chats")
                .select("id")
                .eq("user1_id", id1)
                .eq("user2_id", id2)
                .single();

              if (directChat) {
                const { count } = await supabase
                  .from("messages")
                  .select("id", { count: "exact" })
                  .eq("direct_chat_id", directChat.id)
                  .neq("sender_id", user.id)
                  .is("read_at", null);
                unreadCount = count || 0;
              }
            }

            return { ...friend, avatar_url, unreadCount };
          })
        );

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
        .single();

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
        .single();

      if (createError) {
        console.error("Error creating direct chat:", createError);
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
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <Users className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-2">ยังไม่มีเพื่อน</h3>
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
          เพิ่มเพื่อนจากหน้าโปรไฟล์เพื่อเริ่มสนทนา
        </p>
        <button
          onClick={() => navigate("/profile")}
          className="text-sm text-primary font-medium hover:underline"
        >
          ไปที่โปรไฟล์
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Search bar */}
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
                    navigate("/create-agreement", { 
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
