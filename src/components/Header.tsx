import { motion } from "framer-motion";
import { Bell, Search } from "lucide-react";
import { useState } from "react";
import { NotificationSheet } from "./NotificationSheet";
import { SearchDialog } from "./SearchDialog";
import { useNotifications } from "@/hooks/useNotifications";
import { BobLogo } from "./BobLogo";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  userName: string;
}

export function Header({ userName }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const { unreadCount } = useNotifications();
  const { user, profile } = useAuth();
  const authMetadata = user?.user_metadata as Record<string, unknown> | undefined;
  const authAvatarUrl =
    typeof authMetadata?.avatar_url === "string" && authMetadata.avatar_url.trim()
      ? authMetadata.avatar_url
      : typeof authMetadata?.picture === "string" && authMetadata.picture.trim()
        ? authMetadata.picture
        : null;
  const displayAvatarUrl = profile?.avatar_url || authAvatarUrl;

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between py-4"
      >
        <div className="flex items-center gap-3">
          {displayAvatarUrl ? (
            <img
              src={displayAvatarUrl}
              alt={userName}
              className="w-10 h-10 rounded-full object-cover bg-secondary"
              referrerPolicy="no-referrer"
            />
          ) : (
            <BobLogo size="sm" />
          )}
          <div>
            <p className="text-sm text-muted-foreground">สวัสดี,</p>
            <h1 className="text-xl font-heading font-semibold text-foreground">{userName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <Search className="w-5 h-5 text-secondary-foreground" />
          </button>
          <button
            onClick={() => setShowNotifications(true)}
            className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors relative group"
          >
            <Bell className="w-5 h-5 text-primary" />
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-status-overdue text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
            {/* Pulse ring animation */}
            {unreadCount > 0 && <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />}
          </button>
        </div>
      </motion.header>

      <NotificationSheet open={showNotifications} onOpenChange={setShowNotifications} />
      <SearchDialog open={showSearch} onOpenChange={setShowSearch} />
    </>
  );
}
