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
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        <Header userName={displayName} />

        {/* Dashboard Stats - New comprehensive stats */}
        <DashboardStats />

        {/* 🔴 PRIORITY 1: Pending Money Actions - สิ่งที่ต้องทำเกี่ยวกับเงิน */}
        {!isLoading && !authLoading && <PendingActionsCard />}

        {/* 🟡 PRIORITY 2: Pending Agreements that need confirmation */}
        {!isLoading && !authLoading && (
          <PendingAgreements agreements={agreements} userId={user?.id} />
        )}

        {/* 🟢 PRIORITY 3: Payment Calendar */}
        <section className="mb-6">
          <PaymentCalendar onRoleChange={handleCalendarRoleChange} />
        </section>

        {/* Active Agreements */}
        <motion.section 
          className={`mb-6 rounded-2xl p-4 transition-colors duration-300 ${
            agreementRoleFilter === "lender"
              ? "bg-green-50/50 dark:bg-green-950/20"
              : "bg-orange-50/50 dark:bg-orange-950/20"
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg text-foreground flex items-center gap-2">
              ข้อตกลงที่ใช้งาน
              <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                agreementRoleFilter === "lender"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400"
              }`}>
                {agreementRoleFilter === "lender" ? lenderCount : borrowerCount}
              </span>
            </h2>
            {filteredDebtCards.length > 5 && (
              <button 
                onClick={() => navigate('/agreements')}
                className="text-sm text-primary font-medium hover:underline"
              >
                ดูทั้งหมด
              </button>
            )}
          </div>

          {isLoading || authLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredDebtCards.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl p-8 shadow-card text-center"
            >
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                agreementRoleFilter === "lender" 
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-orange-100 dark:bg-orange-900/30"
              }`}>
                {agreementRoleFilter === "lender" ? (
                  <ArrowDownLeft className="w-8 h-8 text-green-600" />
                ) : (
                  <ArrowUpRight className="w-8 h-8 text-orange-500" />
                )}
              </div>
              <p className="text-foreground font-medium mb-2">
                {agreementRoleFilter === "lender" 
                  ? "ยังไม่มีการให้ยืม" 
                  : "ยังไม่มีการยืม"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {agreementRoleFilter === "lender" 
                  ? "สร้างข้อตกลงใหม่เพื่อเริ่มให้ยืมเงิน" 
                  : "คุณยังไม่มีการยืมเงินจากผู้อื่น"}
              </p>
              {agreementRoleFilter === "lender" && (
                <Button onClick={() => navigate('/create')}>
                  <Plus className="w-4 h-4 mr-2" />
                  สร้างข้อตกลงใหม่
                </Button>
              )}
            </motion.div>
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
                  <DebtCard
                    key={debt.id}
                    {...debt}
                    id={debt.id}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.section>
      </div>

      <BottomNav />
    </div>
  );
};

export default Index;
