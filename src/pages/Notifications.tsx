import { motion } from "framer-motion";
import { Bell, Check, Trash2, Loader2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Notifications = () => {
  const navigate = useNavigate();
  const { notifications, loading, refetch } = useNotifications();

  const handleMarkAsRead = async (id: string) => {
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      refetch();
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadIds = notifications?.filter(n => !n.is_read).map(n => n.id) || [];
      if (unreadIds.length === 0) return;

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);

      toast.success("อ่านทั้งหมดแล้ว");
      refetch();
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      refetch();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const handleNotificationClick = (notification: NonNullable<typeof notifications>[0]) => {
    // Mark as read
    handleMarkAsRead(notification.id);

    // Navigate based on type
    if (notification.related_type === "agreement" && notification.related_id) {
      navigate(`/debt/${notification.related_id}`);
    } else if (notification.related_type === "friend_request") {
      navigate("/friends");
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

      <main className="px-4 py-4 max-w-lg mx-auto">
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
          <div className="space-y-2">
            {notifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => handleNotificationClick(notification)}
                className={`relative p-4 bg-card rounded-xl border border-border cursor-pointer transition-all hover:shadow-md ${
                  !notification.is_read ? "bg-primary/5 border-primary/20" : "opacity-75"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getNotificationIcon(notification.type)}</span>
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
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
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