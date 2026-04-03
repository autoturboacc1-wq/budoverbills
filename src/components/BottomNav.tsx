import { motion } from "framer-motion";
import { CalendarCheck, User, Bell, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  icon?: React.ElementType;
  label: string;
  path: string;
  isLogo?: boolean;
  badge?: number;
}

interface ChatTargets {
  agreementIds: string[];
  directChatIds: string[];
}

function uniqueStrings(values?: Array<string | null | undefined>): string[] {
  return Array.from(new Set((values ?? []).filter((value): value is string => Boolean(value))));
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { notifications } = useNotifications();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [chatTargets, setChatTargets] = useState<ChatTargets>({
    agreementIds: [],
    directChatIds: [],
  });

  const unreadNotifications = notifications?.filter(n => !n.is_read).length || 0;
  const userId = user?.id ?? null;

  const refreshChatTargets = useCallback(async () => {
    if (!userId) {
      setUnreadMessages(0);
      setChatTargets({ agreementIds: [], directChatIds: [] });
      return;
    }

    const [agreementsResult, directChatsResult] = await Promise.all([
      supabase
        .from("debt_agreements")
        .select("id")
        .or(`lender_id.eq.${userId},borrower_id.eq.${userId}`)
        .in("status", ["active", "pending", "pending_transfer", "pending_confirmation"]),
      supabase
        .from("direct_chats")
        .select("id")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
    ]);

    const agreementIds = uniqueStrings(agreementsResult.data?.map((agreement) => agreement.id));
    const directChatIds = uniqueStrings(directChatsResult.data?.map((chat) => chat.id));

    const [agreementCountResult, directCountResult] = await Promise.all([
      agreementIds.length > 0
        ? supabase
            .from("messages")
            .select("id", { count: "exact" })
            .in("agreement_id", agreementIds)
            .neq("sender_id", userId)
            .is("read_at", null)
        : Promise.resolve({ count: 0 }),
      directChatIds.length > 0
        ? supabase
            .from("messages")
            .select("id", { count: "exact" })
            .in("direct_chat_id", directChatIds)
            .neq("sender_id", userId)
            .is("read_at", null)
        : Promise.resolve({ count: 0 }),
    ]);

    setUnreadMessages((agreementCountResult.count || 0) + (directCountResult.count || 0));
    setChatTargets({ agreementIds, directChatIds });
  }, [userId]);

  useEffect(() => {
    void refreshChatTargets();
  }, [refreshChatTargets]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`bottom-nav-room-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `lender_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `borrower_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user1_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_chats",
          filter: `user2_id=eq.${userId}`,
        },
        () => {
          void refreshChatTargets();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshChatTargets, userId]);

  useEffect(() => {
    if (!userId || (chatTargets.agreementIds.length === 0 && chatTargets.directChatIds.length === 0)) {
      return;
    }

    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    const invalidateUnreadCount = () => {
      void refreshChatTargets();
    };

    chatTargets.agreementIds.forEach((agreementId) => {
      const channel = supabase
        .channel(`bottom-nav-agreement-${userId}-${agreementId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `agreement_id=eq.${agreementId}`,
          },
          invalidateUnreadCount
        )
        .subscribe();

      channels.push(channel);
    });

    chatTargets.directChatIds.forEach((directChatId) => {
      const channel = supabase
        .channel(`bottom-nav-direct-${userId}-${directChatId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `direct_chat_id=eq.${directChatId}`,
          },
          invalidateUnreadCount
        )
        .subscribe();

      channels.push(channel);
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [chatTargets.agreementIds, chatTargets.directChatIds, refreshChatTargets, userId]);

  const navItems: NavItem[] = [
    { icon: CalendarCheck, label: "ปฏิทิน", path: "/" },
    { icon: Bell, label: "แจ้งเตือน", path: "/notifications", badge: unreadNotifications },
    { label: "สร้างข้อตกลง", path: "/create", isLogo: true },
    { icon: MessageCircle, label: "แชท", path: "/chat", badge: unreadMessages },
    { icon: User, label: "โปรไฟล์", path: "/profile" },
  ];

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card/92 px-2 pb-safe backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-md items-end justify-between py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          if (item.isLogo) {
            return (
              <motion.button
                key={item.label}
                onClick={() => navigate(item.path)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative -mt-7 flex flex-col items-center px-2"
              >
                <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-primary shadow-elevated ring-4 ring-background">
                  <span className="font-cherry text-white text-base leading-none">BOB</span>
                  <span className="font-cherry text-white text-[5px] leading-tight">Bud Over Bills</span>
                </div>
                <span className="mt-1 text-[10px] font-semibold text-primary">{item.label}</span>
              </motion.button>
            );
          }

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`relative flex min-w-[62px] flex-col items-center px-2 py-2 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`relative p-2 rounded-xl transition-all ${isActive ? "bg-primary/10" : ""}`}>
                {Icon && <Icon className="w-5 h-5" />}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className="mt-0.5 text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
