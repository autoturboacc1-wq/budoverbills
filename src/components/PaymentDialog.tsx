import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, 
  Loader2, 
  Check, 
  X, 
  Coins,
  Camera,
  Eye,
  TrendingUp,
  Send,
  History,
  AlertCircle,
  Building,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Installment, DebtAgreement } from "@/hooks/useDebtAgreements";
import { useExtraPayment } from "@/hooks/useExtraPayment";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { THAI_BANKS } from "@/constants/thaibanks";
import {
  getPaymentSlipSignedUrl,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from "@/utils/paymentSlipStorage";
import { PromptPayQR } from "@/components/PromptPayQR";
import { AsyncResultState, PageSection, ReviewPanel, StatusTimeline, type StatusTimelineItem } from "@/components/ux";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: Installment | null;
  agreement: DebtAgreement;
  isLender: boolean;
  onPaymentSubmitted: () => void;
}

interface SlipVerification {
  id: string;
  submitted_amount: number;
  verified_amount: number | null;
  slip_url: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  verified_at: string | null;
}

type InstallmentSnapshot = Pick<
  Installment,
  | "id"
  | "amount"
  | "installment_number"
  | "principal_portion"
  | "status"
  | "confirmed_by_lender"
  | "payment_proof_url"
>;

type RpcClient = (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: Error | null }>;

export function PaymentDialog({
  open,
  onOpenChange,
  installment,
  agreement,
  isLender,
  onPaymentSubmitted
}: PaymentDialogProps) {
  const { user } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [verifiedAmount, setVerifiedAmount] = useState<string>("");
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [verificationHistory, setVerificationHistory] = useState<SlipVerification[]>([]);
  const [pendingVerification, setPendingVerification] = useState<SlipVerification | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [signedSlipUrl, setSignedSlipUrl] = useState<string | null>(null);
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadLockRef = useRef(false);
  const borrowerSubmitLockRef = useRef(false);
  const lenderActionLockRef = useRef(false);
  
  const { calculateExtraPaymentPreview } = useExtraPayment();

  const refreshPaymentState = useCallback(async () => {
    if (!installment) return null;

    const [installmentResult, pendingResult] = await Promise.all([
      supabase
        .from("installments")
        .select("id, amount, installment_number, principal_portion, status, confirmed_by_lender, payment_proof_url")
        .eq("id", installment.id)
        .maybeSingle(),
      supabase
        .from("slip_verifications")
        .select("id, submitted_amount, verified_amount, slip_url, status, rejection_reason, created_at, verified_at")
        .eq("installment_id", installment.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (installmentResult.error) throw installmentResult.error;
    if (pendingResult.error) throw pendingResult.error;

    const freshInstallment = installmentResult.data as InstallmentSnapshot | null;
    const freshPending = ((pendingResult.data ?? [])[0] ?? null) as SlipVerification | null;

    setPendingVerification(freshPending);

    if (freshPending && isLender) {
      setVerifiedAmount(freshPending.submitted_amount.toString());
    }

    return {
      freshInstallment,
      freshPending,
    };
  }, [installment, isLender]);

  const fetchVerificationHistory = useCallback(async () => {
    if (!installment) return;
    
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('slip_verifications')
        .select('*')
        .eq('installment_id', installment.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const history = (data || []) as SlipVerification[];
      setVerificationHistory(history);
      
      // Find pending verification (latest with status 'pending')
      const pending = history.find(v => v.status === 'pending');
      setPendingVerification(pending || null);
      
      // Set verified amount input to pending submission amount
      if (pending && isLender) {
        setVerifiedAmount(pending.submitted_amount.toString());
      }
    } catch (error) {
      console.error("Error fetching verification history:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [installment, isLender]);

  // Fetch verification history when dialog opens
  useEffect(() => {
    if (open && installment) {
      void fetchVerificationHistory();
      setPaymentAmount(installment.amount.toString());
      setVerifiedAmount("");
      setSlipUrl(null);
      setSignedSlipUrl(null);
    }
  }, [open, installment, fetchVerificationHistory]);

  // Fetch signed URL when displaySlipUrl changes
  useEffect(() => {
    const fetchUrl = async () => {
      const urlToSign = slipUrl || pendingVerification?.slip_url || installment?.payment_proof_url;
      if (urlToSign && open) {
        setLoadingSignedUrl(true);
        const url = await getPaymentSlipSignedUrl(urlToSign, 600);
        setSignedSlipUrl(url);
        setLoadingSignedUrl(false);
      } else {
        setSignedSlipUrl(null);
      }
    };
    void fetchUrl();
  }, [slipUrl, pendingVerification?.slip_url, installment?.payment_proof_url, open]);

  const numericAmount = useMemo(() => {
    const num = parseFloat(paymentAmount);
    return isNaN(num) ? 0 : num;
  }, [paymentAmount]);

  const numericVerifiedAmount = useMemo(() => {
    const num = parseFloat(verifiedAmount);
    return isNaN(num) ? 0 : num;
  }, [verifiedAmount]);

  // Calculate extra payment if verified amount exceeds installment
  const extraPaymentPreview = useMemo(() => {
    const amount = isLender ? numericVerifiedAmount : numericAmount;
    if (!installment || amount <= installment.amount) return null;
    const extraAmount = amount - installment.amount;
    return calculateExtraPaymentPreview(agreement, extraAmount);
  }, [numericAmount, numericVerifiedAmount, installment, agreement, calculateExtraPaymentPreview, isLender]);

  const isExtraPayment = (isLender ? numericVerifiedAmount : numericAmount) > (installment?.amount || 0);

  // Count rejected verifications
  const rejectionCount = useMemo(() => {
    return verificationHistory.filter(v => v.status === 'rejected').length;
  }, [verificationHistory]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !installment) return;
    if (uploadLockRef.current) return;
    if (!user || isLender || user.id !== agreement.borrower_id) {
      toast.error("คุณไม่มีสิทธิ์อัปโหลดสลิปงวดนี้");
      return;
    }

    const validationError = validatePaymentSlipFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    uploadLockRef.current = true;
    setIsUploading(true);

    try {
      const latestState = await refreshPaymentState();
      const freshInstallment = latestState?.freshInstallment;
      const freshPending = latestState?.freshPending;

      if (!freshInstallment) {
        toast.error("ไม่พบข้อมูลค่างวดล่าสุด");
        return;
      }

      if (
        freshInstallment.confirmed_by_lender ||
        freshInstallment.status === "paid" ||
        freshInstallment.payment_proof_url
      ) {
        toast.error("งวดนี้ถูกยืนยันแล้ว ไม่สามารถอัปโหลดสลิปใหม่ได้");
        return;
      }

      if (freshPending) {
        toast.error("มีสลิปที่รอตรวจสอบอยู่แล้ว");
        return;
      }

      const result = await uploadPaymentSlip({
        agreementId: agreement.id,
        kind: 'installment',
        entityId: installment.id,
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
      uploadLockRef.current = false;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmitPayment = async () => {
    if (!installment || !slipUrl || !user) return;
    if (borrowerSubmitLockRef.current) return;
    if (numericAmount < installment.amount) {
      toast.error("ยอดเงินต้องไม่น้อยกว่าค่างวด");
      return;
    }

    borrowerSubmitLockRef.current = true;
    setIsSubmitting(true);

    let insertedSlipVerificationId: string | null = null;

    try {
      const latestState = await refreshPaymentState();
      const freshInstallment = latestState?.freshInstallment;
      const freshPending = latestState?.freshPending;

      if (!freshInstallment) {
        toast.error("ไม่พบข้อมูลค่างวดล่าสุด");
        return;
      }

      const freshAmount = freshInstallment.amount;

      if (freshInstallment.confirmed_by_lender || freshInstallment.status === "paid") {
        toast.error("งวดนี้ถูกยืนยันแล้ว ไม่สามารถส่งสลิปใหม่ได้");
        return;
      }

      if (freshPending) {
        toast.error("มีสลิปที่รอตรวจสอบอยู่แล้ว");
        return;
      }

      if (numericAmount < freshAmount) {
        toast.error("ยอดเงินต้องไม่น้อยกว่าค่างวด");
        return;
      }

      const freshIsExtraPayment = numericAmount > freshAmount;

      // Create slip verification record
      const { data: verificationData, error: verificationError } = await supabase
        .from('slip_verifications')
        .insert({
          installment_id: installment.id,
          agreement_id: agreement.id,
          submitted_by: user.id,
          submitted_amount: numericAmount,
          slip_url: slipUrl,
          status: 'pending'
        })
        .select("id")
        .single();

      if (verificationError) throw verificationError;
      insertedSlipVerificationId = verificationData.id;

      // Update installment with slip URL
      const { error: updateError } = await supabase
        .from('installments')
        .update({ 
          payment_proof_url: slipUrl,
          status: 'pending'
        })
        .eq('id', installment.id);

      if (updateError) {
        if (insertedSlipVerificationId) {
          await supabase
            .from('slip_verifications')
            .delete()
            .eq('id', insertedSlipVerificationId);
        }
        throw updateError;
      }

      // Create notification for lender
      const isFee = freshInstallment.principal_portion === 0 && freshAmount > 0;
      const label = isFee ? 'ค่าเลื่อนงวด' : `งวดที่ ${freshInstallment.installment_number}`;
      const notificationMessage = freshIsExtraPayment
        ? `มีการชำระเงิน${label} ยอด ฿${numericAmount.toLocaleString()} (เกินค่างวด ฿${(numericAmount - freshAmount).toLocaleString()}) - รอตรวจสอบสลิป`
        : `มีการชำระเงิน${label} ยอด ฿${numericAmount.toLocaleString()} - รอตรวจสอบสลิป`;

      await supabase.from('notifications').insert({
        user_id: agreement.lender_id,
        type: 'payment_uploaded',
        title: isFee ? 'มีการอัปโหลดสลิปค่าเลื่อนงวด' : 'มีการอัปโหลดสลิป',
        message: notificationMessage,
        related_type: 'installment',
        related_id: installment.id
      });

      toast.success("ส่งสลิปสำเร็จ", {
        description: "รอเจ้าหนี้ตรวจสอบและยืนยัน"
      });

      onPaymentSubmitted();
      onOpenChange(false);

    } catch (error) {
      console.error("Submit payment error:", error);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
      borrowerSubmitLockRef.current = false;
    }
  };

  // Lender confirms amount matches
  const handleConfirmPayment = async () => {
    if (!installment || !pendingVerification || !user) return;
    if (lenderActionLockRef.current) return;
    if (!isLender || user.id !== agreement.lender_id) {
      toast.error("เฉพาะเจ้าหนี้เท่านั้นที่ยืนยันการชำระได้");
      return;
    }
    if (numericVerifiedAmount <= 0) {
      toast.error("กรุณากรอกยอดเงินที่เห็นในสลิป");
      return;
    }

    lenderActionLockRef.current = true;
    setIsSubmitting(true);

    try {
      const latestState = await refreshPaymentState();
      const freshInstallment = latestState?.freshInstallment;
      const freshPending = latestState?.freshPending;

      if (!freshInstallment || !freshPending) {
        toast.error("ไม่พบสลิปที่รอตรวจสอบแล้ว");
        return;
      }

      if (freshInstallment.confirmed_by_lender || freshInstallment.status === "paid") {
        toast.error("งวดนี้ถูกยืนยันไปแล้ว");
        return;
      }

      const rpc = supabase.rpc as unknown as RpcClient;
      const { data, error } = await rpc("confirm_installment_payment", {
        p_installment_id: freshInstallment.id,
        p_verification_id: freshPending.id,
        p_verified_amount: numericVerifiedAmount,
      });

      if (error) throw error;

      const result = (data ?? {}) as {
        success?: boolean;
        extra_amount?: number;
        extra_payment_result?: { success?: boolean; installments_closed?: number; principal_reduction?: number } | null;
      };

      if (!result.success) {
        toast.error("ไม่สามารถยืนยันการชำระได้");
        return;
      }

      const extraAmount = result.extra_amount ?? 0;
      if (extraAmount > 0) {
        toast.success("ยืนยันการชำระสำเร็จ", {
          description: `รวมชำระเพิ่มเติม ฿${extraAmount.toLocaleString()} ตัดเงินต้น`
        });
      } else {
        toast.success("ยืนยันการชำระสำเร็จ");
      }

      onPaymentSubmitted();
      onOpenChange(false);

    } catch (error) {
      console.error("Confirm payment error:", error);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
      lenderActionLockRef.current = false;
    }
  };

  // Lender rejects - amount doesn't match
  const handleRejectPayment = async () => {
    if (!installment || !pendingVerification || !user) return;
    if (lenderActionLockRef.current) return;
    if (!isLender || user.id !== agreement.lender_id) {
      toast.error("เฉพาะเจ้าหนี้เท่านั้นที่ปฏิเสธสลิปได้");
      return;
    }

    lenderActionLockRef.current = true;
    setIsSubmitting(true);

    try {
      const latestState = await refreshPaymentState();
      const freshInstallment = latestState?.freshInstallment;
      const freshPending = latestState?.freshPending;

      if (!freshInstallment || !freshPending) {
        toast.error("ไม่พบสลิปที่รอตรวจสอบแล้ว");
        return;
      }

      const rpc = supabase.rpc as unknown as RpcClient;
      const { data, error } = await rpc("reject_installment_payment", {
        p_installment_id: freshInstallment.id,
        p_verification_id: freshPending.id,
        p_reason: "ยอดเงินไม่ตรงกับสลิป",
      });

      if (error) throw error;

      const result = (data ?? {}) as { success?: boolean };
      if (!result.success) {
        toast.error("ไม่สามารถปฏิเสธสลิปได้");
        return;
      }

      toast.success("แจ้งผู้ยืมแล้ว", {
        description: "ผู้ยืมจะได้รับแจ้งเตือนให้แก้ไขและส่งใหม่"
      });
      onPaymentSubmitted();
      onOpenChange(false);

    } catch (error) {
      console.error("Reject payment error:", error);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
      lenderActionLockRef.current = false;
    }
  };

  if (!installment) return null;

  const hasSlip = !!slipUrl || !!installment.payment_proof_url;
  const displaySlipUrl = slipUrl || pendingVerification?.slip_url || installment.payment_proof_url;
  const showPromptPayQrTab =
    !isLender && agreement.bank_name === "promptpay" && !!agreement.account_number;
  
  // Check if this is a fee installment (reschedule fee)
  const isFeeInstallment = installment.principal_portion === 0 && installment.amount > 0;
  const installmentLabel = isFeeInstallment ? 'ค่าเลื่อนงวด' : `งวดที่ ${installment.installment_number}`;
  const paymentTimelineItems: StatusTimelineItem[] = [
    {
      id: "amount",
      title: isLender ? "ตรวจยอดที่แสดงบนสลิป" : "กรอกยอดที่โอนจริง",
      description: isLender
        ? "เปรียบเทียบยอดที่ผู้ยืมกรอกกับยอดที่เห็นในสลิป"
        : "ยอดที่กรอกควรตรงกับหลักฐานการโอนและไม่น้อยกว่าค่างวด",
      status: pendingVerification ? "verifying" : "pending",
    },
    {
      id: "evidence",
      title: isLender ? "ตรวจสอบหลักฐาน" : "อัปโหลดหลักฐานการโอน",
      description: isLender ? "ดูสลิปหรือ PDF ให้ครบก่อนยืนยัน" : "แนบไฟล์ภาพหรือ PDF เพื่อให้เจ้าหนี้ตรวจสอบ",
      status: displaySlipUrl ? "verifying" : "pending",
    },
    {
      id: "result",
      title: isLender ? "ยืนยันหรือปฏิเสธ" : "ส่งรอตรวจสอบ",
      description: isLender
        ? "เมื่อกดยืนยัน ระบบจะบันทึกผลทันทีและอัปเดตสถานะงวด"
        : "เมื่อส่งแล้ว ระบบจะล็อกคำขอนี้ไว้จนกว่าเจ้าหนี้จะตรวจสอบเสร็จ",
      status: pendingVerification ? "verifying" : "pending",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            {isLender ? 'ตรวจสอบสลิป' : 'ชำระเงิน'} {installmentLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <PageSection
            title={isLender ? "Lender Review Flow" : "Borrower Payment Flow"}
            description={
              isLender
                ? "ตรวจจำนวนเงิน หลักฐาน และตัดสินใจอนุมัติหรือปฏิเสธจากหน้าจอเดียว"
                : "กรอกยอด อัปโหลดสลิป และตรวจข้อมูลปลายทางก่อนส่งยืนยัน"
            }
          >
            <ReviewPanel
              title="Payment Summary"
              rows={[
                { label: isFeeInstallment ? "ค่าเลื่อนงวด" : "ค่างวด", value: `฿${installment.amount.toLocaleString()}` },
                {
                  label: "ประเภท",
                  value: isFeeInstallment ? "Reschedule Fee" : "Installment Payment",
                },
                pendingVerification
                  ? {
                      label: isLender ? "ยอดที่ผู้ยืมกรอก" : "ยอดที่ส่งไว้",
                      value: `฿${pendingVerification.submitted_amount.toLocaleString()}`,
                    }
                  : {
                      label: isLender ? "สถานะ" : "สถานะ",
                      value: "ยังไม่มีรายการรอตรวจสอบ",
                    },
              ]}
            />
            <StatusTimeline items={paymentTimelineItems} />
          </PageSection>

          {/* Rejection History Warning */}
          {rejectionCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-amber-600 font-medium">
                  เคยถูกปฏิเสธ {rejectionCount} ครั้ง
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setShowHistory(true)}
              >
                <History className="w-3 h-3 mr-1" />
                ประวัติ
              </Button>
            </motion.div>
          )}

          {/* Bank Account Info (Borrower only) */}
          {!isLender && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-primary/10 border border-primary/20 rounded-xl space-y-2"
            >
              <div className="flex items-center gap-2 text-primary font-medium">
                <Building className="w-4 h-4" />
                <span>บัญชีรับเงิน</span>
              </div>
              {agreement.bank_name && agreement.account_number ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">ธนาคาร</span>
                    <span className="font-medium text-foreground">
                      {THAI_BANKS.find(b => b.value === agreement.bank_name)?.label || agreement.bank_name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      {agreement.bank_name === "promptpay" ? "พร้อมเพย์" : "เลขบัญชี"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground font-mono">
                        {agreement.account_number}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="คัดลอกเลขบัญชี"
                        onClick={() => {
                          navigator.clipboard.writeText(agreement.account_number || "");
                          toast.success("คัดลอกแล้ว");
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {agreement.account_name && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">ชื่อบัญชี</span>
                      <span className="font-medium text-foreground">{agreement.account_name}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <p>ผู้ให้ยืมยังไม่ได้กรอกข้อมูลบัญชี</p>
                  <p className="text-xs mt-1">กรุณาติดต่อผู้ให้ยืมเพื่อขอข้อมูลบัญชีรับเงิน</p>
                </div>
              )}
            </motion.div>
          )}

          {/* Amount Info */}
          <div className={`rounded-xl p-4 ${isFeeInstallment ? 'bg-amber-500/10' : 'bg-secondary/50'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">
                {isFeeInstallment ? 'ค่าเลื่อนงวด' : 'ค่างวด'}
              </span>
              <span className={`font-semibold ${isFeeInstallment ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}`}>
                ฿{installment.amount.toLocaleString()}
              </span>
            </div>
            {installment.principal_portion > 0 && (
              <div className="text-xs text-muted-foreground">
                เงินต้น ฿{installment.principal_portion.toLocaleString()}
                {installment.interest_portion ? ` + ดอกเบี้ย ฿${installment.interest_portion.toLocaleString()}` : ''}
              </div>
            )}
            {isFeeInstallment && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ค่าธรรมเนียมจากการขอเลื่อนกำหนดชำระ
              </div>
            )}
            {/* Show submitted amount for lender */}
            {isLender && pendingVerification && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">ยอดที่ผู้ยืมกรอก</span>
                  <span className="font-semibold text-primary">
                    ฿{pendingVerification.submitted_amount.toLocaleString()}
                  </span>
                </div>
                {pendingVerification.submitted_amount > installment.amount && (
                  <p className="text-xs text-primary mt-1">
                    (ชำระเกิน{isFeeInstallment ? 'ค่าเลื่อน' : 'ค่างวด'} ฿{(pendingVerification.submitted_amount - installment.amount).toLocaleString()})
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Payment Amount Input (Borrower only) */}
          {!isLender && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                จำนวนเงินที่ชำระ
              </label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={`อย่างน้อย ฿${installment.amount.toLocaleString()}`}
                className="text-lg font-semibold"
                min={installment.amount}
                step="0.01"
              />
              <p className="text-xs text-muted-foreground mt-1">
                กรอกยอดให้ตรงกับสลิปที่โอน (สามารถชำระมากกว่าค่างวดได้)
              </p>
            </div>
          )}

          {/* Lender: Verified Amount Input */}
          {isLender && pendingVerification && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                ยอดเงินที่เห็นในสลิป (กรอกตามจริง)
              </label>
              <Input
                type="number"
                value={verifiedAmount}
                onChange={(e) => setVerifiedAmount(e.target.value)}
                placeholder="กรอกยอดเงินที่เห็นในสลิป"
                className={`text-lg font-semibold transition-colors ${
                  numericVerifiedAmount > 0 && numericVerifiedAmount !== pendingVerification.submitted_amount
                    ? 'border-destructive bg-destructive/5 focus-visible:ring-destructive'
                    : numericVerifiedAmount > 0 && numericVerifiedAmount === pendingVerification.submitted_amount
                    ? 'border-status-paid bg-status-paid/5 focus-visible:ring-status-paid'
                    : ''
                }`}
                min={1}
                step="0.01"
              />
              
              {/* Amount Match/Mismatch Indicator */}
              <AnimatePresence>
                {numericVerifiedAmount > 0 && numericVerifiedAmount !== pendingVerification.submitted_amount && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">
                          ยอดไม่ตรงกัน!
                        </p>
                        <div className="mt-1 text-xs text-destructive/80 space-y-0.5">
                          <p>• ผู้ยืมกรอก: <span className="font-semibold">฿{pendingVerification.submitted_amount.toLocaleString()}</span></p>
                          <p>• เห็นในสลิป: <span className="font-semibold">฿{numericVerifiedAmount.toLocaleString()}</span></p>
                          <p className="mt-1 text-destructive/70">
                            ต่างกัน ฿{Math.abs(numericVerifiedAmount - pendingVerification.submitted_amount).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                {numericVerifiedAmount > 0 && numericVerifiedAmount === pendingVerification.submitted_amount && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 p-3 bg-status-paid/10 border border-status-paid/30 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-status-paid" />
                      <p className="text-sm font-medium text-status-paid">
                        ยอดตรงกัน ฿{numericVerifiedAmount.toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <p className="text-xs text-muted-foreground mt-2">
                กรอกยอดที่เห็นในสลิปจริง เพื่อเก็บเป็นหลักฐาน
              </p>
            </div>
          )}

          {/* Extra Payment Preview */}
          <AnimatePresence>
            {isExtraPayment && extraPaymentPreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-primary/5 border border-primary/20 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="font-medium text-primary text-sm">
                    {isLender ? 'จะประมวลผลชำระเพิ่มเติม' : 'ชำระเพิ่มเติม'} (ตัดเงินต้น)
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ค่างวดปกติ</span>
                    <span>฿{installment.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-primary font-medium">
                    <span>+ ตัดเงินต้นเพิ่ม</span>
                    <span>฿{((isLender ? numericVerifiedAmount : numericAmount) - installment.amount).toLocaleString()}</span>
                  </div>
                  <div className="border-t border-border/50 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ลดเงินต้น</span>
                      <span className="text-status-paid">฿{extraPaymentPreview.principalReduction.toLocaleString()}</span>
                    </div>
                    {extraPaymentPreview.installmentsToClose > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ปิดจบงวด</span>
                        <span className="text-status-paid">{extraPaymentPreview.installmentsToClose} งวด</span>
                      </div>
                    )}
                    {extraPaymentPreview.interestSaved > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ประหยัดดอกเบี้ย</span>
                        <span className="text-status-paid">฿{extraPaymentPreview.interestSaved.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Upload Slip Section */}
          {showPromptPayQrTab ? (
            <Tabs defaultValue="promptpay" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="promptpay">PromptPay QR</TabsTrigger>
                <TabsTrigger value="slip">อัปโหลดสลิป</TabsTrigger>
              </TabsList>

              <TabsContent value="promptpay" className="mt-0">
                <PromptPayQR
                  amount={numericAmount > 0 ? numericAmount : installment.amount}
                  promptPayId={agreement.account_number ?? ""}
                  recipientName={agreement.account_name}
                />
              </TabsContent>

              <TabsContent value="slip" className="mt-0 space-y-3">
                <label className="text-sm font-medium text-foreground block">
                  สลิปการโอนเงิน
                </label>

                {!hasSlip && !pendingVerification && (
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed flex flex-col gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || numericAmount <= 0}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>กำลังอัปโหลด...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-6 h-6" />
                        <span>เลือกไฟล์สลิป</span>
                      </>
                    )}
                  </Button>
                )}

                {(hasSlip || displaySlipUrl) && (
                  <div className="relative">
                    {loadingSignedUrl ? (
                      <div className="flex items-center justify-center h-24 bg-secondary/50 rounded-xl">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : signedSlipUrl && !displaySlipUrl?.toLowerCase().endsWith('.pdf') ? (
                      <div 
                        className="relative rounded-xl overflow-hidden border border-border cursor-pointer"
                        onClick={() => setShowPreview(true)}
                      >
                        <img
                          src={signedSlipUrl}
                          alt="Payment slip"
                          className="w-full max-h-48 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Eye className="w-6 h-6 text-white" />
                        </div>
                      </div>
                    ) : signedSlipUrl ? (
                      <div className="flex items-center justify-center h-24 bg-secondary/50 rounded-xl">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(signedSlipUrl!, '_blank')}
                        >
                          เปิดดู PDF
                        </Button>
                      </div>
                    ) : displaySlipUrl ? (
                      <div className="flex items-center justify-center h-24 bg-secondary/50 rounded-xl">
                        <p className="text-sm text-muted-foreground">ไม่สามารถโหลดสลิปได้</p>
                      </div>
                    ) : null}

                    {!installment.confirmed_by_lender && !pendingVerification && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                สลิปการโอนเงิน
              </label>

              {!hasSlip && !isLender && !pendingVerification && (
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed flex flex-col gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || numericAmount <= 0}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>กำลังอัปโหลด...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span>เลือกไฟล์สลิป</span>
                    </>
                  )}
                </Button>
              )}

              {/* Slip Preview */}
              {(hasSlip || displaySlipUrl) && (
                <div className="relative">
                  {loadingSignedUrl ? (
                    <div className="flex items-center justify-center h-24 bg-secondary/50 rounded-xl">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : signedSlipUrl && !displaySlipUrl?.toLowerCase().endsWith('.pdf') ? (
                    <div 
                      className="relative rounded-xl overflow-hidden border border-border cursor-pointer"
                      onClick={() => setShowPreview(true)}
                    >
                      <img
                        src={signedSlipUrl}
                        alt="Payment slip"
                        className="w-full max-h-48 object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Eye className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  ) : signedSlipUrl ? (
                    <div className="flex items-center justify-center h-24 bg-secondary/50 rounded-xl">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(signedSlipUrl!, '_blank')}
                      >
                        เปิดดู PDF
                      </Button>
                    </div>
                  ) : displaySlipUrl ? (
                    <div className="flex items-center justify-center h-24 bg-secondary/50 rounded-xl">
                      <p className="text-sm text-muted-foreground">ไม่สามารถโหลดสลิปได้</p>
                    </div>
                  ) : null}

                  {/* Re-upload button (Borrower only, before confirmation) */}
                  {!isLender && !installment.confirmed_by_lender && !pendingVerification && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lender Verification Section */}
          {isLender && pendingVerification && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-secondary/30 rounded-xl p-4 space-y-4"
            >
              <div className="text-center">
                <p className="font-medium text-foreground mb-1">ตรวจสอบและยืนยัน</p>
                <p className="text-sm text-muted-foreground">
                  กรอกยอดที่เห็นในสลิปจริง แล้วกดยืนยัน
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-status-overdue/30 text-status-overdue hover:bg-status-overdue/10 hover:border-status-overdue"
                  onClick={handleRejectPayment}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  ไม่ตรง
                </Button>
                <Button
                  className="flex-1 bg-status-paid hover:bg-status-paid/90"
                  onClick={handleConfirmPayment}
                  disabled={isSubmitting || numericVerifiedAmount <= 0}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  ยืนยัน
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                กด "ยืนยัน" เพื่อรับเงินตามยอดที่กรอก / กด "ไม่ตรง" เพื่อแจ้งให้ผู้ยืมส่งใหม่
              </p>
            </motion.div>
          )}

          {/* Waiting for verification message for borrower */}
          {!isLender && pendingVerification && (
            <AsyncResultState
              tone="warning"
              title="รอเจ้าหนี้ตรวจสอบ"
              description={`ส่งยอด ฿${pendingVerification.submitted_amount.toLocaleString()} เมื่อ ${format(parseISO(pendingVerification.created_at), 'd MMM HH:mm', { locale: th })}`}
            />
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              {isLender && pendingVerification ? 'ปิด' : 'ยกเลิก'}
            </Button>
            
            {/* Borrower: Submit slip (only if no pending verification) */}
            {!isLender && !pendingVerification && (
              <Button
                className="flex-1"
                disabled={!(hasSlip || slipUrl) || numericAmount <= 0 || isSubmitting}
                onClick={handleSubmitPayment}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                ส่งสลิป
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Full Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>สลิปการโอนเงิน</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4">
            {loadingSignedUrl ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : signedSlipUrl ? (
              <>
                <img
                  src={signedSlipUrl}
                  alt="Payment slip"
                  className="w-full rounded-lg cursor-zoom-in"
                  style={{ touchAction: 'pinch-zoom' }}
                  onClick={() => window.open(signedSlipUrl, '_blank')}
                />
                <p className="text-xs text-muted-foreground text-center mt-2">
                  แตะรูปเพื่อดูขนาดเต็ม
                </p>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">ไม่สามารถโหลดสลิปได้</p>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowPreview(false)}
            >
              ปิด
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Verification History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              ประวัติการตรวจสอบสลิป
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 space-y-3">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : verificationHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                ยังไม่มีประวัติการตรวจสอบ
              </p>
            ) : (
              verificationHistory.map((v, index) => (
                <div
                  key={v.id}
                  className={`p-4 rounded-xl border ${
                    v.status === 'approved'
                      ? 'bg-status-paid/5 border-status-paid/20'
                      : v.status === 'rejected'
                      ? 'bg-status-overdue/5 border-status-overdue/20'
                      : 'bg-secondary/50 border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(v.created_at), 'd MMM yyyy HH:mm', { locale: th })}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      v.status === 'approved'
                        ? 'bg-status-paid/10 text-status-paid'
                        : v.status === 'rejected'
                        ? 'bg-status-overdue/10 text-status-overdue'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {v.status === 'approved' ? 'อนุมัติ' : v.status === 'rejected' ? 'ปฏิเสธ' : 'รอตรวจ'}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ยอดที่ส่ง</span>
                      <span className="font-medium">฿{v.submitted_amount.toLocaleString()}</span>
                    </div>
                    {v.verified_amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ยอดที่ตรวจ</span>
                        <span className="font-medium">฿{v.verified_amount.toLocaleString()}</span>
                      </div>
                    )}
                    {v.rejection_reason && (
                      <p className="text-xs text-status-overdue mt-2">
                        เหตุผล: {v.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowHistory(false)}
            >
              ปิด
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
