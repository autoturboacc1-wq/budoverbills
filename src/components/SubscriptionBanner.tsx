import { motion } from "framer-motion";
import { Coffee, Sparkles, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface SubscriptionBannerProps {
  type: "agreement" | "group";
  used: number;
  limit: number;
  isPremium?: boolean;
  credits?: number;
}

export function SubscriptionBanner({ 
  type, 
  used, 
  limit, 
  isPremium,
  credits = 0
}: SubscriptionBannerProps) {
  const navigate = useNavigate();
  const freeRemaining = Math.max(0, limit - used);
  const totalAvailable = freeRemaining + credits;
  const typeLabel = type === "agreement" ? "ข้อตกลง" : "กลุ่ม";

  // Groups are unlimited
  if (type === "group") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-secondary/50 border border-border rounded-xl p-3 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          สร้าง{typeLabel}ได้ไม่จำกัด
        </p>
      </motion.div>
    );
  }

  // Show available credits (free + purchased)
  if (totalAvailable > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Gift className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              มี {totalAvailable} สิทธิ์
            </p>
            <p className="text-xs text-muted-foreground">
              {freeRemaining > 0 && `ฟรี ${freeRemaining}`}
              {freeRemaining > 0 && credits > 0 && " + "}
              {credits > 0 && `ซื้อแล้ว ${credits}`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
          onClick={() => navigate("/subscription")}
        >
          <Coffee className="w-4 h-4 mr-1" />
          เพิ่มสิทธิ์
        </Button>
      </motion.div>
    );
  }

  // Show buy coffee prompt when no credits available
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Coffee className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            ไม่มีสิทธิ์เหลือแล้ว
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            เลี้ยงกาแฟทีมงานเพื่อรับสิทธิ์สร้าง{typeLabel}
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              onClick={() => navigate("/subscription")}
            >
              <Coffee className="w-4 h-4 mr-2" />
              เลี้ยงกาแฟ
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
