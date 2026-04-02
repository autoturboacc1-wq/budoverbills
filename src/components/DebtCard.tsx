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
      className="bg-card rounded-2xl p-5 shadow-card hover:shadow-elevated transition-shadow duration-300 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-semibold text-sm overflow-hidden">
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
            <p className="text-xs text-muted-foreground">
              {isLender ? "ผู้ยืม" : "ผู้ให้ยืม"}
            </p>
            <p className="font-medium text-foreground">{partnerName}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Amount */}
      <div className="mb-4">
        <p className="text-2xl font-heading font-semibold text-foreground">
          ฿{remainingAmount.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">
          จากทั้งหมด ฿{amount.toLocaleString()}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, delay: delay + 0.3 }}
            className="h-full bg-primary rounded-full"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          งวดที่ {installmentProgress.current} / {installmentProgress.total}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>งวดถัดไป {nextPaymentDate}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </motion.div>
  );
}
