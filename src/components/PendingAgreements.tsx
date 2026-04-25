import { motion } from "framer-motion";
import { Clock, ArrowRight, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DebtAgreement } from "@/hooks/useDebtAgreements";
import { PageSection } from "@/components/ux";

// Domain imports - SINGLE SOURCE OF TRUTH
import { 
  isUserLender, 
  getPartnerName, 
  needsUserConfirmation 
} from "@/domains/debt";

interface PendingAgreementsProps {
  agreements: DebtAgreement[];
  userId?: string;
}

export function PendingAgreements({ agreements, userId }: PendingAgreementsProps) {
  const navigate = useNavigate();

  const pendingAgreements = agreements.filter(
    a => a.status === 'pending_confirmation'
  );

  if (pendingAgreements.length === 0) return null;

  return (
    <PageSection
      title="รอการยืนยัน"
      description="ข้อตกลงที่ต้องมีอีกฝ่ายกดยืนยันก่อนเริ่มใช้งาน"
      action={
        <span className="rounded-full border border-status-pending/20 bg-status-pending/10 px-2.5 py-1 text-xs font-medium text-status-pending">
          {pendingAgreements.length} รายการ
        </span>
      }
    >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        {pendingAgreements.map((agreement, index) => {
          // Use domain functions instead of direct comparisons
          const isLender = isUserLender(agreement, userId);
          const needsMyConfirmation = needsUserConfirmation(agreement, userId, isLender);
          const partnerName = getPartnerName(agreement, userId);

          return (
            <motion.div
              key={agreement.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => navigate(`/agreement/${agreement.id}/confirm`)}
              className={`cursor-pointer rounded-[1.1rem] border p-4 text-left transition-colors ${
                needsMyConfirmation 
                  ? "border-status-pending/30 bg-status-pending/10 hover:border-status-pending/50"
                  : "border-border/80 bg-card/90 hover:border-foreground/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                    needsMyConfirmation ? "border-status-pending/20 bg-status-pending/10" : "border-border/80 bg-secondary/60"
                  }`}>
                    <Clock className={`w-5 h-5 ${
                      needsMyConfirmation ? "text-status-pending" : "text-muted-foreground"
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{partnerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {isLender ? "คุณให้ยืม" : "คุณยืม"} ฿{agreement.total_amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {needsMyConfirmation && (
                    <span className="rounded-full border border-status-pending/20 bg-status-pending/10 px-2 py-1 text-xs font-medium text-status-pending">
                      รอคุณยืนยัน
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </PageSection>
  );
}
