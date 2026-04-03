import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { DashboardStats } from "@/components/DashboardStats";
import { PaymentCalendar } from "@/components/PaymentCalendar";
import { DebtCard } from "@/components/DebtCard";
import { PendingAgreements } from "@/components/PendingAgreements";
import { PendingActionsCard } from "@/components/home/PendingActionsCard";
import { BottomNav } from "@/components/BottomNav";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { EmptyState, PageSection } from "@/components/ux";
import { PageTransition } from "@/components/ux/PageTransition";

// Domain imports - SINGLE SOURCE OF TRUTH
import { mapAgreementsToDebtCards, AgreementRole, isAgreementEffectivelyCompleted } from "@/domains/debt";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { agreements, isLoading } = useDebtAgreements();
  const [agreementRoleFilter, setAgreementRoleFilter] = useState<AgreementRole>("lender");

  // Sync with PaymentCalendar role filter
  const handleCalendarRoleChange = useCallback((role: AgreementRole) => {
    setAgreementRoleFilter(role);
  }, []);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || "ผู้เยี่ยมชม";

  // Use domain function to map agreements to debt cards
  // Filter out agreements that are effectively completed (all installments paid)
  const debtCards = useMemo(() => {
    const activeAgreements = agreements.filter(a => 
      a.status === 'active' && 
      !isAgreementEffectivelyCompleted(a.installments)
    );
    return mapAgreementsToDebtCards(activeAgreements, user?.id);
  }, [agreements, user?.id]);

  // Filter debt cards by selected role
  const filteredDebtCards = useMemo(() => 
    debtCards.filter(card => 
      agreementRoleFilter === "lender" ? card.isLender : !card.isLender
    ),
    [debtCards, agreementRoleFilter]
  );

  // Count by role
  const lenderCount = debtCards.filter(c => c.isLender).length;
  const borrowerCount = debtCards.filter(c => !c.isLender).length;

  return (
    <PageTransition>
    <div className="min-h-screen pb-24">
      <div className="page-shell section-stack max-w-lg">
        <Header userName={displayName} />

        <section className="surface-panel space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Mission Control
              </p>
              <h2 className="text-xl font-heading font-semibold text-foreground">
                วันนี้คุณต้องจัดการอะไรบ้าง
              </h2>
              <p className="text-sm text-muted-foreground">
                ดูงานค้าง ภาพรวมยอดเงิน และสัญญาที่กำลังเดินอยู่ในหน้าเดียว
              </p>
            </div>
            <Button onClick={() => navigate("/create")} className="rounded-2xl">
              <Plus className="mr-2 h-4 w-4" />
              สร้างใหม่
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary/55 p-1">
            {(["lender", "borrower"] as AgreementRole[]).map((role) => {
              const isActive = agreementRoleFilter === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setAgreementRoleFilter(role)}
                  className={`rounded-[1rem] px-4 py-3 text-sm font-medium transition-colors ${
                    isActive ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
                  }`}
                >
                  {role === "lender" ? "มุมผู้ให้ยืม" : "มุมผู้ยืม"}
                </button>
              );
            })}
          </div>
        </section>

        {!isLoading && !authLoading && <PendingActionsCard />}

        {!isLoading && !authLoading && (
          <PendingAgreements agreements={agreements} userId={user?.id} />
        )}

        <DashboardStats roleFilter={agreementRoleFilter} />

        <PageSection
          title="Payment Calendar"
          description="มองเห็นกำหนดชำระถัดไปตามมุมมองที่คุณเลือก"
        >
          <PaymentCalendar onRoleChange={handleCalendarRoleChange} />
        </PageSection>

        <PageSection
          title="Active Agreements"
          description={
            agreementRoleFilter === "lender"
              ? "ติดตามคู่สัญญาที่คุณให้ยืมและยอดที่ยังคงค้าง"
              : "ติดตามภาระชำระของคุณและงวดถัดไปที่ต้องจ่าย"
          }
          action={
            filteredDebtCards.length > 5 ? (
              <button
                type="button"
                onClick={() => navigate("/history")}
                className="text-sm font-medium text-primary hover:underline"
              >
                ดูทั้งหมด
              </button>
            ) : null
          }
        >
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                agreementRoleFilter === "lender"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400"
              }`}
            >
              {agreementRoleFilter === "lender" ? lenderCount : borrowerCount} รายการ
            </span>
          </div>

          {isLoading || authLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredDebtCards.length === 0 ? (
            <EmptyState
              icon={
                agreementRoleFilter === "lender" ? (
                  <ArrowDownLeft className="h-7 w-7" />
                ) : (
                  <ArrowUpRight className="h-7 w-7" />
                )
              }
              title={agreementRoleFilter === "lender" ? "ยังไม่มีสัญญาที่คุณให้ยืม" : "ยังไม่มีสัญญาที่คุณยืม"}
              description={
                agreementRoleFilter === "lender"
                  ? "เริ่มต้นด้วยการสร้างข้อตกลงใหม่เพื่อบันทึกยอดเงิน รอบชำระ และเงื่อนไขให้ชัดเจน"
                  : "เมื่อคุณเป็นผู้ยืม ระบบจะแสดงยอดคงเหลือ งวดถัดไป และสถานะการชำระในส่วนนี้"
              }
              action={
                agreementRoleFilter === "lender" ? (
                  <Button onClick={() => navigate("/create")}>
                    <Plus className="mr-2 h-4 w-4" />
                    สร้างข้อตกลงใหม่
                  </Button>
                ) : null
              }
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={agreementRoleFilter}
                initial={{ opacity: 0, x: agreementRoleFilter === "lender" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: agreementRoleFilter === "lender" ? 20 : -20 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="space-y-4"
              >
                {filteredDebtCards.slice(0, 5).map((debt) => (
                  <DebtCard key={debt.id} {...debt} id={debt.id} />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </PageSection>
      </div>

      <BottomNav />
    </div>
    </PageTransition>
  );
};

export default Index;
