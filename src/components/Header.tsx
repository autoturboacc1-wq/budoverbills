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
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center justify-between border-b border-border/80 py-5"
      >
        <div className="flex items-center gap-3">
          {displayAvatarUrl ? (
            <img
              src={displayAvatarUrl}
              alt={`รูปโปรไฟล์ของ ${userName}`}
              className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            <BobLogo size="sm" />
          )}
          <div className="leading-tight">
            <p className="label-eyebrow">สวัสดี</p>
            <h1 className="font-serif-display text-[1.65rem] text-foreground">
              {userName}
            </h1>
          </div>
        </div>

        <div className="flex items-center rounded-full border border-border/80 bg-card/80 px-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            aria-haspopup="dialog"
            aria-expanded={showSearch}
            aria-label="เปิดค้นหา"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setShowNotifications(true)}
            aria-haspopup="dialog"
            aria-expanded={showNotifications}
            aria-label={
              unreadCount > 0
                ? `เปิดการแจ้งเตือน ${unreadCount} รายการที่ยังไม่อ่าน`
                : "เปิดการแจ้งเตือน"
            }
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </motion.header>

      <NotificationSheet open={showNotifications} onOpenChange={setShowNotifications} />
      <SearchDialog open={showSearch} onOpenChange={setShowSearch} />
    </>
  );
}
