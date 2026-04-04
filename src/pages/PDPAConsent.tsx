import { useState } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import { useNavigate } from "react-router-dom";
import { Shield, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function PDPAConsent() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // If user already accepted PDPA, just show as read-only
  const alreadyAccepted = profile?.pdpa_accepted_at;

  const handleAccept = async () => {
    if (!accepted) {
      toast.error("กรุณายอมรับข้อกำหนดและนโยบายก่อนดำเนินการต่อ");
      return;
    }

    if (!user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pdpa_accepted_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success("ยอมรับข้อกำหนดเรียบร้อยแล้ว");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto w-full"
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-heading font-semibold text-foreground">
              การคุ้มครองข้อมูลส่วนบุคคล
            </h1>
            <p className="text-muted-foreground mt-2">
              กรุณาอ่านและยอมรับก่อนใช้งาน BudOverBills
            </p>
          </div>

          {/* Terms Section */}
          <div className="bg-card rounded-2xl shadow-card mb-4 overflow-hidden">
            <button
              type="button"
              onClick={() => setTermsExpanded(!termsExpanded)}
              aria-expanded={termsExpanded}
              aria-controls="terms-content"
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <div>
                <h3 className="font-medium text-foreground">ข้อกำหนดการใช้งาน</h3>
                <p className="text-sm text-muted-foreground">Terms of Service</p>
              </div>
              {termsExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            {termsExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                id="terms-content"
                className="px-5 pb-4"
              >
                <div className="text-sm text-muted-foreground space-y-3 max-h-48 overflow-y-auto">
                  <p><strong>BudOverBills</strong> เป็นแพลตฟอร์มดิจิทัลที่ช่วยบันทึกและจัดการคำมั่นและข้อตกลงส่วนบุคคลระหว่างผู้ใช้งาน</p>
                  <p>BudOverBills ไม่ใช่สถาบันการเงิน, ไม่ให้กู้เงิน, และไม่เป็นคนกลางในการถือหรือโอนเงิน</p>
                  <p>• ❌ ไม่รับฝากเงิน</p>
                  <p>• ❌ ไม่โอนเงินแทนผู้ใช้</p>
                  <p>• ❌ ไม่รับประกันการชำระ</p>
                  <p>• ❌ ไม่บังคับให้ผู้ใช้ปฏิบัติตามข้อตกลง</p>
                  <p>ผู้ใช้รับผิดชอบการตกลงและการชำระกันเองทั้งหมด</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/terms")}
                  className="text-primary text-sm mt-3 hover:underline"
                >
                  อ่านเพิ่มเติม
                </button>
              </motion.div>
            )}
          </div>

          {/* Privacy Section */}
          <div className="bg-card rounded-2xl shadow-card mb-6 overflow-hidden">
            <button
              type="button"
              onClick={() => setPrivacyExpanded(!privacyExpanded)}
              aria-expanded={privacyExpanded}
              aria-controls="privacy-content"
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <div>
                <h3 className="font-medium text-foreground">นโยบายความเป็นส่วนตัว</h3>
                <p className="text-sm text-muted-foreground">Privacy Policy & PDPA</p>
              </div>
              {privacyExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            {privacyExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                id="privacy-content"
                className="px-5 pb-4"
              >
                <div className="text-sm text-muted-foreground space-y-3 max-h-48 overflow-y-auto">
                  <p><strong>ข้อมูลที่เราเก็บ:</strong></p>
                  <p>• ชื่อเล่น / ชื่อที่แสดง</p>
                  <p>• อีเมล / เบอร์โทร (ถ้ามี)</p>
                  <p>• ข้อมูลข้อตกลงที่ผู้ใช้บันทึก</p>
                  <p>• ข้อมูลการใช้งานแอพ</p>
                  <p className="mt-2"><strong>สิ่งที่เราไม่ทำ:</strong></p>
                  <p>• ❌ ไม่เก็บข้อมูลบัตร</p>
                  <p>• ❌ ไม่เก็บข้อมูลบัญชีธนาคาร</p>
                  <p>• ❌ ไม่ขายข้อมูลผู้ใช้</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/privacy")}
                  className="text-primary text-sm mt-3 hover:underline"
                >
                  อ่านเพิ่มเติม
                </button>
              </motion.div>
            )}
          </div>

          {/* User Rights Section */}
          <div className="bg-secondary/30 rounded-xl p-4 mb-6">
            <h4 className="font-medium text-foreground mb-2">สิทธิ์ของคุณตาม PDPA</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✓ ขอเข้าถึงข้อมูลส่วนบุคคลของคุณ</li>
              <li>✓ ขอแก้ไขข้อมูลที่ไม่ถูกต้อง</li>
              <li>✓ ขอลบข้อมูลของคุณ</li>
              <li>✓ ถอนความยินยอมได้ทุกเมื่อ</li>
            </ul>
          </div>

          {/* Consent Checkbox */}
          <div className="flex items-start gap-3 mb-6">
            <Checkbox
              id="pdpa-consent"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              className="mt-1"
            />
            <div className="space-y-1">
              <label htmlFor="pdpa-consent" className="text-sm text-foreground cursor-pointer">
                ข้าพเจ้าได้อ่านและยอมรับข้อกำหนดการใช้งาน นโยบายความเป็นส่วนตัว และยินยอมให้เก็บและประมวลผลข้อมูลส่วนบุคคลตาม PDPA
              </label>
              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => navigate("/terms")} className="text-primary hover:underline">
                  อ่านข้อกำหนดการใช้งาน
                </button>
                <span className="text-muted-foreground" aria-hidden="true">|</span>
                <button type="button" onClick={() => navigate("/privacy")} className="text-primary hover:underline">
                  อ่านนโยบายความเป็นส่วนตัว
                </button>
              </div>
            </div>
          </div>

          {/* Accept Button or Status */}
          {alreadyAccepted ? (
            <div className="text-center">
              <div className="bg-status-paid/10 text-status-paid rounded-xl p-4 mb-4">
                <Check className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">คุณได้ยอมรับข้อกำหนดแล้ว</p>
                <time
                  className="text-sm mt-1 block"
                  dateTime={alreadyAccepted}
                >
                  เมื่อ {new Date(alreadyAccepted).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <Button
                onClick={() => navigate(-1)}
                variant="outline"
                className="w-full"
              >
                กลับ
              </Button>
            </div>
          ) : (
            <>
              <Button
                onClick={handleAccept}
                disabled={!accepted || isLoading}
                className="w-full h-12 text-base"
              >
                {isLoading ? (
                  "กำลังดำเนินการ..."
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    ยอมรับและเริ่มใช้งาน
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground mt-4">
                การกดยอมรับถือว่าคุณยินยอมตามข้อกำหนดและนโยบายของ BudOverBills
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
    </PageTransition>
  );
}
