import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Bell, Check, Clock, AlertCircle, FileText, CheckCircle2, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNotifications, Notification, NotificationPriority } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  payment_due: Clock,
  payment_uploaded: AlertCircle,
  payment_confirmed: Check,
  payment_rejected: AlertCircle,
  agreement_created: FileText,
  agreement_confirmed: CheckCircle2,
  agreement_completed: CheckCircle2,
  reschedule_request: Clock,
  reschedule_approved: CheckCircle2,
  reschedule_rejected: AlertCircle,
  post_published: CheckCircle2,
  friend_request: Bell,
  friend_accepted: CheckCircle2,
  security_alert: AlertCircle,
  default: Bell,
};

// Priority-based styling (replaces type-based)
const priorityConfig: Record<NotificationPriority, {
  bgClass: string;
  iconBg: string;
  borderClass: string;
}> = {
  critical: {
    bgClass: "bg-status-overdue/10",
    iconBg: "text-status-overdue bg-status-overdue/20",
    borderClass: "border-status-overdue/30",
  },
  important: {
    bgClass: "bg-status-pending/10",
    iconBg: "text-status-pending bg-status-pending/20",
    borderClass: "border-status-pending/30",
  },
  info: {
    bgClass: "bg-muted",
    iconBg: "text-muted-foreground bg-muted",
    borderClass: "border-border",
  },
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSafeInternalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !/[\s\\]/.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function getSafeNotificationTarget(notif: Notification): string | null {
  if (notif.action_url && isSafeInternalPath(notif.action_url)) {
    return notif.action_url;
  }

  if (!notif.related_id || !isUuid(notif.related_id)) {
    return null;
  }

  switch (notif.related_type) {
    case "agreement":
    case "reschedule":
      return `/debt/${notif.related_id}`;
    case "installment":
      return `/debt/${notif.related_id}`;
    case "friend_request":
      return "/friends";
    case "feed_post":
      return "/";
    case "chat":
      return `/chat/${notif.related_id}`;
    default:
      return null;
  }
}

export function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  const { notifications, loading, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  const navigate = useNavigate();

  // Sort notifications by priority (critical first)
  const sortedNotifications = [...notifications].sort((a, b) => {
    const priorityOrder: Record<NotificationPriority, number> = { critical: 0, important: 1, info: 2 };
    const aPriority = priorityOrder[a.priority] ?? 2;
    const bPriority = priorityOrder[b.priority] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const handleClick = async (notif: Notification) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    
    // Close sheet first
    onOpenChange(false);

    const safeTarget = getSafeNotificationTarget(notif);
    if (safeTarget) {
      if (notif.related_type === "installment") {
        await navigateToInstallment(notif.related_id as string);
        return;
      }

      navigate(safeTarget);
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

  const formatTime = (timestamp: string) => {
    return formatDistanceToNow(new Date(timestamp), {
      addSuffix: true,
      locale: th,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-card">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              การแจ้งเตือน
            </SheetTitle>
            {unreadCount > 0 && (
              <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-xs"
                aria-label="อ่านการแจ้งเตือนทั้งหมด"
              >
                อ่านทั้งหมด
              </Button>
            )}
          </div>
          <SheetDescription>ดูการแจ้งเตือนล่าสุดและเปิดรายการที่เกี่ยวข้องได้ทันที</SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-3" role="list" aria-live="polite" aria-relevant="additions text" aria-busy={loading}>
          {loading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="กำลังโหลดการแจ้งเตือน">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedNotifications.length === 0 ? (
            <div className="text-center py-12" role="status">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">ไม่มีการแจ้งเตือน</p>
            </div>
          ) : (
            sortedNotifications.map((notif, index) => {
              const Icon = iconMap[notif.type] || iconMap.default;
              const priority = notif.priority || "info";
              const config = priorityConfig[priority];
              
              return (
                <motion.button
                  key={notif.id}
                  type="button"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleClick(notif)}
                  aria-label={`เปิดการแจ้งเตือน: ${notif.title}${notif.is_read ? "" : " ยังไม่อ่าน"}`}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    notif.is_read 
                      ? "bg-background border-border hover:bg-secondary/50 opacity-75" 
                      : `${config.bgClass} ${config.borderClass} hover:opacity-90 shadow-sm`
                  } ${priority === "critical" && !notif.is_read ? "ring-1 ring-status-overdue/50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      notif.is_read ? "text-muted-foreground bg-muted" : config.iconBg
                    }`}>
                      {priority === "critical" && !notif.is_read ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium truncate ${notif.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {notif.title}
                        </p>
                        {!notif.is_read && (
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                            priority === "critical" 
                              ? "bg-status-overdue text-white animate-pulse"
                              : priority === "important"
                                ? "bg-status-pending text-white"
                                : "bg-primary text-primary-foreground"
                          }`}>
                            {priority === "critical" ? "ด่วน!" : priority === "important" ? "สำคัญ" : "ใหม่"}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm line-clamp-2 ${notif.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">{formatTime(notif.created_at)}</p>
                        {notif.is_read && (
                          <span className="text-xs text-muted-foreground/50">• อ่านแล้ว</span>
                        )}
                      </div>
                    </div>
                    {/* Action indicator */}
                    <ChevronRight className={`w-5 h-5 flex-shrink-0 ${
                      notif.is_read ? "text-muted-foreground/50" : "text-foreground"
                    }`} />
                  </div>
                </motion.button>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
