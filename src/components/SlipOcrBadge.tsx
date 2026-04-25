import { useEffect, useState } from "react";
import { Check, AlertTriangle, ScanLine, Loader2 } from "lucide-react";

const REASON_LABELS: Record<string, string> = {
  amount_low: "ยอดเงินในสลิปน้อยกว่าค่างวด",
  amount_high: "ยอดเงินในสลิปมากกว่าค่างวด",
  amount_unreadable: "อ่านยอดเงินจากสลิปไม่ออก",
  receiver_mismatch: "เลขบัญชีผู้รับไม่ตรงกับบัญชีของผู้ให้ยืม",
  receiver_unreadable: "อ่านบัญชีผู้รับไม่ออก",
  duplicate_reference: "เลขอ้างอิงสลิปซ้ำกับรายการอื่น",
  download_failed: "ไม่สามารถดาวน์โหลดไฟล์สลิปเพื่อตรวจสอบได้",
  provider_error: "ระบบตรวจสอบสลิปไม่ตอบสนอง",
};

const OCR_TIMEOUT_MS = 30_000;

interface SlipOcrBadgeProps {
  ocrStatus?: string | null;
  ocrAmount?: number | null;
  ocrMismatchReasons?: string[] | null;
  submittedAt?: string | null;
  className?: string;
}

export function SlipOcrBadge({
  ocrStatus,
  ocrAmount,
  ocrMismatchReasons,
  submittedAt,
  className,
}: SlipOcrBadgeProps) {
  const elapsedMs = submittedAt ? Date.now() - new Date(submittedAt).getTime() : 0;
  const initialTimedOut = !ocrStatus && submittedAt != null && elapsedMs >= OCR_TIMEOUT_MS;
  const [timedOut, setTimedOut] = useState(initialTimedOut);

  useEffect(() => {
    if (ocrStatus || !submittedAt) return;
    const remaining = OCR_TIMEOUT_MS - elapsedMs;
    if (remaining <= 0) {
      setTimedOut(true);
      return;
    }
    const handle = window.setTimeout(() => setTimedOut(true), remaining);
    return () => window.clearTimeout(handle);
  }, [ocrStatus, submittedAt, elapsedMs]);

  if (!ocrStatus && !timedOut) {
    return (
      <div
        className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}
        role="status"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        <span>กำลังตรวจสอบสลิปอัตโนมัติ...</span>
      </div>
    );
  }

  if (ocrStatus === "matched") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-status-paid/30 bg-status-paid/10 px-3 py-2 text-xs text-status-paid ${className ?? ""}`}
        role="status"
      >
        <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col">
          <span className="font-medium">ตรวจสอบสลิปอัตโนมัติแล้ว</span>
          {typeof ocrAmount === "number" && (
            <span className="text-status-paid/80">ยอดในสลิป: ฿{ocrAmount.toLocaleString()}</span>
          )}
        </div>
      </div>
    );
  }

  if (ocrStatus === "mismatched") {
    const reasons = (ocrMismatchReasons ?? []).map((r) => REASON_LABELS[r] ?? r);
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border border-status-overdue/30 bg-status-overdue/10 px-3 py-2 text-xs text-status-overdue ${className ?? ""}`}
        role="status"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <span className="font-medium">ระบบตรวจสอบสลิปพบความไม่ตรงกัน</span>
          {typeof ocrAmount === "number" && (
            <span className="text-status-overdue/90">ยอดในสลิป: ฿{ocrAmount.toLocaleString()}</span>
          )}
          {reasons.length > 0 && (
            <ul className="list-disc pl-4 text-status-overdue/90">
              {reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          )}
          <span className="text-status-overdue/70">โปรดตรวจสอบสลิปด้วยตาก่อนยืนยัน</span>
        </div>
      </div>
    );
  }

  // failed OR timed out (provider not configured / network slow)
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 ${className ?? ""}`}
      role="status"
    >
      <ScanLine className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>ไม่สามารถตรวจสอบสลิปอัตโนมัติได้ — กรุณาตรวจสอบด้วยตา</span>
    </div>
  );
}
