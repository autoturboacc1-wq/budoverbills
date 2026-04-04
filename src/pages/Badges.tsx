import { motion } from "framer-motion";
import { ArrowLeft, Lock, Check, TrendingUp } from "lucide-react";
import { PageTransition } from "@/components/ux/PageTransition";
import { useNavigate } from "react-router-dom";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { getUserRoleInAgreement } from "@/domains/debt";

interface Badge {
  id: string;
  emoji: string;
  name: string;
  description: string;
  condition: string;
  category: "payment" | "agreement" | "milestone";
  requiredCount: number;
  currentCount: number;
  unlocked: boolean;
}

export default function Badges() {
  const navigate = useNavigate();
  const { agreements } = useDebtAgreements();
  const { user } = useAuth();

  const badgeStats = useMemo(() => {
    // Count on-time payments
    const onTimePayments = agreements.reduce((count, agreement) => {
      return count + (agreement.installments || []).filter(
        i => i.status === "paid" && i.confirmed_by_lender
      ).length;
    }, 0);

    // Count completed agreements
    const completedAgreements = agreements.filter(a => a.status === "completed").length;

    // Count as lender - use domain layer
    const asLender = agreements.filter(a => 
      getUserRoleInAgreement(a, user?.id) === 'lender'
    ).length;

    // Count as borrower - use domain layer
    const asBorrower = agreements.filter(a => 
      getUserRoleInAgreement(a, user?.id) === 'borrower'
    ).length;

    // Total agreements
    const totalAgreements = agreements.length;

    return {
      onTimePayments,
      completedAgreements,
      asLender,
      asBorrower,
      totalAgreements,
    };
  }, [agreements, user]);

  const allBadges: Badge[] = [
    // Payment badges
    {
      id: "first-payment",
      emoji: "💫",
      name: "ก้าวแรก",
      description: "ชำระงวดแรกสำเร็จ",
      condition: "ชำระงวดแรกและได้รับการยืนยัน",
      category: "payment",
      requiredCount: 1,
      currentCount: badgeStats.onTimePayments,
      unlocked: badgeStats.onTimePayments >= 1,
    },
    {
      id: "consistent-5",
      emoji: "⭐",
      name: "จ่ายตรงเวลา",
      description: "ชำระตรงเวลา 5 ครั้ง",
      condition: "ชำระงวดและได้รับการยืนยัน 5 ครั้ง",
      category: "payment",
      requiredCount: 5,
      currentCount: badgeStats.onTimePayments,
      unlocked: badgeStats.onTimePayments >= 5,
    },
    {
      id: "consistent-10",
      emoji: "🌟",
      name: "มือชั้นเยี่ยม",
      description: "ชำระตรงเวลา 10 ครั้ง",
      condition: "ชำระงวดและได้รับการยืนยัน 10 ครั้ง",
      category: "payment",
      requiredCount: 10,
      currentCount: badgeStats.onTimePayments,
      unlocked: badgeStats.onTimePayments >= 10,
    },
    {
      id: "consistent-25",
      emoji: "💎",
      name: "วินัยเพชร",
      description: "ชำระตรงเวลา 25 ครั้ง",
      condition: "ชำระงวดและได้รับการยืนยัน 25 ครั้ง",
      category: "payment",
      requiredCount: 25,
      currentCount: badgeStats.onTimePayments,
      unlocked: badgeStats.onTimePayments >= 25,
    },
    // Agreement badges
    {
      id: "first-agreement",
      emoji: "📝",
      name: "เริ่มต้นดี",
      description: "สร้างข้อตกลงแรก",
      condition: "มีข้อตกลงอย่างน้อย 1 รายการ",
      category: "agreement",
      requiredCount: 1,
      currentCount: badgeStats.totalAgreements,
      unlocked: badgeStats.totalAgreements >= 1,
    },
    {
      id: "first-complete",
      emoji: "🏆",
      name: "ปิดหนี้สำเร็จ",
      description: "ปิดข้อตกลงครั้งแรก",
      condition: "มีข้อตกลงสถานะ 'เสร็จสิ้น' อย่างน้อย 1 รายการ",
      category: "agreement",
      requiredCount: 1,
      currentCount: badgeStats.completedAgreements,
      unlocked: badgeStats.completedAgreements >= 1,
    },
    {
      id: "complete-3",
      emoji: "🎯",
      name: "นักปิดหนี้",
      description: "ปิดข้อตกลง 3 รายการ",
      condition: "มีข้อตกลงสถานะ 'เสร็จสิ้น' 3 รายการ",
      category: "agreement",
      requiredCount: 3,
      currentCount: badgeStats.completedAgreements,
      unlocked: badgeStats.completedAgreements >= 3,
    },
    {
      id: "complete-10",
      emoji: "👑",
      name: "เจ้าแห่งวินัย",
      description: "ปิดข้อตกลง 10 รายการ",
      condition: "มีข้อตกลงสถานะ 'เสร็จสิ้น' 10 รายการ",
      category: "agreement",
      requiredCount: 10,
      currentCount: badgeStats.completedAgreements,
      unlocked: badgeStats.completedAgreements >= 10,
    },
    // Milestone badges
    {
      id: "trusted-lender",
      emoji: "🤝",
      name: "ผู้ให้ที่ไว้วางใจ",
      description: "เป็นผู้ให้ยืม 3 ครั้ง",
      condition: "สร้างข้อตกลงในฐานะผู้ให้ยืม 3 รายการ",
      category: "milestone",
      requiredCount: 3,
      currentCount: badgeStats.asLender,
      unlocked: badgeStats.asLender >= 3,
    },
    {
      id: "reliable-borrower",
      emoji: "✨",
      name: "ผู้ยืมน่าเชื่อถือ",
      description: "เป็นผู้ยืม 3 ครั้ง",
      condition: "มีข้อตกลงในฐานะผู้ยืม 3 รายการ",
      category: "milestone",
      requiredCount: 3,
      currentCount: badgeStats.asBorrower,
      unlocked: badgeStats.asBorrower >= 3,
    },
    {
      id: "new-member",
      emoji: "🌱",
      name: "สมาชิกใหม่",
      description: "เริ่มต้นการเดินทาง",
      condition: "สมัครสมาชิกและเข้าใช้งาน",
      category: "milestone",
      requiredCount: 1,
      currentCount: user ? 1 : 0,
      unlocked: !!user,
    },
  ];

  const unlockedBadges = allBadges.filter(b => b.unlocked);
  const lockedBadges = allBadges.filter(b => !b.unlocked);

  const categoryLabels = {
    payment: "การชำระเงิน",
    agreement: "ข้อตกลง",
    milestone: "ความสำเร็จ",
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 py-4"
        >
          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/profile");
              }
            }}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-semibold text-foreground">
              เหรียญรางวัล
            </h1>
            <p className="text-sm text-muted-foreground">
              ปลดล็อค {unlockedBadges.length}/{allBadges.length} เหรียญ
            </p>
          </div>
        </motion.header>

        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-5 mb-6 border border-primary/20"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-heading font-semibold text-foreground">ความก้าวหน้า</p>
                <p className="text-sm text-muted-foreground">
                  {Math.round((unlockedBadges.length / allBadges.length) * 100)}% สำเร็จ
                </p>
              </div>
            </div>
          </div>
          <Progress 
            value={(unlockedBadges.length / allBadges.length) * 100} 
            className="h-2"
          />
        </motion.div>

        {/* Unlocked Badges */}
        {unlockedBadges.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h2 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-status-paid" />
              ปลดล็อคแล้ว ({unlockedBadges.length})
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {unlockedBadges.map((badge, index) => (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="bg-card rounded-2xl p-4 shadow-card text-center"
                >
                  <div className="text-4xl mb-2">{badge.emoji}</div>
                  <p className="text-sm font-medium text-foreground truncate">{badge.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {badge.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Locked Badges */}
        {lockedBadges.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-muted-foreground" />
              ยังไม่ปลดล็อค ({lockedBadges.length})
            </h2>
            <div className="space-y-3">
              {lockedBadges.map((badge, index) => {
                const progress = Math.min((badge.currentCount / badge.requiredCount) * 100, 100);
                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className="bg-card rounded-2xl p-4 shadow-card"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 relative">
                        <span className="text-3xl opacity-40">{badge.emoji}</span>
                        <Lock className="w-4 h-4 text-muted-foreground absolute bottom-0 right-0" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{badge.name}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {categoryLabels[badge.category]}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {badge.condition}
                        </p>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>ความก้าวหน้า</span>
                            <span>{badge.currentCount}/{badge.requiredCount}</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Empty State */}
        {allBadges.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl p-8 text-center"
          >
            <div className="text-5xl mb-4">🏆</div>
            <p className="text-foreground font-medium mb-2">เริ่มสะสมเหรียญ</p>
            <p className="text-sm text-muted-foreground">
              ใช้งานแอปเพื่อปลดล็อคเหรียญรางวัล
            </p>
          </motion.div>
        )}
      </div>

    </div>
    </PageTransition>
  );
}
