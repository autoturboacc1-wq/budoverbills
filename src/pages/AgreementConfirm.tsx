import { motion } from "framer-motion";
import { ArrowLeft, Calendar, User, Clock, CheckCircle, AlertCircle, Upload, Loader2, Eye, FileSignature } from "lucide-react";
import { getErrorMessage } from "@/utils/errorHandler";

// Map known server-side RPC errors (English, raised in plpgsql) to Thai user
// messages.  Anything else falls through to the original message so the user
// can still see what went wrong instead of a generic toast.
const SERVER_ERROR_TH: Record<string, string> = {
  "Unauthorized": "กรุณาเข้าสู่ระบบใหม่",
  "Forbidden": "คุณไม่มีสิทธิ์ดำเนินการนี้",
  "Agreement not found": "ไม่พบข้อตกลง",
  "Invalid confirmation request": "คำขอยืนยันไม่ถูกต้อง",
  "Transfer slip is required": "กรุณาอัปโหลดสลิปโอนเงินก่อน",
};

function toThaiServerError(error: unknown): string {
  const raw = getErrorMessage(error, "");
  if (!raw) return "เกิดข้อผิดพลาด กรุณาลองใหม่";
  for (const [en, th] of Object.entries(SERVER_ERROR_TH)) {
    if (raw.includes(en)) return th;
  }
  return raw;
}
import { PageTransition } from "@/components/ux/PageTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useDebtAgreements, DebtAgreement } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { AgreementLegalText } from "@/components/AgreementLegalText";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUserRoleInAgreement } from "@/domains/debt";
import { getDeviceIdString, getClientIP } from "@/utils/deviceInfo";
import {
  getPaymentSlipSignedUrl,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from "@/utils/paymentSlipStorage";

export default function AgreementConfirm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAgreement, refresh, isLoading } = useDebtAgreements();
  const [agreement, setAgreement] = useState<DebtAgreement | null>(null);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Transfer slip state for lender
  const [transferSlipUrl, setTransferSlipUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Legal agreement acceptance state
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  
  // Fetch lender name for borrowers
  const [lenderName, setLenderName] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const found = getAgreement(id);
      setAgreement(found || null);
    }
  }, [id, getAgreement]);

  useEffect(() => {
    setTransferSlipUrl(agreement?.transfer_slip_url || null);
  }, [agreement?.transfer_slip_url]);
  
  // Fetch lender name for borrowers
  useEffect(() => {
    const fetchLenderName = async () => {
      if (agreement && agreement.lender_id) {
        const { data } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name')
          .eq('user_id', agreement.lender_id)
          .maybeSingle();
        
        if (data) {
          const fullName = data.first_name && data.last_name 
            ? `${data.first_name} ${data.last_name}`
            : data.display_name;
          setLenderName(fullName);
        }
      }
    };
    fetchLenderName();
  }, [agreement]);

  // Use domain layer for role determination
  const userRole = useMemo(() => {
    return getUserRoleInAgreement(agreement, user?.id);
  }, [agreement, user?.id]);

  const isLender = userRole === 'lender';
  const isBorrower = userRole === 'borrower';

  const fetchAgreementConfirmationState = async () => {
    if (!id) {
      return null;
    }

    const { data, error } = await supabase
      .from("debt_agreements")
      .select("id, status, lender_confirmed, borrower_confirmed")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  };

  // Get signed URL for preview
  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (transferSlipUrl && showPreview) {
        setLoadingUrl(true);
        const url = await getPaymentSlipSignedUrl(transferSlipUrl, 600);
        setSignedUrl(url);
        setLoadingUrl(false);
      }
    };
    fetchSignedUrl();
  }, [transferSlipUrl, showPreview]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agreement) return;

    const validationError = validatePaymentSlipFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadPaymentSlip({
        agreementId: agreement.id,
        kind: 'transfer',
        entityId: agreement.id,
        file,
      });

      if ('error' in result) throw result.error;

      setTransferSlipUrl(result.path);
      toast.success("อัปโหลดสลิปโอนเงินสำเร็จ");
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

  const handleConfirmClick = () => {
    const effectiveTransferSlipUrl = transferSlipUrl || agreement?.transfer_slip_url || null;

    if (!user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      navigate("/auth");
      return;
    }
    
    // Lender must upload transfer slip before confirming
    if (isLender && !effectiveTransferSlipUrl) {
      toast.error("กรุณาอัปโหลดสลิปโอนเงินให้ยืมก่อน", {
        description: "สลิปโอนเงินเป็นหลักฐานสำคัญสำหรับทั้งสองฝ่าย"
      });
      return;
    }
    
    // Must accept legal agreement text
    if (!agreementAccepted) {
      toast.error("กรุณาอ่านและยอมรับข้อตกลงก่อน");
      return;
    }
    
    setShowPasswordConfirm(true);
  };

  const handleConfirmedApproval = async () => {
    if (!agreement || !user) return;
    if (!isLender && !isBorrower) {
      toast.error("คุณไม่มีสิทธิ์ยืนยันข้อตกลงนี้");
      return;
    }

    const effectiveTransferSlipUrl = transferSlipUrl || agreement.transfer_slip_url || null;

    setIsConfirming(true);
    try {
      const latestAgreement = await fetchAgreementConfirmationState();
      if (!latestAgreement) {
        toast.error("ไม่พบข้อตกลงล่าสุด");
        return;
      }

      if (latestAgreement.status !== "pending_confirmation") {
        toast.error("ข้อตกลงนี้ไม่อยู่ในสถานะที่ยืนยันได้แล้ว");
        return;
      }

      // Get IP and Device info for legal evidence
      const [clientIP, deviceId] = await Promise.all([
        getClientIP(),
        Promise.resolve(getDeviceIdString())
      ]);
      const confirmedAt = new Date().toISOString();
      const { error } = await supabase.rpc("confirm_agreement_transfer", {
        p_agreement_id: agreement.id,
        p_transfer_slip_url: isLender ? effectiveTransferSlipUrl : null,
        p_mark_lender_confirmed: isLender,
        p_mark_borrower_confirmed: isBorrower,
        p_mark_borrower_transfer_confirmed: isBorrower,
        p_confirmed_at: confirmedAt,
        p_client_ip: clientIP,
        p_device_id: deviceId,
      });

      if (error) throw error;

      await refresh();
      
      const willBeFullyConfirmed = isLender
        ? Boolean(latestAgreement.borrower_confirmed)
        : Boolean(latestAgreement.lender_confirmed);

      if (willBeFullyConfirmed) {
        toast.success("ข้อตกลงถูกยืนยันแล้ว!", {
          description: "งวดชำระจะแสดงในปฏิทิน",
        });
      } else {
        toast.success("ยืนยันข้อตกลงสำเร็จ!", {
          description: "รออีกฝ่ายยืนยัน",
        });
      }
      
      navigate("/");
    } catch (error) {
      console.error("Error confirming agreement:", error);
      toast.error("ไม่สามารถยืนยันได้", {
        description: toThaiServerError(error),
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReject = async () => {
    if (!agreement || !user) return;
    if (!isLender && !isBorrower) {
      toast.error("คุณไม่มีสิทธิ์ปฏิเสธข้อตกลงนี้");
      return;
    }

    try {
      const latestAgreement = await fetchAgreementConfirmationState();
      if (!latestAgreement) {
        toast.error("ไม่พบข้อตกลงล่าสุด");
        return;
      }

      if (latestAgreement.status !== "pending_confirmation") {
        toast.error("ข้อตกลงนี้ไม่สามารถปฏิเสธได้แล้ว");
        return;
      }

      let rejectQuery = supabase
        .from('debt_agreements')
        .update({ status: 'cancelled' })
        .eq('id', agreement.id);

      rejectQuery = isLender
        ? rejectQuery.eq('lender_id', user.id)
        : rejectQuery.eq('borrower_id', user.id);

      const { error } = await rejectQuery;

      if (error) throw error;

      await refresh();
      toast.success("ปฏิเสธข้อตกลงแล้ว");
      navigate("/");
    } catch (error) {
      console.error("Error rejecting agreement:", error);
      toast.error("ไม่สามารถปฏิเสธได้", {
        description: toThaiServerError(error),
      });
    }
  };

  const frequencyLabels: Record<string, string> = {
    daily: "รายวัน",
    weekly: "รายสัปดาห์",
    monthly: "รายเดือน",
  };

  const interestTypeLabels: Record<string, string> = {
    none: "ไม่มีดอกเบี้ย",
    flat: "Flat Rate",
    effective: "Effective Rate",
  };

  if (!agreement && isLoading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <p className="text-muted-foreground">ไม่พบข้อตกลง</p>
      </div>
    );
  }

  const partnerName = isLender ? agreement.borrower_name : "ผู้ให้ยืม";
  const roleLabel = isLender ? "คุณให้ยืม" : "คุณยืม";

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 py-4"
        >
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <h1 className="text-xl font-heading font-semibold text-foreground">ยืนยันข้อตกลง</h1>
        </motion.header>

        {/* Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-status-pending/10 border border-status-pending/20 rounded-2xl p-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-status-pending/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-status-pending" />
            </div>
            <div>
              <p className="font-medium text-foreground">รอการยืนยัน</p>
              <p className="text-sm text-muted-foreground">
                {agreement.lender_confirmed ? "ผู้ให้ยืมยืนยันแล้ว" : "รอผู้ให้ยืมยืนยัน"}
                {" • "}
                {agreement.borrower_confirmed ? "ผู้ยืมยืนยันแล้ว" : "รอผู้ยืมยืนยัน"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Transfer Slip Upload Section for Lender */}
        {isLender && !agreement.lender_confirmed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={`rounded-2xl p-5 mb-6 border-2 ${
              transferSlipUrl 
                ? "bg-status-paid/10 border-status-paid/30" 
                : "bg-amber-500/10 border-amber-500/30"
            }`}
          >
            <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              อัปโหลดสลิปโอนเงินให้ยืม
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              กรุณาอัปโหลดหลักฐานการโอนเงินให้ยืม เพื่อเป็นหลักฐานสำหรับทั้งสองฝ่าย
            </p>
            
            {transferSlipUrl ? (
              <div className="flex items-center justify-between bg-card rounded-xl p-3">
                <div className="flex items-center gap-2 text-status-paid">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">อัปโหลดสลิปแล้ว</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowPreview(true)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    ดู
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-1" />
                        เปลี่ยน
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    กำลังอัปโหลด...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    เลือกไฟล์สลิป
                  </>
                )}
              </Button>
            )}
          </motion.div>
        )}

        {/* Agreement Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl p-5 shadow-card space-y-6 mb-6"
        >
          {/* Partner Info */}
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{partnerName || "ไม่ระบุ"}</p>
              <p className="text-sm text-muted-foreground">{roleLabel}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-1">ยอดรวมทั้งหมด</p>
            <p className="text-4xl font-heading font-bold text-foreground">
              ฿{agreement.total_amount.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              เงินต้น ฿{agreement.principal_amount.toLocaleString()}
              {agreement.interest_rate > 0 && (
                <> + ดอกเบี้ย {agreement.interest_rate}%</>
              )}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">จำนวนงวด</p>
              <p className="text-lg font-semibold text-foreground">{agreement.num_installments} งวด</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">รอบชำระ</p>
              <p className="text-lg font-semibold text-foreground">{frequencyLabels[agreement.frequency]}</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">ประเภทดอกเบี้ย</p>
              <p className="text-lg font-semibold text-foreground">{interestTypeLabels[agreement.interest_type]}</p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">เริ่มชำระ</p>
              <p className="text-lg font-semibold text-foreground">
                {new Date(agreement.start_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>

          {/* Per Installment */}
          <div className="bg-primary/10 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">ยอดชำระต่องวด</p>
            <p className="text-2xl font-heading font-bold text-primary">
              ฿{Math.ceil(agreement.total_amount / agreement.num_installments).toLocaleString()}
            </p>
          </div>

          {/* Payment Schedule */}
          {agreement.installments && agreement.installments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                ตารางชำระ
              </p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {agreement.installments.map((inst) => (
                  <div
                    key={inst.id}
                    className="flex justify-between items-center bg-secondary/30 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {inst.installment_number}
                      </span>
                      <div>
                        <p className="font-medium text-foreground">งวดที่ {inst.installment_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(inst.due_date).toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground">฿{inst.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Legal Agreement Text Section */}
        {!(isLender && agreement.lender_confirmed) && !(isBorrower && agreement.borrower_confirmed) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-2xl p-5 shadow-card mb-6"
          >
            <AgreementLegalText
              borrowerName={agreement.borrower_name || ""}
              lenderName={lenderName || "ผู้ให้ยืม"}
              amount={agreement.principal_amount}
              totalAmount={agreement.total_amount}
              interestRate={agreement.interest_rate || 0}
              numInstallments={agreement.num_installments}
              startDate={agreement.start_date}
              isLender={isLender}
              accepted={agreementAccepted}
              onAcceptChange={setAgreementAccepted}
            />
          </motion.div>
        )}

        {/* Sign formal contract CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mb-4"
        >
          <Button
            variant="outline"
            className="w-full h-12 text-base border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => navigate(`/agreement/${agreement.id}/contract`)}
          >
            <FileSignature className="w-5 h-5 mr-2" />
            ทำหนังสือสัญญากู้ยืมเงิน (สำหรับใช้ในชั้นศาล)
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            ออกหนังสือสัญญาแบบเป็นทางการ ลงนามอิเล็กทรอนิกส์ทั้งสองฝ่าย พิมพ์เป็น PDF ได้
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <Button
            className="w-full h-12 text-base"
            onClick={handleConfirmClick}
            disabled={
              (isLender && agreement.lender_confirmed) ||
              (isBorrower && agreement.borrower_confirmed)
            }
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            {(isLender && agreement.lender_confirmed) || (isBorrower && agreement.borrower_confirmed)
              ? "ยืนยันแล้ว"
              : isLender 
                ? "ยืนยันข้อตกลงพร้อมสลิปโอน" 
                : "ยืนยันข้อตกลง"
            }
          </Button>
          
          {agreement.status === 'pending_confirmation' && (
            <Button
              variant="outline"
              className="w-full h-12 text-base text-status-overdue border-status-overdue/30 hover:bg-status-overdue/10"
              onClick={handleReject}
            >
              <AlertCircle className="w-5 h-5 mr-2" />
              ปฏิเสธข้อตกลง
            </Button>
          )}
        </motion.div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          {isLender 
            ? "อัปโหลดสลิปโอนเงินให้ยืมก่อนกดยืนยัน" 
            : "เมื่อทั้งสองฝ่ายยืนยันแล้ว ข้อตกลงจะเริ่มใช้งานทันที"
          }
        </p>
      </div>

      {/* Password Confirmation Dialog */}
      <PasswordConfirmDialog
        open={showPasswordConfirm}
        onOpenChange={setShowPasswordConfirm}
        onConfirm={handleConfirmedApproval}
        title="ยืนยันการอนุมัติ"
        description="กรุณาใส่รหัสผ่านเพื่อยืนยันข้อตกลงนี้"
        confirmButtonText="ยืนยันข้อตกลง"
        isLoading={isConfirming}
      />

      {/* Slip Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>สลิปโอนเงินให้ยืม</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4">
            {loadingUrl ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : signedUrl ? (
              signedUrl.toLowerCase().includes('.pdf') ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">ไฟล์ PDF</p>
                  <Button
                    variant="outline"
                    onClick={() => window.open(signedUrl, '_blank')}
                  >
                    เปิดดู PDF
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={signedUrl}
                    alt="Transfer slip"
                    className="w-full rounded-lg cursor-zoom-in"
                    style={{ touchAction: 'pinch-zoom' }}
                    onClick={() => window.open(signedUrl, '_blank')}
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    แตะรูปเพื่อดูขนาดเต็ม
                  </p>
                </div>
              )
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

    </div>
    </PageTransition>
  );
}
