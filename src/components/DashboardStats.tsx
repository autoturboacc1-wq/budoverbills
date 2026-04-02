import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, FileText, Clock, AlertCircle } from "lucide-react";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

// Domain imports - SINGLE SOURCE OF TRUTH
import { mapToUpcomingInstallments, UpcomingInstallmentData } from "@/domains/debt";

// Helper functions for display formatting (UI-only, not business logic)
function formatDueLabel(days: number): string {
  if (days < 0) return `เลยกำหนด ${Math.abs(days)} วัน`;
  if (days === 0) return "ครบกำหนดวันนี้";
  if (days === 1) return "พรุ่งนี้";
  return `อีก ${days} วัน`;
}

function getDueLabelStyle(days: number): string {
  if (days < 0) return "text-status-overdue bg-status-overdue/10";
  if (days === 0) return "text-status-overdue bg-status-overdue/10";
  if (days <= 2) return "text-status-pending bg-status-pending/10";
  return "text-primary bg-primary/10";
}

export function DashboardStats() {
  const { agreements, stats } = useDebtAgreements();
  const { user } = useAuth();

  // Use domain function to get upcoming installments
  const upcomingInstallments = useMemo<UpcomingInstallmentData[]>(() => {
    return mapToUpcomingInstallments(agreements, user?.id, 7, 3);
  }, [agreements, user?.id]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Total Outstanding */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl p-4 shadow-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-status-paid/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-status-paid" />
            </div>
            <span className="text-xs text-muted-foreground">ยอดรับ</span>
          </div>
          <p className="text-xl font-heading font-semibold text-foreground">
            ฿{stats.totalToReceive.toLocaleString()}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl p-4 shadow-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-status-overdue/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-status-overdue" />
            </div>
            <span className="text-xs text-muted-foreground">ยอดจ่าย</span>
          </div>
          <p className="text-xl font-heading font-semibold text-foreground">
            ฿{stats.totalToPay.toLocaleString()}
          </p>
        </motion.div>

        {/* Agreements Count */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-4 shadow-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">ข้อตกลง</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-heading font-semibold text-foreground">
              {stats.activeCount}
            </p>
            <span className="text-xs text-muted-foreground">ใช้งาน</span>
          </div>
        </motion.div>

        {/* Pending Count */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="bg-card rounded-2xl p-4 shadow-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-status-pending/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-status-pending" />
            </div>
            <span className="text-xs text-muted-foreground">รอยืนยัน</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-heading font-semibold text-foreground">
              {stats.pendingCount}
            </p>
            <span className="text-xs text-muted-foreground">รายการ</span>
          </div>
        </motion.div>
      </div>

      {/* Upcoming Installments */}
      {upcomingInstallments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl p-4 shadow-card"
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-status-pending" />
            <h3 className="font-medium text-foreground text-sm">งวดที่ใกล้ครบกำหนด</h3>
          </div>
          <div className="space-y-2">
            {upcomingInstallments.map((item, index) => (
              <motion.div
                key={`${item.agreementId}-${item.dueDate}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + index * 0.05 }}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-xs font-medium text-secondary-foreground">
                      {item.partnerName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.partnerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.isLender ? "รับ" : "จ่าย"} ฿{item.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getDueLabelStyle(item.daysUntilDue)}`}>
                  {formatDueLabel(item.daysUntilDue)}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}
