import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, FileText, Clock } from "lucide-react";
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

interface DashboardStatsProps {
  roleFilter?: AgreementRole;
}

export function DashboardStats({ roleFilter }: DashboardStatsProps) {
  const { agreements, stats } = useDebtAgreements();
  const { user } = useAuth();

  const upcomingInstallments = useMemo<UpcomingInstallmentData[]>(() => {
    return mapToUpcomingInstallments(agreements, user?.id, 7, 3);
  }, [agreements, user?.id]);

  const filteredUpcomingInstallments = useMemo(() => {
    if (!roleFilter) return upcomingInstallments;
    return upcomingInstallments.filter((item) =>
      roleFilter === "lender" ? item.isLender : !item.isLender,
    );
  }, [roleFilter, upcomingInstallments]);

  const roleSummary = useMemo(() => {
    if (roleFilter === "lender") {
      const count = agreements.filter(
        (a) => a.lender_id === user?.id && a.status === "active",
      ).length;
      return {
        label: "สัญญาที่คุณให้ยืม",
        value: count,
        hint: "สัญญาที่กำลังติดตามการชำระ",
      };
    }

    if (roleFilter === "borrower") {
      const count = agreements.filter(
        (a) => a.borrower_id === user?.id && a.status === "active",
      ).length;
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

  const showReceivable = roleFilter !== "borrower";
  const showPayable = roleFilter !== "lender";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-3">
        {showReceivable && (
          <SummaryCard
            label="ยอดรับ"
            value={`฿${stats.totalToReceive.toLocaleString()}`}
            hint="เงินที่ผู้ยืมยังต้องชำระคืนคุณ"
            icon={TrendingUp}
            priority="primary"
          />
        )}
        {showPayable && (
          <SummaryCard
            label="ยอดจ่าย"
            value={`฿${stats.totalToPay.toLocaleString()}`}
            hint="เงินที่คุณยังต้องชำระให้ผู้ให้ยืม"
            icon={TrendingDown}
            priority="warning"
          />
        )}
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="label-eyebrow">งวดที่ใกล้ครบกำหนด</h3>
            <span className="text-[11px] text-muted-foreground">ภายใน 7 วัน</span>
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
