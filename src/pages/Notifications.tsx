import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSafeNotificationTarget, isSafeInternalPath } from "@/utils/navigation";
import { PageTransition } from "@/components/ux/PageTransition";
import { EmptyState } from "@/components/ux/EmptyState";
import { NotificationListItem } from "@/components/notifications/NotificationListItem";

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
    if (!notification.is_read) {
      void handleMarkAsRead(notification.id);
    }

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

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;
  const sortedNotifications = useMemo(() => {
    return [...(notifications ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [notifications]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <div className="page-shell">
          <motion.header
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="sticky top-0 z-10 -mx-5 border-b border-border bg-background/95 px-5 pb-3 pt-3 backdrop-blur-xl"
          >
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="label-eyebrow">Notifications</p>
                <h1 className="mt-1 font-serif-display text-3xl leading-none text-foreground">
                  การแจ้งเตือน
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {unreadCount > 0 ? `ยังไม่อ่าน ${unreadCount} รายการ` : "ไม่มีรายการที่ต้องจัดการ"}
                </p>
              </div>
              {unreadCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="h-9 shrink-0 rounded-md px-3 text-xs"
                  aria-label="อ่านการแจ้งเตือนทั้งหมด"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                  อ่านทั้งหมด
                </Button>
              ) : null}
            </div>
          </motion.header>

          <main className="pt-4" aria-busy={loading}>
            {loading ? (
              <div className="space-y-2" role="status" aria-label="กำลังโหลดการแจ้งเตือน">
                <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  กำลังโหลด
                </div>
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-[76px] animate-pulse rounded-md border border-border bg-card"
                  />
                ))}
              </div>
            ) : sortedNotifications.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <EmptyState
                  icon={<Bell className="h-7 w-7" strokeWidth={1.5} />}
                  title="ยังไม่มีการแจ้งเตือน"
                  description="เมื่อมีกิจกรรมใหม่ ระบบจะแสดงรายการล่าสุดไว้ที่นี่"
                />
              </motion.div>
            ) : (
              <motion.ul
                initial={false}
                className="space-y-2"
                role="list"
                aria-live="polite"
                aria-relevant="additions removals text"
              >
                <AnimatePresence initial={false}>
                  {sortedNotifications.map((notification, index) => (
                    <NotificationListItem
                      key={notification.id}
                      notification={notification}
                      index={index}
                      onOpen={handleNotificationClick}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </main>
        </div>
      </div>
    </PageTransition>
  );
};

export default Notifications;
