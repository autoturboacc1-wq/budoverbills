import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import { 
  ArrowLeft, 
  Crown,
  Clock,
  Gift,
  ChevronDown,
  ChevronUp,
  Coffee,
  Heart,
  Star,
  Sparkles,
  Check
} from "lucide-react";
import coffeeBasic from "@/assets/coffee-cart.png";
import coffeePremium from "@/assets/coffee-premium.png";
import coffeeLuxury from "@/assets/coffee-luxury.png";
import { CostBreakdownCard } from "@/components/CostBreakdownCard";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Coffee tiers with credits
const COFFEE_TIERS = [
  {
    id: "basic",
    name: "กาแฟรถเข็น",
    emoji: "🍵",
    price: 19,
    credits: 1,
    image: coffeeBasic,
    description: "กาแฟแก้วเล็ก ๆ จากร้านริมทาง",
    popular: false,
  },
  {
    id: "luxury",
    name: "กาแฟหรู",
    emoji: "☕",
    price: 29,
    credits: 2,
    image: coffeeLuxury,
    description: "กาแฟร้านดังย่านออฟฟิศ",
    popular: true,
  },
  {
    id: "premium",
    name: "กาแฟพรีเมียม",
    emoji: "✨",
    price: 49,
    credits: 4,
    image: coffeePremium,
    description: "กาแฟสเปเชียลตี้พร้อมขนม",
    popular: false,
  },
];

export default function Subscription() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const paymentGatewayEnabled = false;
  const [expandedSection, setExpandedSection] = useState<string | null>("coffee");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedWhyTier, setSelectedWhyTier] = useState<string>("luxury"); // Default to popular tier
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [tipMessage, setTipMessage] = useState<string>("");
  const [showMessage, setShowMessage] = useState<boolean>(false);
  
  const { 
    isTrial, 
    trialDaysRemaining, 
    quota,
    freeRemaining
  } = useSubscription();

  const freeUsed = quota?.free_used ?? 0;
  const freeLimit = quota?.free_limit ?? 2;
  const purchasedCredits = quota?.credits ?? 0;
  const totalAvailable = (freeRemaining ?? 0) + purchasedCredits;

  const selectedCoffee = COFFEE_TIERS.find(t => t.id === selectedTier);
  const selectedWhyCoffee = COFFEE_TIERS.find(t => t.id === selectedWhyTier);
  const coffeePanelId = "subscription-coffee-panel";
  const whyPanelId = "subscription-why-panel";

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handlePurchaseCoffee = async () => {
    if (!user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    if (!paymentGatewayEnabled) {
      toast.error("ระบบรับชำระเงินยังไม่เปิดใช้งาน");
      return;
    }

    if (!selectedCoffee) {
      toast.error("กรุณาเลือกกาแฟ");
      return;
    }

    setIsSubmitting(true);

    try {
      throw new Error("Payment gateway is not enabled");
    } catch (error) {
      console.error("Error purchasing coffee:", error);
      toast.error("ระบบรับชำระเงินยังไม่เปิดใช้งาน");
    } finally {
      setIsSubmitting(false);
    }
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
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")}
            type="button"
            aria-label="กลับไปหน้าก่อนหน้า"
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <h1 className="text-xl font-heading font-semibold text-foreground">
            เลี้ยงกาแฟทีมงาน
          </h1>
        </motion.header>

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-center mb-6"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mx-auto flex items-center justify-center mb-3 shadow-lg">
            <Coffee className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground mb-1">
            เลี้ยงกาแฟทีมงาน
          </h2>
          <p className="text-muted-foreground text-sm">
            สนับสนุนทีมงานและรับสิทธิ์สร้างข้อตกลงเพิ่ม
          </p>
        </motion.div>

        {/* Current Credits Status */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">สิทธิ์ของคุณ</h2>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Total Available */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-md">
                  <Gift className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-medium text-foreground">สิทธิ์สร้างข้อตกลง</p>
                  <p className="text-sm text-muted-foreground">
                    {freeRemaining > 0 && `ฟรี ${freeRemaining}`}
                    {freeRemaining > 0 && purchasedCredits > 0 && " + "}
                    {purchasedCredits > 0 && `ซื้อแล้ว ${purchasedCredits}`}
                    {totalAvailable === 0 && "ไม่เหลือสิทธิ์"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${totalAvailable > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {totalAvailable}
                </p>
                <p className="text-xs text-muted-foreground">สิทธิ์</p>
              </div>
            </div>

            {/* Progress bar for free quota */}
            {freeLimit > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>สิทธิ์ฟรี</span>
                  <span>{freeUsed}/{freeLimit}</span>
                </div>
                <Progress 
                  value={(freeUsed / freeLimit) * 100} 
                  className="h-2"
                />
              </div>
            )}

            {/* Trial Badge */}
            {isTrial && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Clock className="w-3.5 h-3.5" />
                ทดลองใช้ • เหลือ {trialDaysRemaining} วัน
              </div>
            )}
          </div>
        </motion.section>

        {/* Coffee Selection */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <button
            onClick={() => toggleSection("coffee")}
            type="button"
            aria-expanded={expandedSection === "coffee"}
            aria-controls={coffeePanelId}
            className="w-full p-4 border-b border-border flex items-center justify-between hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Coffee className="w-5 h-5 text-amber-500" />
              <h2 className="font-medium text-foreground">เลือกกาแฟ</h2>
            </div>
            {expandedSection === "coffee" ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          <AnimatePresence>
            {expandedSection === "coffee" && (
              <motion.div
                id={coffeePanelId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-4">
                  {/* Coffee Tiers */}
                  <div className="space-y-3">
                    {COFFEE_TIERS.map((tier) => (
                      <motion.button
                        key={tier.id}
                        onClick={() => setSelectedTier(tier.id)}
                        type="button"
                        aria-pressed={selectedTier === tier.id}
                        aria-label={`${tier.name} ราคา ฿${tier.price} ได้ ${tier.credits} สิทธิ์${selectedTier === tier.id ? " เลือกแล้ว" : ""}`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full p-4 rounded-xl border-2 transition-all ${
                          selectedTier === tier.id
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-border bg-secondary/30 hover:border-amber-500/50"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Coffee Image */}
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center flex-shrink-0">
                            <img 
                              src={tier.image} 
                              alt={`${tier.name} แพ็กเกจ`}
                              className="w-12 h-12 object-contain"
                            />
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">
                                {tier.emoji} {tier.name}
                              </span>
                              {tier.popular && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white">
                                  ยอดนิยม
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {tier.description}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-lg font-bold text-amber-600">
                                ฿{tier.price}
                              </span>
                              <span className="text-sm text-emerald-600 font-medium">
                                ได้ {tier.credits} สิทธิ์
                              </span>
                            </div>
                          </div>

                          {/* Selection indicator */}
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            selectedTier === tier.id
                              ? "border-amber-500 bg-amber-500"
                              : "border-border"
                          }`}>
                            {selectedTier === tier.id && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>

                  {/* Optional Message */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowMessage(!showMessage)}
                      type="button"
                      aria-expanded={showMessage}
                      aria-controls="subscription-message"
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Heart className="w-4 h-4" />
                      <span>{showMessage ? "ซ่อนข้อความ" : "เพิ่มข้อความถึงทีมงาน"}</span>
                      {showMessage ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    
                    <AnimatePresence>
                      {showMessage && (
                        <motion.div
                          id="subscription-message"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                        >
                          <Textarea
                            value={tipMessage}
                            onChange={(e) => setTipMessage(e.target.value)}
                            aria-label="ข้อความถึงทีมงาน"
                            placeholder="ฝากข้อความถึงทีมงาน..."
                            rows={2}
                            className="mt-2"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Submit Button */}
                  {selectedCoffee && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm text-muted-foreground">รายการที่เลือก</p>
                          <p className="font-medium text-foreground">
                            {selectedCoffee.emoji} {selectedCoffee.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-amber-600">฿{selectedCoffee.price}</p>
                          <p className="text-sm text-emerald-600 font-medium">
                            +{selectedCoffee.credits} สิทธิ์
                          </p>
                        </div>
                      </div>

                      <Button
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium py-6"
                        onClick={handlePurchaseCoffee}
                        disabled={isSubmitting || !paymentGatewayEnabled}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin">⏳</span>
                            กำลังดำเนินการ...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Coffee className="w-5 h-5" />
                            เลี้ยงกาแฟ ฿{selectedCoffee.price}
                          </span>
                        )}
                      </Button>

                      <p className="text-xs text-center text-muted-foreground mt-2">
                        ระบบชำระเงินจริงยังไม่เปิดใช้งาน
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Why Support Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <button
            onClick={() => toggleSection("why")}
            type="button"
            aria-expanded={expandedSection === "why"}
            aria-controls={whyPanelId}
            className="w-full p-4 border-b border-border flex items-center justify-between hover:bg-secondary/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-amber-500" />
              <h2 className="font-medium text-foreground">ทำไมต้องสนับสนุน?</h2>
            </div>
            {expandedSection === "why" ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          <AnimatePresence>
            {expandedSection === "why" && (
              <motion.div
                id={whyPanelId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-4">
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>พัฒนาฟีเจอร์ใหม่ๆ ตามความต้องการผู้ใช้</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>รักษาความปลอดภัยและความเสถียรของระบบ</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>ค่าเซิร์ฟเวอร์และโครงสร้างพื้นฐาน</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>เลี้ยงกาแฟทีมพัฒนา ☕</span>
                    </li>
                  </ul>

                  {/* Interactive Coffee Selection for Cost Breakdown */}
                  <div className="pt-2">
                    <p className="text-sm text-muted-foreground mb-3">
                      เลือกกาแฟเพื่อดูรายละเอียดค่าใช้จ่าย:
                    </p>
                    <div className="flex gap-2">
                      {COFFEE_TIERS.map((tier) => (
                        <button
                          key={tier.id}
                          onClick={() => setSelectedWhyTier(tier.id)}
                          type="button"
                          aria-pressed={selectedWhyTier === tier.id}
                          aria-label={`${tier.name} ราคา ฿${tier.price}${selectedWhyTier === tier.id ? " เลือกอยู่" : ""}`}
                          className={`flex-1 py-2 px-3 rounded-xl border-2 transition-all text-center ${
                            selectedWhyTier === tier.id
                              ? "border-amber-500 bg-amber-500/10"
                              : "border-border bg-secondary/30 hover:border-amber-500/50"
                          }`}
                        >
                          <div className="text-xl mb-1">{tier.emoji}</div>
                          <div className="text-xs font-medium text-foreground truncate">
                            {tier.name}
                          </div>
                          <div className="text-xs text-amber-600 font-semibold">
                            ฿{tier.price}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cost Breakdown for Selected Tier */}
                  {selectedWhyCoffee && (
                    <CostBreakdownCard 
                      price={selectedWhyCoffee.price} 
                      tierName={selectedWhyCoffee.name} 
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>

    </div>
    </PageTransition>
  );
}
