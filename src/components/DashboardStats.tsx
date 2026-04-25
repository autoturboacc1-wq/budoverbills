import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { SummaryCard } from "@/components/ux";

// Domain imports - SINGLE SOURCE OF TRUTH
import { mapToUpcomingInstallments, UpcomingInstallmentData } from "@/domains/debt";

// Helper functions for display formatting (UI-only, not business logic)
function formatDueLabel(days: number): string {
  if (days < 0) return `เลยกำหนด ${Math.abs(days)} วัน`;
  if (days === 0) return "ครบกำหนดวันนี้";
  if (days === 1) return "พรุ่งนี้";
  return `อีก ${days} วัน`;
}

function getDueAccent(days: number): string {
  if (days <= 0) return "text-destructive";
  if (days <= 2) return "text-status-pending";
  return "text-muted-foreground";
}

function getDueDot(days: number): string {
  if (days <= 0) return "bg-destructive";
  if (days <= 2) return "bg-status-pending";
  return "bg-muted-foreground/60";
}

export function DashboardStats() {
  const { agreements, stats } = useDebtAgreements();
  const { user } = useAuth();

  const upcomingInstallments = useMemo<UpcomingInstallmentData[]>(() => {
    return mapToUpcomingInstallments(agreements, user?.id, 7, 3);
  }, [agreements, user?.id]);

  const filteredUpcomingInstallments = upcomingInstallments;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="ต้องรับ"
          value={`฿${stats.totalToReceive.toLocaleString()}`}
          icon={TrendingUp}
          priority="primary"
        />
        <SummaryCard
          label="ต้องจ่าย"
          value={`฿${stats.totalToPay.toLocaleString()}`}
          icon={TrendingDown}
          priority="warning"
        />
      </div>

      {filteredUpcomingInstallments.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="label-eyebrow">ใกล้ครบกำหนด</h3>
            <span className="text-[11px] text-muted-foreground">7 วัน</span>
          </div>
          <ul className="divide-y divide-border border-y border-border">
            {filteredUpcomingInstallments.map((item, index) => (
              <motion.li
                key={`${item.agreementId}-${item.dueDate}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + index * 0.04 }}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${getDueDot(item.daysUntilDue)}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{item.partnerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.isLender ? "รับ" : "จ่าย"}{" "}
                      <span className="num">฿{item.amount.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
                <span className={`text-[11px] font-medium ${getDueAccent(item.daysUntilDue)}`}>
                  {formatDueLabel(item.daysUntilDue)}
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.section>
  );
}
