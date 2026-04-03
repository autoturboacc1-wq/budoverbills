import { Heart, Sparkles, Clock, HandHeart, PartyPopper, MessageCircleHeart } from "lucide-react";
import type { Status } from "@/components/ui/StatusBadge";

interface EmpathyMessageProps {
  status: Status;
  role?: "lender" | "borrower";
  className?: string;
}

const empathyConfig: Record<Status, { 
  message: string; 
  subMessage?: string;
  icon: React.ElementType; 
  colorClass: string;
}> = {
  paid: {
    message: "ยอดเยี่ยมมาก! ขอบคุณนะ 🎉",
    subMessage: "มิตรภาพดีๆ เริ่มจากความไว้วางใจ",
    icon: PartyPopper,
    colorClass: "text-status-paid",
  },
  pending: {
    message: "รอการยืนยัน ใจเย็นๆ นะ",
    subMessage: "เราจะแจ้งให้ทราบทันทีเมื่อมีการอัปเดต",
    icon: Clock,
    colorClass: "text-status-pending",
  },
  due_soon: {
    message: "ใกล้ครบกำหนดแล้ว เตรียมตัวไว้ก่อนนะ",
    subMessage: "วางแผนล่วงหน้านิดเดียว จะช่วยให้จัดการได้สบายขึ้น",
    icon: Clock,
    colorClass: "text-amber-600",
  },
  overdue: {
    message: "เราเข้าใจ ค่อยๆ จัดการนะ 💙",
    subMessage: "ทุกคนมีช่วงเวลาที่ยากลำบาก เราอยู่ข้างคุณ",
    icon: HandHeart,
    colorClass: "text-status-overdue",
  },
  verifying: {
    message: "กำลังตรวจสอบให้เรียบร้อย",
    subMessage: "รอสักครู่ เมื่อเสร็จแล้วจะแจ้งให้ทราบทันที",
    icon: Clock,
    colorClass: "text-primary",
  },
  rejected: {
    message: "ยังต้องแก้ไขอีกนิดนะ",
    subMessage: "ตรวจสอบรายละเอียดแล้วลองส่งใหม่อีกครั้งได้เลย",
    icon: MessageCircleHeart,
    colorClass: "text-destructive",
  },
  negotiating: {
    message: "กำลังหาทางออกร่วมกัน",
    subMessage: "การสื่อสารที่ดีคือกุญแจสำคัญ",
    icon: MessageCircleHeart,
    colorClass: "text-status-negotiating",
  },
  pending_confirmation: {
    message: "รอยืนยันสักครู่นะ",
    subMessage: "อีกฝ่ายจะได้รับการแจ้งเตือนแล้ว",
    icon: Clock,
    colorClass: "text-status-pending",
  },
  active: {
    message: "กำลังดำเนินการอยู่",
    subMessage: "ทุกอย่างเป็นไปตามแผน",
    icon: Sparkles,
    colorClass: "text-primary",
  },
  awaiting_transfer_confirmation: {
    message: "รอยืนยันรับเงิน",
    subMessage: "ผู้ให้ยืมโอนเงินแล้ว รอผู้ยืมยืนยัน",
    icon: Clock,
    colorClass: "text-amber-600",
  },
  completed: {
    message: "เสร็จสิ้นแล้ว! 🎊",
    subMessage: "ขอบคุณที่รักษาคำมั่นสัญญา มิตรภาพยังคงแน่นแฟ้น",
    icon: Heart,
    colorClass: "text-status-paid",
  },
  cancelled: {
    message: "ข้อตกลงนี้ถูกยกเลิกแล้ว",
    subMessage: "สามารถเริ่มต้นข้อตกลงใหม่ได้เมื่อทั้งสองฝ่ายพร้อม",
    icon: HandHeart,
    colorClass: "text-muted-foreground",
  },
};

export function EmpathyMessage({ status, role, className }: EmpathyMessageProps) {
  const config = empathyConfig[status];
  
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl bg-secondary/50 ${className}`}>
      <div className={`w-8 h-8 rounded-full bg-background flex items-center justify-center flex-shrink-0 ${config.colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.colorClass}`}>
          {config.message}
        </p>
        {config.subMessage && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {config.subMessage}
          </p>
        )}
      </div>
    </div>
  );
}
