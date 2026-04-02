import { useMemo } from "react";
import { Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generatePromptPayPayload } from "@/utils/promptpay";

interface PromptPayQRProps {
  promptPayId: string;
  amount: number;
  recipientName?: string | null;
}

export function PromptPayQR({ promptPayId, amount, recipientName }: PromptPayQRProps) {
  const canShare = typeof navigator.share === "function";
  const { payload, error } = useMemo(() => {
    try {
      return {
        payload: generatePromptPayPayload(promptPayId, amount),
        error: null,
      };
    } catch (caughtError) {
      return {
        payload: null,
        error: caughtError instanceof Error ? caughtError.message : "ไม่สามารถสร้าง QR พร้อมเพย์ได้",
      };
    }
  }, [amount, promptPayId]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(promptPayId);
    toast.success("คัดลอกข้อมูลพร้อมเพย์แล้ว");
  };

  const handleShare = async () => {
    if (!canShare) return;

    await navigator.share({
      title: "PromptPay QR",
      text: `PromptPay ${recipientName ? `สำหรับ ${recipientName}` : ""}\nยอด ${amount.toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} บาท\nหมายเลข: ${promptPayId}`,
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">สแกนเพื่อชำระผ่าน PromptPay</p>
        {recipientName ? (
          <p className="mt-1 text-xs text-muted-foreground">ผู้รับเงิน: {recipientName}</p>
        ) : null}
        <p className="mt-2 text-2xl font-semibold text-primary">
          ฿
          {amount.toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>

      {payload ? (
        <div className="flex justify-center">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeSVG includeMargin size={220} value={payload} />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-background/80 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">PromptPay</span>
          <span className="font-mono font-medium text-foreground">{promptPayId}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" size="sm" type="button" variant="outline" onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          คัดลอก
        </Button>
        {canShare ? (
          <Button className="flex-1" size="sm" type="button" variant="outline" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            แชร์
          </Button>
        ) : null}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        หลังโอนแล้วให้อัปโหลดสลิปในแท็บอัปโหลดสลิปเพื่อส่งให้เจ้าหนี้ตรวจสอบ
      </p>
    </div>
  );
}
