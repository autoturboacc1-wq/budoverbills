import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Clock } from "lucide-react";

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  iconBg: string;
  delay?: number;
}

function StatCard({ icon: Icon, label, value, subtext, iconBg, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="bg-card rounded-xl p-4 shadow-card"
    >
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-heading font-semibold text-foreground">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
    </motion.div>
  );
}

interface QuickStatsProps {
  totalToReceive?: number;
  totalToPay?: number;
}

export function QuickStats({ totalToReceive = 0, totalToPay = 0 }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        icon={TrendingUp}
        label="ยอดต้องรับ"
        value={`฿${totalToReceive.toLocaleString()}`}
        iconBg="bg-status-paid/10 text-status-paid"
        delay={0.1}
      />
      <StatCard
        icon={TrendingDown}
        label="ยอดต้องจ่าย"
        value={`฿${totalToPay.toLocaleString()}`}
        iconBg="bg-status-overdue/10 text-status-overdue"
        delay={0.2}
      />
      <StatCard
        icon={Clock}
        label="งวดถัดไป"
        value="ดูปฏิทิน"
        iconBg="bg-status-pending/10 text-status-pending"
        delay={0.3}
      />
    </div>
  );
}
