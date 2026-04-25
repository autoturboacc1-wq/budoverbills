import { motion } from "framer-motion";
import { StatusBadge, Status } from "./ui/StatusBadge";
import { ArrowUpRight } from "lucide-react";
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
  const progressPercent = Math.min(
    100,
    (installmentProgress.current / Math.max(installmentProgress.total, 1)) * 100,
  );

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => navigate(`/debt/${id}`)}
      className="group block w-full rounded-md border border-border bg-card p-5 text-left transition-colors hover:border-foreground/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-[11px] font-medium text-muted-foreground">
            {partnerAvatarUrl ? (
              <img
                src={partnerAvatarUrl}
                alt={partnerName}
                className="h-full w-full object-cover"
              />
            ) : (
              partnerInitial
            )}
          </div>
          <div className="min-w-0">
            <p className="label-eyebrow">{isLender ? "Borrower" : "Lender"}</p>
            <p className="truncate text-sm font-medium text-foreground">{partnerName}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-6">
        <p className="font-serif-display text-[2.25rem] leading-none text-foreground">
          ฿<span className="num">{remainingAmount.toLocaleString()}</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          จากวงเงิน <span className="num">฿{amount.toLocaleString()}</span>
        </p>
      </div>

      <div className="mt-6">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span className="label-eyebrow">Progress</span>
          <span className="num">
            {installmentProgress.current} / {installmentProgress.total}
          </span>
        </div>
        <div className="h-px w-full bg-border">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.7, delay: delay + 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="h-px bg-foreground"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs">
        <div className="text-muted-foreground">
          <span className="label-eyebrow mr-2">Next</span>
          <span className="num text-foreground">{nextPaymentDate}</span>
        </div>
        <ArrowUpRight
          className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground"
          strokeWidth={1.5}
        />
      </div>
    </motion.button>
  );
}
