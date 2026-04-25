import { CalendarCheck, User, Bell, MessageCircle, Plus } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadChatMessageCount } from "@/hooks/useGlobalChatNotification";

interface NavItem {
  icon?: React.ElementType;
  label: string;
  path: string;
  isPrimary?: boolean;
  badge?: number;
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications } = useNotifications();
  const unreadMessages = useUnreadChatMessageCount();

  const unreadNotifications = notifications?.filter((n) => !n.is_read).length || 0;

  const navItems: NavItem[] = [
    { icon: CalendarCheck, label: "ปฏิทิน", path: "/" },
    { icon: Bell, label: "แจ้งเตือน", path: "/notifications", badge: unreadNotifications },
    { icon: Plus, label: "สร้าง", path: "/create", isPrimary: true },
    { icon: MessageCircle, label: "แชท", path: "/chat", badge: unreadMessages },
    { icon: User, label: "โปรไฟล์", path: "/profile" },
  ];

  const isNavItemActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 px-2 pb-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-stretch justify-between">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item.path);

          if (item.isPrimary) {
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                aria-label={item.label}
                className="group relative flex flex-1 flex-col items-center justify-center py-3"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background transition-transform group-active:scale-95">
                  {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                    aria-label={`${item.badge} unread`}
                  />
                )}
              </span>
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              {isActive && (
                <span aria-hidden className="absolute bottom-0 h-px w-6 bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
