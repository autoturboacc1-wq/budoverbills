import { cn } from "@/lib/utils";

export type Status = "paid" | "pending" | "overdue" | "negotiating" | "pending_confirmation" | "active" | "completed" | "awaiting_transfer_confirmation";

interface StatusBadgeProps {
  status: Status;
  className?: string;
  size?: "sm" | "md";
}

const statusConfig: Record<Status, { label: string; dotClass: string; bgClass: string }> = {
  paid: {
    label: "ชำระแล้ว",
    dotClass: "bg-status-paid",
    bgClass: "bg-status-paid/10 text-status-paid",
  },
  pending: {
    label: "ยังไม่ยืนยัน",
    dotClass: "bg-status-pending",
    bgClass: "bg-status-pending/10 text-status-pending",
  },
  overdue: {
    label: "เลยกำหนด",
    dotClass: "bg-status-overdue",
    bgClass: "bg-status-overdue/10 text-status-overdue",
  },
  negotiating: {
    label: "อยู่ระหว่างตกลง",
    dotClass: "bg-status-negotiating",
    bgClass: "bg-status-negotiating/10 text-status-negotiating",
  },
  pending_confirmation: {
    label: "รอยืนยัน",
    dotClass: "bg-status-pending",
    bgClass: "bg-status-pending/10 text-status-pending",
  },
  active: {
    label: "ดำเนินการ",
    dotClass: "bg-primary",
    bgClass: "bg-primary/10 text-primary",
  },
  awaiting_transfer_confirmation: {
    label: "รอยืนยันรับเงิน",
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-500/10 text-amber-600",
  },
  completed: {
    label: "เสร็จสิ้น",
    dotClass: "bg-status-paid",
    bgClass: "bg-status-paid/10 text-status-paid",
  },
};

export function StatusBadge({ status, className, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        config.bgClass,
        className
      )}
    >
      <span className={cn("rounded-full", size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5", config.dotClass)} />
      {config.label}
    </span>
  );
}
