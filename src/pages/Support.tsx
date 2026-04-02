import { motion } from "framer-motion";
import { ArrowLeft, Coffee, Heart, DollarSign, Sparkles, Gift, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Currency = "THB" | "USD";

const PRESET_AMOUNTS: Record<Currency, number[]> = {
  THB: [29, 59, 99, 199],
  USD: [1, 2, 5, 10],
};

export default function Support() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currency, setCurrency] = useState<Currency>("THB");
  const [amount, setAmount] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectedAmount = customAmount || amount;
  const currencySymbol = currency === "THB" ? "฿" : "$";

  const handleAmountSelect = (value: number) => {
    setAmount(String(value));
    setCustomAmount("");
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setCustomAmount(value);
    setAmount("");
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    if (!selectedAmount || Number(selectedAmount) <= 0) {
      toast.error("กรุณาเลือกหรือใส่จำนวนเงิน");
      return;
    }

    setIsSubmitting(true);

    try {
      // Record tip in database
      const { error } = await supabase.rpc("record_tip", {
        p_user_id: user.id,
        p_amount: Number(selectedAmount),
        p_currency: currency,
        p_message: message || undefined,
        p_display_name: displayName || undefined,
        p_is_anonymous: isAnonymous,
      });

      if (error) throw error;

      toast.success("ขอบคุณสำหรับการสนับสนุน! 🙏", {
        description: "เราจะนำไปพัฒนาแอปให้ดียิ่งขึ้น",
      });

      // Reset form
      setAmount("");
      setCustomAmount("");
      setMessage("");
      setDisplayName("");
      
      // TODO: Integrate with actual payment gateway (PromptPay, Stripe)
      // For now, just record the intent
      
    } catch (error) {
      console.error("Error recording tip:", error);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="max-w-lg mx-auto px-4 pb-24">
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
          <h1 className="text-xl font-heading font-semibold text-foreground">สนับสนุนเรา</h1>
        </motion.header>

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mx-auto flex items-center justify-center mb-4 shadow-lg">
            <Coffee className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
            เลี้ยงกาแฟทีมงาน ☕
          </h2>
          <p className="text-muted-foreground">
            ช่วยเราพัฒนาแอปให้ดียิ่งขึ้น
          </p>
        </motion.div>

        {/* Currency Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex justify-center gap-2 mb-6"
        >
          <Button
            variant={currency === "THB" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrency("THB")}
            className={currency === "THB" ? "bg-primary" : ""}
          >
            🇹🇭 บาท
          </Button>
          <Button
            variant={currency === "USD" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrency("USD")}
            className={currency === "USD" ? "bg-primary" : ""}
          >
            🇺🇸 USD
          </Button>
        </motion.div>

        {/* Amount Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-5 shadow-card mb-6"
        >
          <div className="flex items-center gap-2 text-foreground font-medium mb-4">
            <Gift className="w-5 h-5 text-primary" />
            <span>เลือกจำนวน</span>
          </div>

          {/* Preset Amounts */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {PRESET_AMOUNTS[currency].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleAmountSelect(preset)}
                className={`py-3 px-2 rounded-xl font-medium text-sm transition-all ${
                  amount === String(preset) && !customAmount
                    ? "bg-primary text-primary-foreground shadow-md scale-105"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {currencySymbol}{preset}
              </button>
            ))}
          </div>

          {/* Custom Amount */}
          <div className="space-y-2">
            <Label htmlFor="custom-amount">หรือใส่จำนวนเอง</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                id="custom-amount"
                type="text"
                inputMode="numeric"
                value={customAmount}
                onChange={handleCustomAmountChange}
                placeholder="ใส่จำนวนที่ต้องการ"
                className="pl-8"
              />
            </div>
          </div>
        </motion.div>

        {/* Message & Display Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-card rounded-2xl p-5 shadow-card mb-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Heart className="w-5 h-5 text-primary" />
            <span>ข้อความถึงทีมงาน (ไม่บังคับ)</span>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">ชื่อที่แสดง</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ชื่อของคุณ (หรือเว้นว่างเพื่อไม่ระบุ)"
                disabled={isAnonymous}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">ข้อความ</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="ขอบคุณที่สร้างแอปดีๆ..."
                rows={3}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-muted-foreground">
                ไม่แสดงชื่อ (Anonymous)
              </span>
            </label>
          </div>
        </motion.div>

        {/* Summary & Submit */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-5 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-muted-foreground">จำนวนเงิน</span>
            <span className="text-2xl font-bold text-amber-600">
              {currencySymbol}{selectedAmount || 0}
            </span>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium py-6"
            disabled={!selectedAmount || Number(selectedAmount) <= 0 || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                กำลังดำเนินการ...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Coffee className="w-5 h-5" />
                สนับสนุน {currencySymbol}{selectedAmount || 0}
              </span>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-3">
            💝 ขอบคุณที่สนับสนุนเรา!
          </p>
        </motion.div>

        {/* Why Support Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-card rounded-2xl p-5 shadow-card"
        >
          <h3 className="font-medium text-foreground mb-4 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            เงินสนับสนุนจะนำไปใช้ทำอะไร?
          </h3>
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
        </motion.div>
      </div>
    </div>
  );
}
