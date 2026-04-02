import { motion } from "framer-motion";
import { Coins, Gift, Trophy } from "lucide-react";
import { useUserPoints, ENGAGEMENT_BADGES } from "@/hooks/useUserPoints";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const REWARDS = [
  { id: "discount_10", label: "ส่วนลด 10%", points: 500, type: "premium_discount", value: "10%" },
  { id: "discount_20", label: "ส่วนลด 20%", points: 900, type: "premium_discount", value: "20%" },
  { id: "free_month", label: "ฟรี Premium 1 เดือน", points: 2000, type: "free_month", value: "1 month" },
];

export function PointsDisplay() {
  const { points, badges, transactions, loading, redeemPoints, DAILY_LIMIT } = useUserPoints();

  if (loading || !points) return null;

  const dailyProgress = (points.daily_earned_today / DAILY_LIMIT) * 100;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full px-3"
        >
          <Coins className="w-4 h-4 text-primary" />
          <span className="font-semibold text-primary">{points.total_points}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            คะแนนสะสม
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Points Summary */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/10 rounded-2xl p-6 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Coins className="w-8 h-8 text-primary" />
              <span className="text-4xl font-bold text-primary">{points.total_points}</span>
            </div>
            <p className="text-sm text-muted-foreground">คะแนนทั้งหมด</p>
            <p className="text-xs text-muted-foreground mt-1">
              สะสมตลอดกาล: {points.lifetime_points} คะแนน
            </p>
          </motion.div>

          {/* Daily Limit */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">คะแนนวันนี้</span>
              <span className="font-medium">{points.daily_earned_today} / {DAILY_LIMIT}</span>
            </div>
            <Progress value={dailyProgress} className="h-2" />
          </div>

          <Separator />

          {/* Badges */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Badge ที่ได้รับ
            </h3>
            {badges.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มี Badge</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => {
                  const info = ENGAGEMENT_BADGES[badge.badge_type as keyof typeof ENGAGEMENT_BADGES];
                  const tierEmoji = ["", "🥉", "🥈", "🥇"][badge.badge_tier];
                  return (
                    <Badge
                      key={badge.badge_type}
                      variant="secondary"
                      className="px-3 py-1.5"
                    >
                      {info?.icon} {info?.label} {tierEmoji}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Rewards */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Gift className="w-4 h-4" />
              แลกรางวัล
            </h3>
            <div className="space-y-3">
              {REWARDS.map((reward) => {
                const canRedeem = points.total_points >= reward.points;
                return (
                  <div
                    key={reward.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{reward.label}</p>
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        {reward.points} คะแนน
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={!canRedeem}
                      onClick={() => redeemPoints(reward.points, reward.type, reward.value)}
                      className="text-xs"
                    >
                      แลก
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Recent Transactions */}
          <div>
            <h3 className="text-sm font-semibold mb-3">ประวัติคะแนน</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {transactions.slice(0, 10).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="text-foreground">{tx.description || tx.action_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("th-TH")}
                    </p>
                  </div>
                  <span
                    className={`font-semibold ${
                      tx.points > 0 ? "text-status-paid" : "text-status-overdue"
                    }`}
                  >
                    {tx.points > 0 ? "+" : ""}{tx.points}
                  </span>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  ยังไม่มีประวัติคะแนน
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}