import { CalendarCheck, User, Bell, MessageCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadChatMessageCount } from "@/hooks/useGlobalChatNotification";

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
  const { notifications } = useNotifications();
  const unreadMessages = useUnreadChatMessageCount();

  const unreadNotifications = notifications?.filter(n => !n.is_read).length || 0;

  const navItems: NavItem[] = [
    { icon: CalendarCheck, label: "ปฏิทิน", path: "/" },
    { icon: Bell, label: "แจ้งเตือน", path: "/notifications", badge: unreadNotifications },
    { label: "สร้างข้อตกลง", path: "/create", isLogo: true },
    { icon: MessageCircle, label: "แชท", path: "/chat", badge: unreadMessages },
    { icon: User, label: "โปรไฟล์", path: "/profile" },
  ];

  const isNavItemActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card/92 px-2 pb-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-end justify-between py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item.path);

          if (item.isLogo) {
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className="relative -mt-7 flex flex-col items-center px-2"
              >
                <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-primary shadow-elevated ring-4 ring-background">
                  <span className="font-cherry text-white text-base leading-none">BOB</span>
                  <span className="font-cherry text-white text-[5px] leading-tight">Bud Over Bills</span>
                </div>
                <span className="mt-1 text-[10px] font-semibold text-primary">{item.label}</span>
              </button>
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
    </nav>
  );
}
