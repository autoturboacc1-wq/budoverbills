import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getPaymentSlipSignedUrl,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from "@/utils/paymentSlipStorage";

interface PaymentSlipUploadProps {
  agreementId: string;
  installmentId: string;
  currentSlipUrl: string | null;
  isLender: boolean;
  onSlipUploaded: (url: string) => void;
  onConfirmPayment?: () => void;
  isConfirmedByLender?: boolean;
}

export function PaymentSlipUpload({
  agreementId,
  installmentId,
  currentSlipUrl,
  isLender,
  onSlipUploaded,
  onConfirmPayment,
  isConfirmedByLender,
}: PaymentSlipUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [signedSlipUrl, setSignedSlipUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get signed URL when opening preview or when slip URL changes
  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (currentSlipUrl && showPreview) {
        setLoadingUrl(true);
        const url = await getPaymentSlipSignedUrl(currentSlipUrl, 600);
        setSignedSlipUrl(url);
        setLoadingUrl(false);
      }
    };
    fetchSignedUrl();
  }, [currentSlipUrl, showPreview]);

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
        kind: 'installment',
        entityId: installmentId,
        file,
      });

      if ('error' in result) throw result.error;

      // Store the file path (not public URL) - will use signed URL to display
      onSlipUploaded(result.path);
      toast.success("อัปโหลดสลิปสำเร็จ", {
        description: "รอผู้ให้ยืมยืนยันการชำระ",
      });
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleOpenPreview = async () => {
    setShowPreview(true);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        {/* Show current slip if exists */}
        {currentSlipUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={handleOpenPreview}
          >
            <Eye className="w-3 h-3 mr-1" />
            ดูสลิป
          </Button>
        )}

        {/* Upload button for borrower (if no slip yet) */}
        {!isLender && !currentSlipUrl && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={triggerFileInput}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                กำลังอัปโหลด...
              </>
            ) : (
              <>
                <Upload className="w-3 h-3 mr-1" />
                อัปโหลดสลิป
              </>
            )}
          </Button>
        )}

        {/* Re-upload option for borrower */}
        {!isLender && currentSlipUrl && !isConfirmedByLender && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={triggerFileInput}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Upload className="w-3 h-3 mr-1" />
                อัปโหลดใหม่
              </>
            )}
          </Button>
        )}

        {/* Confirm button for lender */}
        {isLender && currentSlipUrl && !isConfirmedByLender && onConfirmPayment && (
          <Button
            size="sm"
            className="text-xs"
            onClick={onConfirmPayment}
          >
            <Check className="w-3 h-3 mr-1" />
            ยืนยันรับเงิน
          </Button>
        )}

        {/* Confirmed indicator */}
        {isConfirmedByLender && (
          <span className="text-xs text-status-paid flex items-center gap-1">
            <Check className="w-3 h-3" />
            ยืนยันแล้ว
          </span>
        )}
      </div>

      {/* Slip Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>สลิปการโอนเงิน</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4">
            {loadingUrl ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : signedSlipUrl ? (
              signedSlipUrl.toLowerCase().includes('.pdf') ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">ไฟล์ PDF</p>
                  <Button
                    variant="outline"
                    onClick={() => window.open(signedSlipUrl, '_blank')}
                  >
                    เปิดดู PDF
                  </Button>
                </div>
              ) : (
                <div className="relative">
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
    </>
  );
}
