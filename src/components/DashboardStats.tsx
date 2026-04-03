import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, FileText, Clock, AlertCircle } from "lucide-react";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { SummaryCard } from "@/components/ux";
import { AgreementRole } from "@/domains/debt";

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

interface DashboardStatsProps {
  roleFilter?: AgreementRole;
}

export function DashboardStats({ roleFilter }: DashboardStatsProps) {
  const { agreements, stats } = useDebtAgreements();
  const { user } = useAuth();

  // Use domain function to get upcoming installments
  const upcomingInstallments = useMemo<UpcomingInstallmentData[]>(() => {
    return mapToUpcomingInstallments(agreements, user?.id, 7, 3);
  }, [agreements, user?.id]);

  const filteredUpcomingInstallments = useMemo(() => {
    if (!roleFilter) return upcomingInstallments;
    return upcomingInstallments.filter((item) => (roleFilter === "lender" ? item.isLender : !item.isLender));
  }, [roleFilter, upcomingInstallments]);

  const roleSummary = useMemo(() => {
    if (roleFilter === "lender") {
      const count = agreements.filter((agreement) => agreement.lender_id === user?.id && agreement.status === "active").length;
      return {
        label: "สัญญาที่คุณให้ยืม",
        value: count,
        hint: "สัญญาที่กำลังติดตามการชำระ",
      };
    }

    if (roleFilter === "borrower") {
      const count = agreements.filter((agreement) => agreement.borrower_id === user?.id && agreement.status === "active").length;
      return {
        label: "สัญญาที่คุณยืม",
        value: count,
        hint: "สัญญาที่คุณต้องจัดการชำระ",
      };
    }

    return {
      label: "ข้อตกลงที่ใช้งาน",
      value: stats.activeCount,
      hint: "ทุกข้อตกลงที่ยังดำเนินอยู่",
    };
  }, [agreements, roleFilter, stats.activeCount, user?.id]);

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          label="ยอดรับ"
          value={`฿${stats.totalToReceive.toLocaleString()}`}
          hint="เงินที่ยังรอรับจากสัญญาที่เปิดอยู่"
          icon={TrendingUp}
          priority="primary"
        />
        <SummaryCard
          label="ยอดจ่าย"
          value={`฿${stats.totalToPay.toLocaleString()}`}
          hint="ยอดที่คุณยังต้องชำระ"
          icon={TrendingDown}
          priority="warning"
        />
        <SummaryCard
          label={roleSummary.label}
          value={roleSummary.value.toLocaleString()}
          hint={roleSummary.hint}
          icon={FileText}
        />
        <SummaryCard
          label="รอยืนยัน"
          value={stats.pendingCount.toLocaleString()}
          hint="ข้อตกลงหรือการชำระที่ยังต้องมีคนกดต่อ"
          icon={Clock}
          priority={stats.pendingCount > 0 ? "warning" : "neutral"}
        />
      </div>

      {filteredUpcomingInstallments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="surface-panel"
        >
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-status-pending" />
            <div>
              <h3 className="text-sm font-medium text-foreground">งวดที่ใกล้ครบกำหนด</h3>
              <p className="text-xs text-muted-foreground">รายการที่ควรจัดการภายใน 7 วัน</p>
            </div>
          </div>
          <div className="space-y-2">
            {filteredUpcomingInstallments.map((item, index) => (
              <motion.div
                key={`${item.agreementId}-${item.dueDate}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + index * 0.05 }}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/35 px-3 py-3 last:border-border/70"
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
