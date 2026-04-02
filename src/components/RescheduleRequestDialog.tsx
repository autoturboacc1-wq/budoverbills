import { useState, useMemo, useRef, useEffect } from 'react';
import { format, addWeeks, addMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { AlertTriangle, Shield, Calculator, Clock, Info, CalendarClock, Upload, Loader2, Eye, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRescheduleRequests } from '@/hooks/useRescheduleRequests';
import { toast } from 'sonner';
import {
  getPaymentSlipSignedUrl,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from '@/utils/paymentSlipStorage';

interface RescheduleRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentId: string;
  agreementId: string;
  originalDueDate: string;
  principalPerInstallment: number;
  interestPerInstallment: number;
  currentInterestRate: number;
  interestType: 'none' | 'flat' | 'effective';
  frequency: 'weekly' | 'biweekly' | 'monthly';
  defaultFeeRate?: number;
  defaultInterestMultiplier?: number;
  onSuccess?: () => void;
}

// Helper to get frequency label and calculate new date
const getFrequencyInfo = (frequency: 'weekly' | 'biweekly' | 'monthly', originalDate: Date) => {
  switch (frequency) {
    case 'weekly':
      return { label: '1 สัปดาห์', newDate: addWeeks(originalDate, 1) };
    case 'biweekly':
      return { label: '2 สัปดาห์', newDate: addWeeks(originalDate, 2) };
    case 'monthly':
    default:
      return { label: '1 เดือน', newDate: addMonths(originalDate, 1) };
  }
};

export function RescheduleRequestDialog({
  open,
  onOpenChange,
  installmentId,
  agreementId,
  originalDueDate,
  principalPerInstallment,
  interestPerInstallment,
  currentInterestRate,
  interestType,
  frequency,
  defaultFeeRate = 5,
  defaultInterestMultiplier,
  onSuccess
}: RescheduleRequestDialogProps) {
  const { createRequest, calculateRescheduleFee } = useRescheduleRequests();
  const [customFeeRate, setCustomFeeRate] = useState(defaultFeeRate);
  const [interestPrepayPercent, setInterestPrepayPercent] = useState(defaultFeeRate > 0 ? defaultFeeRate : 100);
  const [submitting, setSubmitting] = useState(false);
  
  // Slip upload state
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [signedSlipUrl, setSignedSlipUrl] = useState<string | null>(null);
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);
  const [submittedAmount, setSubmittedAmount] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showSlipPreview, setShowSlipPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch signed URL when slipUrl changes
  useEffect(() => {
    const fetchUrl = async () => {
      if (slipUrl && showSlipPreview) {
        setLoadingSignedUrl(true);
        const url = await getPaymentSlipSignedUrl(slipUrl, 600);
        setSignedSlipUrl(url);
        setLoadingSignedUrl(false);
      }
    };
    fetchUrl();
  }, [slipUrl, showSlipPreview]);

  const isNoInterest = interestType === 'none';

  // Calculate new due date based on frequency
  const frequencyInfo = useMemo(() => {
    return getFrequencyInfo(frequency, new Date(originalDueDate));
  }, [frequency, originalDueDate]);

  const feeCalculation = useMemo(() => {
    return calculateRescheduleFee(
      principalPerInstallment,
      interestPerInstallment,
      currentInterestRate,
      interestType,
      1, // Always 1 installment now
      isNoInterest ? customFeeRate : interestPrepayPercent
    );
  }, [principalPerInstallment, interestPerInstallment, currentInterestRate, interestType, customFeeRate, interestPrepayPercent, calculateRescheduleFee, isNoInterest]);

  // Handle file upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePaymentSlipFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadPaymentSlip({
        agreementId,
        kind: 'reschedule',
        entityId: installmentId,
        file,
      });

      if ('error' in result) throw result.error;

      // Store the file path (will use signed URL to display)
      setSlipUrl(result.path);
      toast.success("อัปโหลดสลิปสำเร็จ");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeSlip = () => {
    setSlipUrl(null);
  };

  const handleSubmit = async () => {
    // Validate slip and amount
    if (!slipUrl) {
      toast.error('กรุณาอัปโหลดสลิปการโอนเงิน');
      return;
    }
    
    const amount = parseFloat(submittedAmount);
    if (!submittedAmount || isNaN(amount) || amount <= 0) {
      toast.error('กรุณากรอกจำนวนเงินที่โอน');
      return;
    }

    setSubmitting(true);
    const success = await createRequest({
      installmentId,
      agreementId,
      originalDueDate,
      newDueDate: format(frequencyInfo.newDate, 'yyyy-MM-dd'),
      principalPerInstallment,
      interestPerInstallment,
      currentInterestRate,
      interestType,
      feeInstallments: 1,
      customFeeRate: isNoInterest ? customFeeRate : interestPrepayPercent,
      slipUrl,
      submittedAmount: amount
    });
    
    setSubmitting(false);
    
    if (success) {
      // Reset form
      setSlipUrl(null);
      setSubmittedAmount('');
      onOpenChange(false);
      onSuccess?.();
    }
  };

  // Check if amount matches fee
  const amountValue = parseFloat(submittedAmount) || 0;
  const amountMatchesFee = amountValue === feeCalculation.totalFee;
  const amountDifference = amountValue - feeCalculation.totalFee;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              ขอเลื่อนกำหนดชำระ
            </DialogTitle>
            <DialogDescription>
              กำหนดเดิม: {format(new Date(originalDueDate), 'd MMM yyyy', { locale: th })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* New Due Date Preview - Fixed by frequency */}
            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                <span className="font-medium">เลื่อนไป {frequencyInfo.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">วันครบกำหนดใหม่:</span>
                <span className="text-lg font-semibold text-primary">
                  {format(frequencyInfo.newDate, 'd MMMM yyyy', { locale: th })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                ระยะเวลาเลื่อนตามรอบผ่อนชำระที่ตกลงไว้ ({frequency === 'weekly' ? 'รายสัปดาห์' : frequency === 'biweekly' ? 'ราย 2 สัปดาห์' : 'รายเดือน'})
              </p>
            </div>

            {/* Info about subsequent installments */}
            <Alert className="border-blue-500/50 bg-blue-500/10">
              <Info className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-700 dark:text-blue-400 text-sm">
                เมื่อได้รับอนุมัติ งวดถัดไปทั้งหมดจะถูกเลื่อนตามไปด้วยอัตโนมัติ
              </AlertDescription>
            </Alert>

            {/* Custom Fee Rate Slider for No-Interest Agreements */}
            {isNoInterest && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>ค่าเลื่อนงวด (% ของค่างวด)</Label>
                  <span className="text-sm font-medium text-primary">
                    {customFeeRate}% = ฿{Math.ceil((principalPerInstallment * customFeeRate) / 100).toLocaleString()}
                  </span>
                </div>
                <Slider
                  value={[customFeeRate]}
                  onValueChange={(value) => setCustomFeeRate(value[0])}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1%</span>
                  <span>20%</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  คำนวณจากค่างวด ฿{principalPerInstallment.toLocaleString()} × {customFeeRate}%
                </p>
              </div>
            )}

            {/* Interest Prepay Slider for interest-bearing agreements */}
            {!isNoInterest && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>จ่ายดอกงวดนี้ก่อน</Label>
                  <span className="text-sm font-medium text-primary">
                    {interestPrepayPercent}% = ฿{Math.ceil((interestPerInstallment * interestPrepayPercent) / 100).toLocaleString()}
                  </span>
                </div>
                <Slider
                  value={[interestPrepayPercent]}
                  onValueChange={(value) => setInterestPrepayPercent(value[0])}
                  min={10}
                  max={100}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10%</span>
                  <span>100%</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  ดอกเบี้ยงวดนี้ ฿{interestPerInstallment.toLocaleString()} × {interestPrepayPercent}% (ตัดดอกก่อน)
                </p>
              </div>
            )}

            {/* Fee Calculation Summary */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4" />
                สรุปค่าเลื่อนงวด
              </div>
              
              <div className="space-y-2 text-sm">
                {feeCalculation.feeType === 'percentage' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ค่างวด</span>
                      <span>฿{principalPerInstallment.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">อัตราค่าเลื่อน</span>
                      <span>{feeCalculation.appliedFeeRate}%</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>สูตร</span>
                      <span>฿{principalPerInstallment.toLocaleString()} × {feeCalculation.appliedFeeRate}%</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ดอกเบี้ยงวดนี้</span>
                      <span>฿{interestPerInstallment.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">จ่ายล่วงหน้า</span>
                      <span>{feeCalculation.interestPrepayPercent || 100}%</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>สูตร</span>
                      <span>฿{interestPerInstallment.toLocaleString()} × {feeCalculation.interestPrepayPercent || 100}%</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 pt-1">
                      <Shield className="w-3 h-3" />
                      <span>ตัดดอกก่อน - ไม่เพิ่มดอกพิเศษ</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-medium pt-1 border-t border-border/50">
                  <span>ค่าเลื่อนงวดที่ต้องโอน</span>
                  <span className="text-primary text-lg">฿{feeCalculation.totalFee.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Section */}
            <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                <Upload className="h-4 w-4" />
                ชำระค่าเลื่อนงวด
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <Label htmlFor="submittedAmount">จำนวนเงินที่โอน (บาท)</Label>
                <Input
                  id="submittedAmount"
                  type="number"
                  placeholder={`฿${feeCalculation.totalFee.toLocaleString()}`}
                  value={submittedAmount}
                  onChange={(e) => setSubmittedAmount(e.target.value)}
                  className="text-lg"
                />
                {submittedAmount && !amountMatchesFee && (
                  <p className={`text-xs ${amountDifference > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                    {amountDifference > 0 
                      ? `โอนเกิน ฿${amountDifference.toLocaleString()} (จะเป็นทิปให้ผู้ให้ยืม)`
                      : `โอนขาด ฿${Math.abs(amountDifference).toLocaleString()}`
                    }
                  </p>
                )}
              </div>

              {/* Slip Upload */}
              <div className="space-y-2">
                <Label>สลิปการโอนเงิน</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {slipUrl ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-background border">
                    <div className="flex-1 flex items-center gap-2">
                      <div className="w-10 h-10 rounded bg-green-500/10 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-600">อัปโหลดแล้ว</p>
                        <p className="text-xs text-muted-foreground">คลิกเพื่อดูสลิป</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowSlipPreview(true)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={removeSlip}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-20 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        กำลังอัปโหลด...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        เลือกไฟล์สลิป (JPG, PNG, PDF)
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Safeguard Alert - only for percentage-based fees */}
            {feeCalculation.safeguardApplied && feeCalculation.feeType === 'percentage' && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <Shield className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  <span className="font-medium">Safeguard ทำงาน:</span> ลดค่าเลื่อนจาก 5% เหลือ {(feeCalculation.appliedFeeRate || 0).toFixed(2)}% 
                  เพื่อให้รวมกับดอกเบี้ยเดิม ({currentInterestRate}%) ไม่เกิน 15%/ปี ตามกฎหมาย
                </AlertDescription>
              </Alert>
            )}

            {/* Legal Notice */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs text-muted-foreground">
                คำขอนี้ต้องได้รับการอนุมัติจากเจ้าหนี้ หลังตรวจสอบสลิปแล้ว งวดนี้และงวดถัดไปจะถูกเลื่อนไป {frequencyInfo.label}
              </AlertDescription>
            </Alert>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting || !slipUrl || !submittedAmount}
              >
                {submitting ? 'กำลังส่ง...' : `ขอเลื่อน ${frequencyInfo.label}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Slip Preview Dialog */}
      <Dialog open={showSlipPreview} onOpenChange={setShowSlipPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>สลิปการโอนเงิน</DialogTitle>
          </DialogHeader>
          {loadingSignedUrl ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : signedSlipUrl ? (
            signedSlipUrl.toLowerCase().includes('.pdf') ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">ไฟล์ PDF</p>
                <Button variant="outline" onClick={() => window.open(signedSlipUrl, '_blank')}>
                  เปิดดู PDF
                </Button>
              </div>
            ) : (
              <img
                src={signedSlipUrl}
                alt="Payment slip"
                className="w-full rounded-lg cursor-pointer"
                onClick={() => window.open(signedSlipUrl, '_blank')}
              />
            )
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">ไม่สามารถโหลดสลิปได้</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
