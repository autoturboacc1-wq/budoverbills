import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
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
import { Plus, ArrowDownLeft } from "lucide-react";
import { EmptyState, PageSection } from "@/components/ux";
import { PageTransition } from "@/components/ux/PageTransition";

// Domain imports - SINGLE SOURCE OF TRUTH
import { mapAgreementsToDebtCards, isAgreementEffectivelyCompleted } from "@/domains/debt";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { agreements, isLoading } = useDebtAgreements();

  const displayName = profile?.display_name || user?.email?.split('@')[0] || "ผู้เยี่ยมชม";

  const debtCards = useMemo(() => {
    const activeAgreements = agreements.filter(a =>
      (a.status === 'active' || a.status === 'rescheduling') &&
      !isAgreementEffectivelyCompleted(a.installments)
    );
    return mapAgreementsToDebtCards(activeAgreements, user?.id);
  }, [agreements, user?.id]);

  const lenderCards = useMemo(() => debtCards.filter(card => card.isLender), [debtCards]);
  const borrowerCards = useMemo(() => debtCards.filter(card => !card.isLender), [debtCards]);

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <div className="page-shell section-stack">
          <Header userName={displayName} />

          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4 border-b border-border/80 pb-4">
              <div className="max-w-sm">
                <p className="label-eyebrow">ภาพรวมวันนี้</p>
                <h2 className="mt-2 font-serif-display text-[2rem] leading-[1.02] text-foreground">
                  เงินค้าง งานค้าง และสัญญาที่ยังเดินอยู่
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  ทุกอย่างที่ต้องเช็กถูกรวมไว้ในหน้าเดียวแบบสั้นและอ่านเร็ว
                </p>
              </div>
              <Button onClick={() => navigate("/create")} size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                สร้างสัญญา
              </Button>
            </div>
          </section>

          {!isLoading && !authLoading && <PendingActionsCard />}

          {!isLoading && !authLoading && (
            <PendingAgreements agreements={agreements} userId={user?.id} />
          )}

          <DashboardStats />

          <PageSection
            title="Payment Calendar"
            description="มองเห็นกำหนดชำระถัดไปของคุณ"
          >
            <PaymentCalendar />
          </PageSection>

          <PageSection
            title="ลูกหนี้ของคุณ"
            description="คนที่ยังต้องชำระคืนให้คุณ"
            action={
              lenderCards.length > 5 ? (
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
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-5 space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-7 w-32" />
                  </div>
                ))}
              </div>
            ) : lenderCards.length === 0 ? (
              <EmptyState
                icon={<ArrowDownLeft className="h-6 w-6" strokeWidth={1.5} />}
                title="ยังไม่มีคนติดหนี้คุณ"
                description="เริ่มต้นด้วยการปล่อยยืมและสร้างข้อตกลงฝั่งผู้ให้ยืม"
                action={
                  <Button onClick={() => navigate("/create")} size="sm">
                    <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                    ปล่อยยืมให้เพื่อน
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {lenderCards.slice(0, 5).map((debt) => (
                  <DebtCard key={debt.id} {...debt} id={debt.id} />
                ))}
              </div>
            )}
          </PageSection>

          <PageSection
            title="เจ้าหนี้ของคุณ"
            description="บุคคลที่คุณต้องจัดการชำระค่างวดให้"
          >
            {isLoading || authLoading ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-5 space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-7 w-32" />
                  </div>
                ))}
              </div>
            ) : borrowerCards.length === 0 ? (
              <p className="w-full rounded-[1.1rem] border border-border/70 bg-secondary/30 py-4 text-center text-sm text-muted-foreground">คุณไม่มีภาระหนี้สินในระบบ</p>
            ) : (
              <div className="space-y-3">
                {borrowerCards.slice(0, 5).map((debt) => (
                  <DebtCard key={debt.id} {...debt} id={debt.id} />
                ))}
              </div>
            )}
          </PageSection>
        </div>
      </div>
    </PageTransition>
  );
};

export default Index;
