import { motion } from "framer-motion";
import { Bell, Check, Trash2, Loader2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSafeNotificationTarget, isSafeInternalPath } from "@/utils/navigation";

const Notifications = () => {
  const navigate = useNavigate();
  const { notifications, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id);
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      if (!notifications?.some(n => !n.is_read)) return;
      await markAllAsRead();
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const handleNotificationClick = (notification: NonNullable<typeof notifications>[0]) => {
    // Mark as read
    handleMarkAsRead(notification.id);

    const safeTarget = getSafeNotificationTarget(notification);
    if (safeTarget) {
      navigate(safeTarget);
      return;
    }

    const installmentId = notification.related_id;
    if (notification.related_type === "installment" && installmentId) {
      void (async () => {
        const { data } = await supabase
          .from("installments")
          .select("agreement_id")
          .eq("id", installmentId)
          .maybeSingle();

        if (data?.agreement_id) {
          const target = `/debt/${data.agreement_id}`;
          if (isSafeInternalPath(target)) {
            navigate(target);
          }
        }
      })();
      return;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "payment_reminder":
        return "💰";
      case "payment_received":
        return "✅";
      case "agreement_completed":
        return "🎉";
      case "friend_request":
        return "👋";
      case "security_alert":
        return "🔒";
      default:
        return "📬";
    }
  };

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4"
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-2xl font-bold font-outfit text-foreground">แจ้งเตือน</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount > 0 ? `${unreadCount} รายการยังไม่อ่าน` : "อ่านทั้งหมดแล้ว"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              อ่านทั้งหมด
            </Button>
          )}
        </div>
      </motion.header>

      <main className="px-4 py-4 max-w-lg mx-auto" aria-busy={loading}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Bell className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">ยังไม่มีการแจ้งเตือน</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              เมื่อมีกิจกรรมใหม่ คุณจะได้รับการแจ้งเตือนที่นี่
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2" role="list" aria-live="polite" aria-relevant="additions text">
            {notifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                role="listitem"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`relative p-4 bg-card rounded-xl border border-border transition-all hover:shadow-md ${
                  !notification.is_read ? "bg-primary/5 border-primary/20" : "opacity-75"
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`เปิดการแจ้งเตือน: ${notification.title}`}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                  className="flex items-start gap-3 outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="text-2xl" aria-hidden="true">{getNotificationIcon(notification.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`font-medium text-foreground ${!notification.is_read ? "" : "text-muted-foreground"}`}>
                        {notification.title}
                      </h3>
                      {!notification.is_read && (
                        <span className="shrink-0 w-2 h-2 mt-2 bg-primary rounded-full animate-pulse" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: th })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`ลบการแจ้งเตือน: ${notification.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(notification.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Notifications;
