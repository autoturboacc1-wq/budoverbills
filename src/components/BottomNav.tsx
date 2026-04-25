import { Bell, CalendarCheck, FileText, Plus, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";

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

  const unreadNotifications = notifications?.filter((n) => !n.is_read).length || 0;

  const navItems: NavItem[] = [
    { icon: CalendarCheck, label: "ภาพรวม", path: "/" },
    { icon: FileText, label: "ประวัติ", path: "/history" },
    { icon: Plus, label: "ปล่อยยืม", path: "/create", isPrimary: true },
    { icon: Bell, label: "แจ้งเตือน", path: "/notifications", badge: unreadNotifications },
    { icon: User, label: "โปรไฟล์", path: "/profile" },
  ];

  const isNavItemActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-safe">
      <div className="mx-auto flex max-w-md items-stretch justify-between rounded-[1.5rem] border border-border/80 bg-background/88 px-1.5 shadow-card backdrop-blur-xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item.path);

          if (item.isPrimary) {
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                aria-label={item.label}
                className="group relative flex flex-1 flex-col items-center justify-center py-2.5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-foreground bg-foreground text-background transition-transform group-active:scale-95">
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
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
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
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
