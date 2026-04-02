import { motion } from "framer-motion";
import { ArrowLeft, Calculator, Loader2, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { DebtStrategyComparison } from "@/components/DebtStrategyComparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { calculateRemainingAmount, getPartnerName } from "@/domains/debt";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import {
  estimateMonthlyPayment,
  frequencyNeedsMonthlyEstimate,
  type DebtItem,
} from "@/utils/debtStrategies";

export default function DebtConsolidation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agreements, isLoading } = useDebtAgreements();

  const debts = useMemo<DebtItem[]>(() => {
    return agreements
      .filter(
        (agreement) =>
          agreement.borrower_id === user?.id &&
          agreement.status === "active" &&
          calculateRemainingAmount(agreement.installments) > 0,
      )
      .map((agreement) => {
        const pendingInstallments = (agreement.installments ?? []).filter(
          (installment) => installment.status !== "paid",
        );
        const averagePendingInstallment =
          pendingInstallments.length > 0
            ? pendingInstallments.reduce((sum, installment) => sum + installment.amount, 0) /
              pendingInstallments.length
            : 0;

        return {
          id: agreement.id,
          name: getPartnerName(agreement, user?.id),
          balance: calculateRemainingAmount(agreement.installments),
          minPayment: estimateMonthlyPayment(averagePendingInstallment, agreement.frequency),
          interestRate: agreement.interest_type === "none" ? 0 : agreement.interest_rate,
          frequency: agreement.frequency,
        };
      });
  }, [agreements, user?.id]);

  const isEstimate = useMemo(
    () => debts.some((debt) => frequencyNeedsMonthlyEstimate(debt.frequency)),
    [debts],
  );

  const totalBalance = useMemo(
    () => debts.reduce((sum, debt) => sum + debt.balance, 0),
    [debts],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-5xl mx-auto px-4">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 py-4"
        >
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-semibold text-foreground">
              Debt Consolidation
            </h1>
            <p className="text-sm text-muted-foreground">
              เทียบแผนจ่ายหนี้แบบ Snowball และ Avalanche
            </p>
          </div>
        </motion.header>

        {debts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-3xl p-8 shadow-card text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Calculator className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-semibold text-foreground">
              ยังไม่มีหนี้ฝั่งผู้ยืมที่ต้องวางแผนเพิ่ม
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              ฟีเจอร์นี้จะแสดงเมื่อคุณมีข้อตกลงที่ยังต้องชำระอย่างน้อย 1 รายการ
            </p>
            <Button className="mt-5" onClick={() => navigate("/history")}>
              กลับไปประวัติข้อตกลง
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-5">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]"
            >
              <Card className="overflow-hidden border-0 bg-[linear-gradient(135deg,rgba(14,116,144,0.14),rgba(249,115,22,0.12),rgba(255,255,255,0.55))] shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <Badge variant="secondary" className="bg-background/80 text-foreground">
                        Borrower planner
                      </Badge>
                      <h2 className="text-2xl font-heading font-semibold text-foreground">
                        จัดลำดับหนี้ที่ควรเร่งจ่ายก่อน
                      </h2>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        ระบบจะจำลองการปิดหนี้จากยอดคงเหลือจริงในแอป เพื่อช่วยตัดสินใจว่าควรเน้น
                        ปิดก้อนเล็กก่อนหรือก้อนดอกเบี้ยสูงก่อน
                      </p>
                    </div>
                    <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-background/80 lg:flex">
                      <Sparkles className="h-7 w-7 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardContent className="grid h-full gap-3 p-6 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <p className="text-sm text-muted-foreground">หนี้ที่ยังค้าง</p>
                    <p className="mt-1 text-3xl font-heading font-bold text-foreground">
                      {debts.length}
                    </p>
                    <p className="text-xs text-muted-foreground">สัญญา</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ยอดคงเหลือรวม</p>
                    <p className="mt-1 text-3xl font-heading font-bold text-foreground">
                      ฿{totalBalance.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ใช้ข้อมูลจากงวดที่ยังไม่ชำระทั้งหมด
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            >
              {debts.map((debt) => (
                <Card key={debt.id} className="shadow-card">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{debt.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {debt.frequency === "daily"
                            ? "รายวัน"
                            : debt.frequency === "weekly"
                              ? "รายสัปดาห์"
                              : "รายเดือน"}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {debt.interestRate > 0 ? `${debt.interestRate}%` : "ไม่มีดอกเบี้ย"}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">ยอดคงเหลือ</span>
                        <span className="font-semibold text-foreground">
                          ฿{debt.balance.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">ขั้นต่ำต่อเดือน</span>
                        <span className="font-medium text-foreground">
                          ฿{debt.minPayment.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <DebtStrategyComparison debts={debts} isEstimate={isEstimate} />
            </motion.section>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
