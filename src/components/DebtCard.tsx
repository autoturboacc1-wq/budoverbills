import { motion } from "framer-motion";
import { StatusBadge, Status } from "./ui/StatusBadge";
import { Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface DebtCardProps {
  id: number | string;
  partnerName: string;
  partnerInitial: string;
  partnerAvatarUrl?: string | null;
  amount: number;
  remainingAmount: number;
  nextPaymentDate: string;
  installmentProgress: { current: number; total: number };
  status: Status;
  isLender: boolean;
  delay?: number;
}

export function DebtCard({
  id,
  partnerName,
  partnerInitial,
  partnerAvatarUrl,
  amount,
  remainingAmount,
  nextPaymentDate,
  installmentProgress,
  status,
  isLender,
  delay = 0,
}: DebtCardProps) {
  const navigate = useNavigate();
  const progressPercent = (installmentProgress.current / installmentProgress.total) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      onClick={() => navigate(`/debt/${id}`)}
      className="surface-panel cursor-pointer transition-shadow duration-300 group hover:shadow-elevated"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 overflow-hidden rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
            {partnerAvatarUrl ? (
              <img 
                src={partnerAvatarUrl} 
                alt={partnerName}
                className="w-full h-full object-cover"
              />
            ) : (
              partnerInitial
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {isLender ? "Borrower" : "Lender"}
            </p>
            <p className="font-medium text-foreground">{partnerName}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">ยอดคงเหลือ</p>
        <p className="text-2xl font-heading font-semibold text-foreground">
          ฿{remainingAmount.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">
          จากวงเงินทั้งหมด ฿{amount.toLocaleString()}
        </p>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>ความคืบหน้า</span>
          <span>
            งวด {installmentProgress.current} / {installmentProgress.total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, delay: delay + 0.3 }}
            className="h-full bg-primary rounded-full"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>งวดถัดไป {nextPaymentDate}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </motion.div>
  );
}
