import { motion } from "framer-motion";
import { Info, Heart, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CostBreakdownProps {
  price: number;
  tierName: string;
}

interface CostItem {
  label: string;
  subLabel: string;
  percentage: number;
  description: string;
  color: string;
  tooltip?: string;
}

const calculateBreakdown = (price: number): CostItem[] => {
  // Updated breakdown based on user requirements
  const platformFee = 0.15; // 15% - App Store/Play Store
  const vat = 0.07; // 7% VAT
  const paymentGateway = 0.03; // 3% Payment gateway
  const development = 0.50; // 50% Software development
  const operation = 0.20; // 20% Operations & support
  const profit = 0.05; // 5% Profit

  return [
    {
      label: "ค่าแพลตฟอร์ม",
      subLabel: "(Apple/Google Store)",
      percentage: platformFee * 100,
      description: "15%",
      color: "bg-red-400",
      tooltip: "สำรองไว้สำหรับค่าธรรมเนียม App Store / Play Store ในอนาคต หากยังไม่ถึงตอนนั้น จะนำไปพัฒนาระบบต่อ",
    },
    {
      label: "ภาษีมูลค่าเพิ่ม",
      subLabel: "(VAT 7%)",
      percentage: vat * 100,
      description: "7%",
      color: "bg-blue-400",
      tooltip: "สำรองไว้สำหรับภาษี VAT เมื่อรายได้ถึงเกณฑ์ 1.8 ล้านบาท หากยังไม่ถึง จะนำไปพัฒนาระบบต่อ",
    },
    {
      label: "ค่าช่องทางชำระเงิน",
      subLabel: "(PromptPay/บัตรเครดิต)",
      percentage: paymentGateway * 100,
      description: "1-3%",
      color: "bg-purple-400",
      tooltip: "ขึ้นอยู่กับวิธีชำระเงินที่เลือก (PromptPay, บัตรเครดิต) ส่วนที่เหลือจะนำไปพัฒนาระบบ",
    },
    {
      label: "พัฒนาซอฟต์แวร์",
      subLabel: "(ทีมพัฒนา & เซิร์ฟเวอร์)",
      percentage: development * 100,
      description: "50%",
      color: "bg-green-400",
    },
    {
      label: "ดำเนินงาน & ดูแล",
      subLabel: "(ซัพพอร์ต & บำรุงรักษา)",
      percentage: operation * 100,
      description: "20%",
      color: "bg-yellow-400",
    },
    {
      label: "กำไร",
      subLabel: "(เพื่อพัฒนาฟีเจอร์ใหม่)",
      percentage: profit * 100,
      description: "5%",
      color: "bg-primary",
    },
  ];
};

export function CostBreakdownCard({ price, tierName }: CostBreakdownProps) {
  const breakdown = calculateBreakdown(price);
  const profitItem = breakdown.find(item => item.label === "กำไร");
  const profitAmount = profitItem ? (price * profitItem.percentage / 100).toFixed(2) : "0";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 p-4 rounded-xl bg-secondary/50 border border-border"
    >
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-medium text-foreground">
          ค่า{tierName} ฿{price} ของคุณไปที่ไหนบ้าง?
        </h4>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">เราโปร่งใสแบบ Pang Dong Lai</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Visual Bar */}
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        {breakdown.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ width: 0 }}
            animate={{ width: `${item.percentage}%` }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            className={`${item.color} first:rounded-l-full last:rounded-r-full`}
            title={`${item.label}: ${item.percentage.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Breakdown List - Responsive Layout */}
      <div className="space-y-3">
        {breakdown.map((item) => {
          const amount = (price * item.percentage / 100).toFixed(2);
          return (
            <div 
              key={item.label} 
              className="p-2.5 rounded-lg bg-background/50 border border-border/50"
            >
              {/* Row 1: Label, SubLabel, Tooltip */}
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`} />
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.subLabel}</span>
                {item.tooltip && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="p-0 h-auto ml-auto">
                        <HelpCircle className="w-4 h-4 text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" side="top">
                      <p className="text-xs text-muted-foreground">{item.tooltip}</p>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              
              {/* Row 2: Percentage and Amount */}
              <div className="flex items-center justify-between pl-4.5">
                <span className="text-xs text-muted-foreground">{item.description}</span>
                <span className="text-sm font-semibold text-foreground">฿{amount}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Profit Highlight */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">กำไรที่เหลือ (เพื่อพัฒนาแอป, ยังไม่หักภาษี)</span>
          <span className="text-sm font-semibold text-primary">฿{profitAmount}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          💚 ขอบคุณที่สนับสนุน! ทุกบาทช่วยให้เราพัฒนาฟีเจอร์ใหม่ๆ ให้คุณ
        </p>
      </div>
    </motion.div>
  );
}
