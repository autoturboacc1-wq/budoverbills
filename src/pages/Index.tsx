import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useState, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { DashboardStats } from "@/components/DashboardStats";
import { PaymentCalendar } from "@/components/PaymentCalendar";
import { DebtCard } from "@/components/DebtCard";
import { PendingAgreements } from "@/components/PendingAgreements";
import { PendingActionsCard } from "@/components/home/PendingActionsCard";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { EmptyState, PageSection } from "@/components/ux";
import { PageTransition } from "@/components/ux/PageTransition";

// Domain imports - SINGLE SOURCE OF TRUTH
import { mapAgreementsToDebtCards, AgreementRole, isAgreementEffectivelyCompleted } from "@/domains/debt";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { agreements, isLoading } = useDebtAgreements();
  const [agreementRoleFilter, setAgreementRoleFilter] = useState<AgreementRole>("lender");

  const handleCalendarRoleChange = useCallback((role: AgreementRole) => {
    setAgreementRoleFilter(role);
  }, []);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || "ผู้เยี่ยมชม";

  const debtCards = useMemo(() => {
    const activeAgreements = agreements.filter(a =>
      (a.status === 'active' || a.status === 'rescheduling') &&
      !isAgreementEffectivelyCompleted(a.installments)
    );
    return mapAgreementsToDebtCards(activeAgreements, user?.id);
  }, [agreements, user?.id]);

  const filteredDebtCards = useMemo(() =>
    debtCards.filter(card =>
      agreementRoleFilter === "lender" ? card.isLender : !card.isLender
    ),
    [debtCards, agreementRoleFilter]
  );

  const lenderCount = debtCards.filter(c => c.isLender).length;
  const borrowerCount = debtCards.filter(c => !c.isLender).length;

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <div className="page-shell section-stack">
          <Header userName={displayName} />

          {/* Mission control — editorial, no card chrome */}
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4 border-b border-border pb-4">
              <div className="max-w-sm">
                <p className="label-eyebrow">Today</p>
                <h2 className="mt-2 font-serif-display text-3xl leading-[1.05] text-foreground">
                  วันนี้คุณต้องจัดการอะไรบ้าง
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  ดูงานค้าง ภาพรวมยอดเงิน และสัญญาที่กำลังเดินอยู่ในหน้าเดียว
                </p>
              </div>
              <Button
                onClick={() => navigate("/create")}
                size="sm"
                className="rounded-md"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                สร้างใหม่
              </Button>
            </div>

            {/* Role toggle — minimal, hairline-only */}
            <div className="flex items-center gap-6 text-sm" role="tablist">
              {(["lender", "borrower"] as AgreementRole[]).map((role) => {
                const isActive = agreementRoleFilter === role;
                const count = role === "lender" ? lenderCount : borrowerCount;
                return (
                  <button
                    key={role}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setAgreementRoleFilter(role)}
                    className={`relative flex items-baseline gap-2 pb-2 transition-colors ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="font-medium">
                      {role === "lender" ? "มุมผู้ให้ยืม" : "มุมผู้ยืม"}
                    </span>
                    <span className="num text-[11px] text-muted-foreground">{count}</span>
                    {isActive && (
                      <motion.span
                        layoutId="role-toggle-underline"
                        className="absolute bottom-0 left-0 right-0 h-px bg-foreground"
                      />
                    )}
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
                  className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                >
                  ดูทั้งหมด
                </button>
              ) : null
            }
          >
            {isLoading || authLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-px w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : filteredDebtCards.length === 0 ? (
              <EmptyState
                icon={
                  agreementRoleFilter === "lender" ? (
                    <ArrowDownLeft className="h-6 w-6" strokeWidth={1.5} />
                  ) : (
                    <ArrowUpRight className="h-6 w-6" strokeWidth={1.5} />
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
                    <Button onClick={() => navigate("/create")} size="sm" className="rounded-md">
                      <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                      สร้างข้อตกลงใหม่
                    </Button>
                  ) : null
                }
              />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={agreementRoleFilter}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-3"
                >
                  {filteredDebtCards.slice(0, 5).map((debt) => (
                    <DebtCard key={debt.id} {...debt} id={debt.id} />
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </PageSection>
        </div>
      </div>
    </PageTransition>
  );
};

export default Index;
