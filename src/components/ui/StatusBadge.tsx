import { cn } from "@/lib/utils";

export type Status =
  | "paid"
  | "pending"
  | "overdue"
  | "negotiating"
  | "pending_confirmation"
  | "active"
  | "completed"
  | "awaiting_transfer_confirmation"
  | "cancelled"
  | "due_soon"
  | "verifying"
  | "rejected";

interface StatusBadgeProps {
  status: Status;
  className?: string;
  size?: "sm" | "md";
}

const statusConfig = {
  paid: { label: "ชำระแล้ว", dotClass: "bg-status-paid" },
  pending: { label: "ยังไม่ยืนยัน", dotClass: "bg-status-pending" },
  overdue: { label: "เลยกำหนด", dotClass: "bg-status-overdue" },
  due_soon: { label: "ใกล้ครบกำหนด", dotClass: "bg-status-overdue" },
  verifying: { label: "รอตรวจสอบ", dotClass: "bg-foreground" },
  rejected: { label: "ต้องแก้ไข", dotClass: "bg-destructive" },
  negotiating: { label: "อยู่ระหว่างตกลง", dotClass: "bg-status-negotiating" },
  pending_confirmation: { label: "รอยืนยัน", dotClass: "bg-status-pending" },
  active: { label: "ดำเนินการ", dotClass: "bg-foreground" },
  awaiting_transfer_confirmation: { label: "รอยืนยันรับเงิน", dotClass: "bg-status-pending" },
  completed: { label: "เสร็จสิ้น", dotClass: "bg-status-paid" },
  cancelled: { label: "ยกเลิกแล้ว", dotClass: "bg-muted-foreground/60" },
} satisfies Record<Status, { label: string; dotClass: string }>;

export function StatusBadge({ status, className, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status];

  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium text-muted-foreground",
        size === "sm" ? "text-[10px]" : "text-[11px]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full",
          size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5",
          config.dotClass,
        )}
      />
      <span className="tracking-wide">{config.label}</span>
    </span>
  );
}
