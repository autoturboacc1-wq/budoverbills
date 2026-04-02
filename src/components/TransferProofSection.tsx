import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Upload, 
  Loader2, 
  Eye, 
  CheckCircle2, 
  Clock,
  Image as ImageIcon,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getPaymentSlipSignedUrl,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from "@/utils/paymentSlipStorage";

interface TransferProofSectionProps {
  agreementId: string;
  transferSlipUrl: string | null;
  transferredAt: string | null;
  borrowerConfirmedTransfer: boolean;
  borrowerConfirmedTransferAt: string | null;
  isLender: boolean;
  isBorrower: boolean;
  onUpdate: () => void;
}

export function TransferProofSection({
  agreementId,
  transferSlipUrl,
  transferredAt,
  borrowerConfirmedTransfer,
  borrowerConfirmedTransferAt,
  isLender,
  isBorrower,
  onUpdate,
}: TransferProofSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get signed URL when opening preview
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
        kind: 'transfer',
        entityId: agreementId,
        file,
      });

      if ('error' in result) throw result.error;

      // Update agreement with transfer slip URL
      const { error: updateError } = await supabase
        .from('debt_agreements')
        .update({
          transfer_slip_url: result.path,
          transferred_at: new Date().toISOString(),
        })
        .eq('id', agreementId);

      if (updateError) throw updateError;

      toast.success("อัปโหลดสลิปโอนเงินให้ยืมสำเร็จ");
      onUpdate();
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

  const handleBorrowerConfirm = async () => {
    setIsConfirming(true);
    try {
      const { error } = await supabase
        .from('debt_agreements')
        .update({
          borrower_confirmed_transfer: true,
          borrower_confirmed_transfer_at: new Date().toISOString(),
        })
        .eq('id', agreementId);

      if (error) throw error;

      toast.success("ยืนยันรับเงินสำเร็จ", {
        description: "ขอบคุณที่ยืนยันการรับเงิน",
      });
      onUpdate();
    } catch (error) {
      console.error("Confirm error:", error);
      toast.error("เกิดข้อผิดพลาดในการยืนยัน");
    } finally {
      setIsConfirming(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="bg-card rounded-2xl p-5 shadow-card mb-4"
    >
      <h2 className="font-medium text-foreground mb-4 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        หลักฐานการโอนเงินให้ยืม
      </h2>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* No slip uploaded yet */}
      {!transferSlipUrl && (
        <div className="text-center py-6">
          {isLender ? (
            <>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                อัปโหลดสลิปโอนเงินเพื่อเป็นหลักฐานว่าโอนให้ยืมแล้ว
              </p>
              <Button
                variant="outline"
                onClick={triggerFileInput}
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
                    อัปโหลดสลิปโอน
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="bg-amber-500/10 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="font-medium text-foreground">รอผู้ให้ยืมอัปโหลดหลักฐาน</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    ผู้ให้ยืมยังไม่ได้อัปโหลดสลิปโอนเงินให้ยืม
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slip uploaded - show status */}
      {transferSlipUrl && (
        <div className="space-y-4">
          {/* Transfer Slip Preview */}
          <div className="bg-secondary/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-status-paid/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-status-paid" />
                </div>
                <div>
                  <p className="font-medium text-foreground">ผู้ให้ยืมโอนเงินแล้ว</p>
                  {transferredAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(transferredAt)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPreview(true)}
              >
                <Eye className="w-4 h-4 mr-1" />
                ดูสลิป
              </Button>
            </div>
          </div>

          {/* Borrower Confirmation Status */}
          <div className={`rounded-xl p-4 ${
            borrowerConfirmedTransfer 
              ? "bg-status-paid/10" 
              : "bg-amber-500/10"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  borrowerConfirmedTransfer 
                    ? "bg-status-paid/20" 
                    : "bg-amber-500/20"
                }`}>
                  {borrowerConfirmedTransfer ? (
                    <CheckCircle2 className="w-5 h-5 text-status-paid" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {borrowerConfirmedTransfer 
                      ? "ผู้ยืมยืนยันรับเงินแล้ว" 
                      : "รอผู้ยืมยืนยันรับเงิน"
                    }
                  </p>
                  {borrowerConfirmedTransfer && borrowerConfirmedTransferAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(borrowerConfirmedTransferAt)}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Borrower can confirm receiving money */}
              {isBorrower && !borrowerConfirmedTransfer && (
                <Button
                  size="sm"
                  onClick={handleBorrowerConfirm}
                  disabled={isConfirming}
                >
                  {isConfirming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      ยืนยันรับเงิน
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Lender can re-upload if borrower hasn't confirmed yet */}
          {isLender && !borrowerConfirmedTransfer && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={triggerFileInput}
                disabled={isUploading}
                className="text-muted-foreground"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-1" />
                )}
                อัปโหลดใหม่
              </Button>
            </div>
          )}
        </div>
      )}

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
    </motion.div>
  );
}
