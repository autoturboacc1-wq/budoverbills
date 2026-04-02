import { format } from "date-fns";
import { th } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, AlertTriangle } from "lucide-react";

interface AgreementLegalTextProps {
  borrowerName: string;
  lenderName: string;
  amount: number;
  totalAmount: number;
  interestRate: number;
  numInstallments: number;
  startDate: string;
  isLender: boolean;
  accepted: boolean;
  onAcceptChange: (accepted: boolean) => void;
}

export function AgreementLegalText({
  borrowerName,
  lenderName,
  amount,
  totalAmount,
  interestRate,
  numInstallments,
  startDate,
  isLender,
  accepted,
  onAcceptChange,
}: AgreementLegalTextProps) {
  const now = new Date();
  const formattedDate = format(now, "d MMMM yyyy เวลา HH:mm น.", { locale: th });
  const formattedStartDate = format(new Date(startDate), "d MMMM yyyy", { locale: th });
  const installmentAmount = Math.ceil(totalAmount / numInstallments);

  // Generate agreement text based on role
  const agreementText = isLender
    ? `ข้าพเจ้า ${lenderName || "[ชื่อผู้ให้ยืม]"} 
ยืนยันว่าได้โอนเงินจำนวน ${amount.toLocaleString()} บาท 
ให้แก่ ${borrowerName || "[ชื่อผู้ยืม]"} 
เมื่อวันที่ ${formattedDate}

โดยมีเงื่อนไขการชำระคืนดังนี้:
• ยอดรวมที่ต้องชำระ: ${totalAmount.toLocaleString()} บาท
${interestRate > 0 ? `• อัตราดอกเบี้ย: ${interestRate}%` : "• ไม่มีดอกเบี้ย"}
• จำนวนงวด: ${numInstallments} งวด
• งวดละ: ${installmentAmount.toLocaleString()} บาท
• เริ่มชำระงวดแรก: ${formattedStartDate}

การกดยืนยันนี้ถือเป็นการแสดงเจตนาโดยสมัครใจ
และสามารถใช้เป็นหลักฐานทางกฎหมายได้`
    : `ข้าพเจ้า ${borrowerName || "[ชื่อผู้ยืม]"} 
ยืนยันว่าได้รับเงินจำนวน ${amount.toLocaleString()} บาท 
จาก ${lenderName || "[ชื่อผู้ให้ยืม]"} 
เมื่อวันที่ ${formattedDate}

และตกลงจะชำระคืนตามเงื่อนไขดังนี้:
• ยอดรวมที่ต้องชำระ: ${totalAmount.toLocaleString()} บาท
${interestRate > 0 ? `• อัตราดอกเบี้ย: ${interestRate}%` : "• ไม่มีดอกเบี้ย"}
• จำนวนงวด: ${numInstallments} งวด
• งวดละ: ${installmentAmount.toLocaleString()} บาท
• เริ่มชำระงวดแรก: ${formattedStartDate}

การกดยืนยันนี้ถือเป็นการแสดงเจตนาโดยสมัครใจ
และสามารถใช้เป็นหลักฐานทางกฎหมายได้`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-foreground">
        <FileText className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">บันทึกข้อตกลงการยืมเงิน</h3>
      </div>

      {/* Legal Text Box */}
      <ScrollArea className="h-[200px] rounded-xl border border-border bg-secondary/30 p-4">
        <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
          {agreementText}
        </pre>
      </ScrollArea>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-status-pending/10 border border-status-pending/20 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 text-status-pending mt-0.5 flex-shrink-0" />
        <p className="text-xs text-status-pending">
          Budoverbills เป็นเครื่องมือบันทึกข้อตกลง ไม่ใช่คู่สัญญา และไม่รับผิดชอบการชำระหนี้
        </p>
      </div>

      {/* Acceptance Checkbox */}
      <div className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border">
        <Checkbox
          id="accept-agreement"
          checked={accepted}
          onCheckedChange={(checked) => onAcceptChange(checked === true)}
          className="mt-0.5"
        />
        <label
          htmlFor="accept-agreement"
          className="text-sm text-foreground cursor-pointer leading-relaxed"
        >
          ข้าพเจ้าได้อ่านและยอมรับข้อตกลงข้างต้น และยืนยันว่าข้อมูลทั้งหมดเป็นความจริง
        </label>
      </div>
    </div>
  );
}
