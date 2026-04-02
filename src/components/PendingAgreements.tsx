import { motion } from "framer-motion";
import { Clock, ArrowRight, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DebtAgreement } from "@/hooks/useDebtAgreements";

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-status-pending/20 flex items-center justify-center">
          <Bell className="w-3.5 h-3.5 text-status-pending" />
        </div>
        <h2 className="font-heading font-semibold text-foreground">
          รอการยืนยัน ({pendingAgreements.length})
        </h2>
      </div>

      <div className="space-y-3">
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
              className={`rounded-xl p-4 cursor-pointer transition-all ${
                needsMyConfirmation 
                  ? "bg-status-pending/10 border-2 border-status-pending/30 hover:border-status-pending/50" 
                  : "bg-card border border-border hover:shadow-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    needsMyConfirmation ? "bg-status-pending/20" : "bg-secondary"
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
                    <span className="text-xs font-medium text-status-pending bg-status-pending/20 px-2 py-1 rounded-full">
                      รอคุณยืนยัน
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
