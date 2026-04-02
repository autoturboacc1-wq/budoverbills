import { motion } from "framer-motion";
import { CalendarCheck, User, Bell, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  icon?: React.ElementType;
  label: string;
  path: string;
  isLogo?: boolean;
  badge?: number;
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { notifications } = useNotifications();
  const [unreadMessages, setUnreadMessages] = useState(0);

  const unreadNotifications = notifications?.filter(n => !n.is_read).length || 0;

  // Fetch unread message count for both agreement chats and direct chats
  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      let totalUnread = 0;

      // Get unread from agreement chats
      const { data: agreements } = await supabase
        .from("debt_agreements")
        .select("id")
        .or(`lender_id.eq.${user.id},borrower_id.eq.${user.id}`)
        .in("status", ["active", "pending", "pending_transfer"]);

      if (agreements?.length) {
        const agreementIds = agreements.map(a => a.id);
        const { count: agreementCount } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .in("agreement_id", agreementIds)
          .neq("sender_id", user.id)
          .is("read_at", null);
        totalUnread += agreementCount || 0;
      }

      // Get unread from direct chats
      const { data: directChats } = await supabase
        .from("direct_chats")
        .select("id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (directChats?.length) {
        const directChatIds = directChats.map(c => c.id);
        const { count: directCount } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .in("direct_chat_id", directChatIds)
          .neq("sender_id", user.id)
          .is("read_at", null);
        totalUnread += directCount || 0;
      }

      setUnreadMessages(totalUnread);
    };

    fetchUnreadCount();

    // Subscribe to new messages (both types)
    const channel = supabase
      .channel("unread-messages-all")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages"
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
      className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border px-2 pb-safe z-50"
    >
      <div className="flex items-center justify-between max-w-md mx-auto py-1">
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
                className="relative -mt-8 flex flex-col items-center px-2"
              >
                <div className="w-14 h-14 flex flex-col items-center justify-center ring-4 ring-background rounded-full shadow-elevated bg-primary">
                  <span className="font-cherry text-white text-base leading-none">BOB</span>
                  <span className="font-cherry text-white text-[5px] leading-tight">Bud Over Bills</span>
                </div>
                <span className="text-[9px] font-semibold text-primary mt-1">{item.label}</span>
              </motion.button>
            );
          }

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center py-2 px-3 transition-colors ${
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
              <span className="text-[9px] font-medium mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
