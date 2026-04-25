import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Bell, Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSafeNotificationTarget } from "@/utils/navigation";
import { NotificationListItem } from "@/components/notifications/NotificationListItem";

interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  const { notifications, loading, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  const navigate = useNavigate();

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [notifications]);

  const handleClick = async (notif: Notification) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }

    onOpenChange(false);

    const safeTarget = getSafeNotificationTarget(notif);
    if (safeTarget) {
      navigate(safeTarget);
      return;
    }

    if (notif.related_type === "installment" && notif.related_id) {
      await navigateToInstallment(notif.related_id);
    }
  };

  // Helper to navigate to the correct agreement for an installment
  const navigateToInstallment = async (installmentId: string) => {
    try {
      const { data, error } = await supabase
        .from("installments")
        .select("agreement_id")
        .eq("id", installmentId)
        .single();
      
      if (error) {
        console.error("Error finding agreement:", error);
        return;
      }
      
      if (data?.agreement_id) {
        navigate(`/debt/${data.agreement_id}`);
      }
    } catch (error) {
      console.error("Error finding agreement:", error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex h-[82svh] max-w-md flex-col overflow-hidden rounded-t-2xl border-border bg-background p-0 shadow-elevated"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
        <SheetHeader className="border-b border-border px-5 pb-4 pt-3 text-left">
          <div className="flex items-start justify-between gap-4 pr-10">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 font-serif-display text-2xl font-normal leading-none">
                <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
                การแจ้งเตือน
              </SheetTitle>
              <SheetDescription className="mt-2 text-xs leading-relaxed">
                {unreadCount > 0
                  ? `มี ${unreadCount} รายการที่ยังไม่อ่าน`
                  : "รายการล่าสุดและงานที่เกี่ยวข้อง"}
              </SheetDescription>
            </div>
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="h-8 shrink-0 rounded-md px-2.5 text-xs"
                aria-label="อ่านการแจ้งเตือนทั้งหมด"
              >
                <Check className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} />
                อ่านทั้งหมด
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        <div
          className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3"
          aria-live="polite"
          aria-relevant="additions removals"
          aria-busy={loading}
        >
          {loading ? (
            <div className="space-y-2" role="status" aria-label="กำลังโหลดการแจ้งเตือน">
              <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                กำลังโหลด
              </div>
              {[0, 1, 2].map((item) => (
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
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-[48vh] flex-col items-center justify-center text-center"
              role="status"
            >
              <Bell className="mb-4 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
              <p className="font-medium text-foreground">ไม่มีการแจ้งเตือน</p>
              <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
                เมื่อมีกิจกรรมใหม่ ระบบจะแสดงรายการล่าสุดไว้ที่นี่
              </p>
            </motion.div>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {sortedNotifications.map((notif, index) => (
                  <NotificationListItem
                    key={notif.id}
                    notification={notif}
                    index={index}
                    onOpen={(notification) => {
                      void handleClick(notification);
                    }}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
