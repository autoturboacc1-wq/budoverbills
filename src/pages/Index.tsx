import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { Header } from "@/components/Header";
import { DashboardStats } from "@/components/DashboardStats";
import { DebtCard } from "@/components/DebtCard";
import { PendingAgreements } from "@/components/PendingAgreements";
import { PendingActionsCard } from "@/components/home/PendingActionsCard";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { PageSection } from "@/components/ux";
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

          <section className="flex items-center justify-between gap-3 border-b border-border/80 pb-4">
            <div>
              <p className="label-eyebrow">Dashboard</p>
              <h2 className="mt-1 font-serif-display text-[1.55rem] leading-tight text-foreground">
                ภาพรวมวันนี้
              </h2>
            </div>
            <Button onClick={() => navigate("/create")} size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
              สร้าง
            </Button>
          </section>

          <DashboardStats />

          {!isLoading && !authLoading && <PendingActionsCard />}

          {!isLoading && !authLoading && (
            <PendingAgreements agreements={agreements} userId={user?.id} />
          )}

          <PageSection
            title="ต้องรับ"
            action={
              lenderCards.length > 5 ? (
                <button
                  type="button"
                  onClick={() => navigate("/history")}
                  className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                >
                  ทั้งหมด
                </button>
              ) : null
            }
          >
            {isLoading || authLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-4 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
            ) : lenderCards.length === 0 ? (
              <div className="rounded-[1.1rem] border border-dashed border-border bg-card p-5 text-center">
                <p className="text-sm font-medium text-foreground">ยังไม่มีรายการ</p>
                <Button onClick={() => navigate("/create")} size="sm" variant="outline" className="mt-3">
                  <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                  ปล่อยยืม
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {lenderCards.slice(0, 5).map((debt) => (
                  <DebtCard key={debt.id} {...debt} id={debt.id} />
                ))}
              </div>
            )}
          </PageSection>

          <PageSection
            title="ต้องจ่าย"
          >
            {isLoading || authLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-4 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
            ) : borrowerCards.length === 0 ? (
              <p className="w-full rounded-[1.1rem] border border-border/70 bg-secondary/30 py-4 text-center text-sm text-muted-foreground">ไม่มีรายการ</p>
            ) : (
              <div className="space-y-2">
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
