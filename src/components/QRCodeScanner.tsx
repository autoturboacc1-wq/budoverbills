import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, RefreshCw } from "lucide-react";

interface QRCodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

function sanitizeDecodedText(decodedText: string): string | null {
  const trimmed = decodedText.trim();

  if (!trimmed || trimmed.length > 1024) {
    return null;
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    const charCode = trimmed.charCodeAt(index);
    if (charCode < 32 || charCode === 127) {
      return null;
    }
  }

  return trimmed;
}

export function QRCodeScanner({ open, onClose, onScan }: QRCodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountId = "qr-reader";

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setError(null);
    setIsScanning(true);

    try {
      const html5QrCode = new Html5Qrcode(mountId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          const safeText = sanitizeDecodedText(decodedText);
          if (!safeText) {
            setError("QR Code ไม่ถูกต้อง");
            void stopScanner();
            return;
          }

          onScan(safeText);
          stopScanner();
          onClose();
        },
        () => {
          // Ignore scan errors (no QR found)
        }
      );
    } catch (err: unknown) {
      console.error("QR Scanner error:", err);
      const errorMessage = err instanceof Error ? err.message : "";
      setError(
        errorMessage.includes("Permission")
          ? "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตการเข้าถึงกล้องในเบราว์เซอร์" 
          : "ไม่สามารถเปิดกล้องได้ กรุณาลองใหม่อีกครั้ง"
      );
      setIsScanning(false);
    }
  }, [onClose, onScan, stopScanner]);

  useEffect(() => {
    if (open) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [open, startScanner, stopScanner]);

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            สแกน QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4">
          {error ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-destructive" />
              </div>
              <p className="text-sm text-foreground mb-4">{error}</p>
              <Button onClick={startScanner} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                ลองใหม่
              </Button>
            </div>
          ) : (
            <>
              <div
                id={mountId}
                className="w-full rounded-xl overflow-hidden bg-black min-h-[280px]"
              />
              <p className="text-xs text-muted-foreground text-center mt-3">
                หันกล้องไปที่ QR Code ของเพื่อน
              </p>
            </>
          )}

          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={handleClose}
          >
            ยกเลิก
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
