import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, TrendingDown, CheckCircle2, Calculator, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useExtraPayment } from "@/hooks/useExtraPayment";
import { DebtAgreement } from "@/hooks/useDebtAgreements";

interface ExtraPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agreement: DebtAgreement;
  onSuccess?: () => void;
}

export function ExtraPaymentDialog({
  open,
  onOpenChange,
  agreement,
  onSuccess
}: ExtraPaymentDialogProps) {
  const { calculateExtraPaymentPreview } = useExtraPayment();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate remaining principal
  const remainingPrincipal = useMemo(() => {
    if (!agreement.installments) return 0;
    return agreement.installments
      .filter(i => i.status !== 'paid' && i.principal_portion > 0)
      .reduce((sum, i) => sum + i.principal_portion, 0);
  }, [agreement.installments]);

  // Calculate preview
  const preview = useMemo(() => {
    const amountNum = Number(amount) || 0;
    if (amountNum <= 0) return null;
    return calculateExtraPaymentPreview(agreement, amountNum);
  }, [agreement, amount, calculateExtraPaymentPreview]);

  // Reset amount when dialog opens
  useEffect(() => {
    if (open) {
      setAmount("");
    }
  }, [open]);

  // NOTE: Extra payment feature disabled - was auto-deducting without lender verification
  // This should only show preview, not process actual payments
  const handleSubmit = async () => {
    toast.info('ระบบชำระเพิ่มเติมถูกปิดชั่วคราว', {
      description: 'กรุณาใช้ช่องทางชำระปกติแล้วแจ้งผู้ให้ยืม'
    });
    onOpenChange(false);
  };

  const handleQuickSelect = (percent: number) => {
    const value = Math.round(remainingPrincipal * percent / 100);
    setAmount(value.toString());
  };

  const interestTypeLabel = {
    none: "ไม่คิดดอกเบี้ย",
    flat: "Flat Rate",
    effective: "Effective Rate"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            ชำระเพิ่มเติม
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Info Banner */}
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/20">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">เมื่อชำระเพิ่มเติม:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>เงินจะถูกตัดเงินต้นก่อน</li>
                  <li>งวดหลังสุดจะถูกปิดก่อน</li>
                  {agreement.interest_type === 'effective' && (
                    <li className="text-primary font-medium">ดอกเบี้ยจะคำนวณใหม่จากเงินต้นคงเหลือ</li>
                  )}
                  {agreement.interest_type === 'flat' && (
                    <li className="text-muted-foreground">ดอกเบี้ยคงเดิมตามที่ตกลง</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Current Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-secondary/50 rounded-xl text-center">
              <p className="text-xs text-muted-foreground">เงินต้นคงเหลือ</p>
              <p className="font-semibold text-foreground">฿{remainingPrincipal.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-secondary/50 rounded-xl text-center">
              <p className="text-xs text-muted-foreground">ประเภทดอกเบี้ย</p>
              <p className="font-semibold text-foreground">{interestTypeLabel[agreement.interest_type]}</p>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <Label htmlFor="extraAmount">จำนวนเงินที่ต้องการชำระเพิ่ม</Label>
            <Input
              id="extraAmount"
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-xl font-semibold text-center"
            />
            
            {/* Quick Select Buttons */}
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => handleQuickSelect(percent)}
                >
                  {percent}%
                </Button>
              ))}
            </div>

            {/* Slider */}
            <Slider
              value={[Number(amount) || 0]}
              onValueChange={([val]) => setAmount(val.toString())}
              max={remainingPrincipal}
              step={100}
              className="mt-4"
            />
          </div>

          {/* Preview */}
          <AnimatePresence>
            {preview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm text-foreground">ผลลัพธ์</span>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Principal Reduction */}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ตัดเงินต้น</span>
                      <span className="font-medium text-foreground">
                        ฿{preview.principalReduction.toLocaleString()}
                      </span>
                    </div>

                    {/* Installments to Close */}
                    {preview.installmentsToClose > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-status-paid" />
                          งวดที่ปิดได้
                        </span>
                        <span className="font-medium text-status-paid">
                          {preview.installmentsToClose} งวด (จากท้าย)
                        </span>
                      </div>
                    )}

                    {/* Remaining Installments */}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">งวดคงเหลือ</span>
                      <span className="font-medium text-foreground">
                        {preview.remainingInstallments} งวด
                      </span>
                    </div>

                    {/* New Last Installment */}
                    {preview.newLastInstallmentAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ยอดงวดท้ายใหม่</span>
                        <span className="font-medium text-foreground">
                          ฿{preview.newLastInstallmentAmount.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {/* Interest Saved (Effective Rate only) */}
                    {preview.interestSaved > 0 && (
                      <div className="flex justify-between text-sm pt-2 border-t border-primary/20">
                        <span className="text-primary flex items-center gap-1">
                          <TrendingDown className="w-3 h-3" />
                          ประหยัดดอกเบี้ย
                        </span>
                        <span className="font-semibold text-primary">
                          ~฿{preview.interestSaved.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warning for Flat Rate */}
                {agreement.interest_type === 'flat' && preview.installmentsToClose > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Flat Rate: ดอกเบี้ยถูกคิดตอนสร้างสัญญาแล้ว การชำระเพิ่มจะลดจำนวนงวด แต่ดอกเบี้ยไม่ลด
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={!preview || isSubmitting}
          >
            {isSubmitting ? (
              "กำลังดำเนินการ..."
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                ยืนยันชำระ ฿{Number(amount || 0).toLocaleString()}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
