# Phase 1 — Critical Features

> **Priority:** สูงสุด — ควรทำก่อน  
> **เป้าหมาย:** เพิ่ม Trust, ลด Overdue, สร้าง Legal trail

---

## Feature 1: PromptPay QR Code Integration

### Why
`qrcode.react` ติดตั้งอยู่แล้วแต่ยังไม่ได้ใช้กับ PromptPay ผู้ใช้ไทยจ่ายเงินผ่าน PromptPay เป็นหลัก การเพิ่ม QR Code ในหน้า installment จะลด friction การจ่ายเงินได้มาก

### Database Changes
ไม่มี — ใช้ `profiles.phone` ที่มีอยู่แล้ว

### New Files

#### `src/utils/promptpay.ts`
PromptPay EMV Co-compliant QR payload generator

```typescript
function tlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${tag}${length}${value}`;
}

function crc16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

export function generatePromptPayPayload(phoneOrNationalId: string, amount?: number): string {
  const sanitized = phoneOrNationalId.replace(/[^0-9]/g, '');
  const accountType = sanitized.length === 13 ? '02' : '01'; // national id vs phone
  const phone = sanitized.length === 10 ? '0066' + sanitized.slice(1) : sanitized;

  const merchantAccount = tlv('00', 'A000000677010111') + tlv(accountType, phone);
  let payload =
    tlv('00', '01') +
    tlv('01', '12') +                                    // 12 = dynamic QR
    tlv('29', merchantAccount) +
    tlv('53', '764') +                                   // THB currency code
    (amount !== undefined ? tlv('54', amount.toFixed(2)) : '') +
    tlv('58', 'TH') +
    '6304';                                              // CRC placeholder tag

  return payload + crc16(payload);
}
```

#### `src/components/PromptPayQR.tsx`
QR display component พร้อม copy/share

```tsx
import { QRCodeSVG } from 'qrcode.react'; // already installed
import { generatePromptPayPayload } from '@/utils/promptpay';
import { Button } from '@/components/ui/button';
import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface PromptPayQRProps {
  phone: string;
  amount: number;
  recipientName: string;
}

export function PromptPayQR({ phone, amount, recipientName }: PromptPayQRProps) {
  const payload = generatePromptPayPayload(phone, amount);

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({ title: 'PromptPay QR', text: `จ่ายให้ ${recipientName} ฿${amount.toLocaleString()}` });
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <p className="text-sm font-medium">{recipientName}</p>
      <QRCodeSVG value={payload} size={220} includeMargin />
      <p className="text-lg font-bold">฿{amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(payload);
            toast.success('คัดลอก payload แล้ว');
          }}
        >
          <Copy className="w-4 h-4 mr-1" /> คัดลอก
        </Button>
        {navigator.share && (
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-1" /> แชร์
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Modified Files

#### `src/pages/DebtDetail.tsx`
เพิ่มปุ่ม "จ่ายผ่าน PromptPay" ในแต่ละ installment row:
```tsx
import { PromptPayQR } from '@/components/PromptPayQR';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ใน installment row:
<Button
  variant="ghost"
  size="sm"
  onClick={() => setPromptPayTarget({ phone: lenderPhone, amount: inst.amount })}
>
  <QrCode className="w-4 h-4" /> PromptPay
</Button>

// Dialog:
<Dialog open={!!promptPayTarget} onOpenChange={() => setPromptPayTarget(null)}>
  <DialogContent>
    <DialogHeader><DialogTitle>สแกนเพื่อจ่าย</DialogTitle></DialogHeader>
    {promptPayTarget && (
      <PromptPayQR
        phone={promptPayTarget.phone}
        amount={promptPayTarget.amount}
        recipientName={lenderName}
      />
    )}
  </DialogContent>
</Dialog>
```

#### `src/components/PaymentDialog.tsx`
เพิ่ม Tab "PromptPay QR" ควบคู่กับ slip upload:
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

<Tabs defaultValue="slip">
  <TabsList>
    <TabsTrigger value="slip">อัพโหลดสลิป</TabsTrigger>
    <TabsTrigger value="qr">PromptPay QR</TabsTrigger>
  </TabsList>
  <TabsContent value="slip">
    {/* existing slip upload UI */}
  </TabsContent>
  <TabsContent value="qr">
    <PromptPayQR phone={lenderPhone} amount={installmentAmount} recipientName={lenderName} />
  </TabsContent>
</Tabs>
```

### Testing
1. สร้าง installment ทดสอบ
2. เปิด PromptPay QR → สแกนด้วย mobile banking app
3. ตรวจว่าจำนวนเงินและชื่อถูกต้อง
4. ทดสอบ copy payload + paste ใน app อื่น

---

## Feature 2: Payment Reminder Automation (Cron)

### Why
ปัจจุบันไม่มี scheduled reminders เลย ผู้ใช้ลืมจ่ายทำให้ installment เป็น overdue — ส่งผลต่อความสัมพันธ์และ credit score

### Database Changes
ไม่มี — ใช้ `notifications` และ `push_subscriptions` ที่มีอยู่แล้ว

### New Files

#### `supabase/functions/payment-reminder-cron/index.ts`
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

Deno.serve(async (_req) => {
  const today = new Date();
  const in1Day = toDateString(addDays(today, 1));
  const in3Days = toDateString(addDays(today, 3));
  const todayStr = toDateString(today);

  // ดึง installments ที่ใกล้ due หรือ overdue
  const { data: installments, error } = await supabase
    .from('installments')
    .select(`
      id, due_date, amount, debt_agreement_id,
      debt_agreements!inner(borrower_id, lender_id, principal_amount)
    `)
    .in('due_date', [in1Day, in3Days, todayStr])
    .eq('status', 'pending');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let processed = 0;
  for (const inst of installments ?? []) {
    const borrowerId = (inst.debt_agreements as any).borrower_id;
    const daysUntilDue = inst.due_date === in1Day ? 1 : inst.due_date === in3Days ? 3 : 0;

    // Deduplication: ตรวจว่าเคยส่ง reminder วันนี้แล้วหรือยัง
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'payment_reminder')
      .eq('related_id', inst.id)
      .gte('created_at', todayStr)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const title = daysUntilDue === 0
      ? '🔔 วันนี้ครบกำหนดชำระ'
      : `⏰ ครบกำหนดชำระใน ${daysUntilDue} วัน`;

    const message = `ยอดชำระ ฿${Number(inst.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} วันที่ ${new Date(inst.due_date).toLocaleDateString('th-TH')}`;

    await supabase.from('notifications').insert({
      user_id: borrowerId,
      type: 'payment_reminder',
      title,
      message,
      related_id: inst.debt_agreement_id,
      related_type: 'agreement',
    });

    processed++;
  }

  return new Response(JSON.stringify({ processed, checked: installments?.length ?? 0 }));
});
```

#### `supabase/functions/payment-reminder-cron/deno.json`
```json
{
  "imports": {
    "https://esm.sh/@supabase/supabase-js@2": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

### Cron Setup (Supabase Dashboard)
- **Schedule:** `0 1 * * *` (01:00 UTC = 08:00 Bangkok time)
- **Function:** `payment-reminder-cron`
- **Method:** POST

### Testing
1. ตั้ง `due_date` ของ installment เป็นพรุ่งนี้
2. เรียก function โดยตรง: `supabase functions invoke payment-reminder-cron`
3. ตรวจ `notifications` table ว่ามี record ใหม่
4. ตรวจว่าไม่ส่งซ้ำเมื่อเรียกอีกครั้ง

---

## Feature 3: Agreement PDF Export ที่สมบูรณ์

### Why
`jsPDF` และ `html2canvas` ติดตั้งอยู่แล้ว (`src/utils/pdfExport.ts` มีโครงสร้างพื้นฐาน) — ต้องการ PDF ที่มีครบทุกรายละเอียดและใช้อ้างอิงได้จริง

### Database Changes
ไม่มี

### New Files

#### `src/components/AgreementPDFTemplate.tsx`
Hidden HTML template ที่จะถูก render แล้ว capture เป็น PDF

```tsx
import { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { DebtAgreement } from '@/domains/debt/types';

interface AgreementPDFTemplateProps {
  agreement: DebtAgreement;
  lenderName: string;
  borrowerName: string;
  lenderCode: string;
  borrowerCode: string;
}

export const AgreementPDFTemplate = forwardRef<HTMLDivElement, AgreementPDFTemplateProps>(
  ({ agreement, lenderName, borrowerName, lenderCode, borrowerCode }, ref) => {
    const agreementUrl = `${window.location.origin}/debt/${agreement.id}`;

    return (
      <div
        ref={ref}
        className="bg-white text-black p-8 w-[794px] font-sans"
        style={{ fontFamily: 'Sarabun, sans-serif' }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b-2 border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold">BudOverBills</h1>
            <p className="text-sm text-gray-600">ระบบจัดการข้อตกลงทางการเงิน</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">สัญญากู้ยืมเงิน</p>
            <p className="text-xs text-gray-500">เลขที่: {agreement.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>

        {/* คู่สัญญา */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="border rounded p-3">
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">ผู้ให้กู้ (Lender)</p>
            <p className="font-semibold">{lenderName}</p>
            <p className="text-sm text-gray-600">รหัส: {lenderCode}</p>
          </div>
          <div className="border rounded p-3">
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">ผู้กู้ (Borrower)</p>
            <p className="font-semibold">{borrowerName}</p>
            <p className="text-sm text-gray-600">รหัส: {borrowerCode}</p>
          </div>
        </div>

        {/* เงื่อนไขสัญญา */}
        <div className="mb-6 border rounded p-4">
          <h2 className="font-bold mb-3 text-sm uppercase tracking-wide">เงื่อนไขสัญญา</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">เงินต้น</p>
              <p className="font-semibold">฿{Number(agreement.principal_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-gray-500">ดอกเบี้ย</p>
              <p className="font-semibold">
                {agreement.interest_type === 'none' ? 'ไม่มีดอกเบี้ย' : `${agreement.interest_rate}% (${agreement.interest_type})`}
              </p>
            </div>
            <div>
              <p className="text-gray-500">จำนวนงวด</p>
              <p className="font-semibold">{agreement.installment_count} งวด ({agreement.payment_frequency})</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">วันที่สร้างสัญญา</p>
              <p className="font-semibold">{new Date(agreement.created_at).toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
            </div>
            <div>
              <p className="text-gray-500">สถานะ</p>
              <p className="font-semibold capitalize">{agreement.status}</p>
            </div>
          </div>
        </div>

        {/* ตารางงวด */}
        <div className="mb-6">
          <h2 className="font-bold mb-2 text-sm uppercase tracking-wide">ตารางการชำระ</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left">งวดที่</th>
                <th className="border px-2 py-1 text-left">วันครบกำหนด</th>
                <th className="border px-2 py-1 text-right">ยอดชำระ</th>
                <th className="border px-2 py-1 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {agreement.installments?.map((inst, idx) => (
                <tr key={inst.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border px-2 py-1">{idx + 1}</td>
                  <td className="border px-2 py-1">{new Date(inst.due_date).toLocaleDateString('th-TH')}</td>
                  <td className="border px-2 py-1 text-right">฿{Number(inst.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td className="border px-2 py-1 text-center">
                    {inst.status === 'paid' ? '✓ ชำระแล้ว' : inst.status === 'overdue' ? '⚠ เกินกำหนด' : 'รอชำระ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* QR + Footer */}
        <div className="flex justify-between items-end mt-4 pt-4 border-t">
          <div className="text-xs text-gray-400">
            <p>สร้างโดย BudOverBills</p>
            <p>สัญญาฉบับนี้ใช้สำหรับอ้างอิงเท่านั้น</p>
            <p>พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
          </div>
          <div className="text-center">
            <QRCodeSVG value={agreementUrl} size={80} />
            <p className="text-xs text-gray-400 mt-1">สแกนดูสัญญาออนไลน์</p>
          </div>
        </div>
      </div>
    );
  }
);
AgreementPDFTemplate.displayName = 'AgreementPDFTemplate';
```

#### `src/utils/agreementPdfExport.ts`
```typescript
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportAgreementPDF(
  templateElement: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await html2canvas(templateElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  // แบ่งหน้าถ้า content ยาวเกิน
  let heightLeft = imgHeight;
  let position = 0;
  const imgData = canvas.toDataURL('image/png', 1.0);

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
```

### Modified Files

#### `src/pages/DebtDetail.tsx`
```tsx
import { useRef, useState } from 'react';
import { AgreementPDFTemplate } from '@/components/AgreementPDFTemplate';
import { exportAgreementPDF } from '@/utils/agreementPdfExport';
import { FileDown, Loader2 } from 'lucide-react';

// ใน component:
const pdfTemplateRef = useRef<HTMLDivElement>(null);
const [isExportingPDF, setIsExportingPDF] = useState(false);

async function handleExportPDF() {
  if (!pdfTemplateRef.current || !agreement) return;
  setIsExportingPDF(true);
  try {
    await exportAgreementPDF(
      pdfTemplateRef.current,
      `agreement-${agreement.id.slice(0, 8)}.pdf`
    );
  } finally {
    setIsExportingPDF(false);
  }
}

// ปุ่มใน UI:
<Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExportingPDF}>
  {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
  ดาวน์โหลด PDF
</Button>

// Hidden template (ไม่แสดงใน UI แต่ใช้ render):
<div className="fixed -left-[9999px] top-0 pointer-events-none">
  <AgreementPDFTemplate
    ref={pdfTemplateRef}
    agreement={agreement}
    lenderName={lenderProfile?.display_name ?? ''}
    borrowerName={borrowerProfile?.display_name ?? ''}
    lenderCode={lenderProfile?.user_code ?? ''}
    borrowerCode={borrowerProfile?.user_code ?? ''}
  />
</div>
```

### Testing
1. เปิด agreement detail ที่มี installments
2. กด "ดาวน์โหลด PDF"
3. ตรวจว่า PDF มีข้อมูลครบ (ชื่อ, จำนวนเงิน, ตารางงวด, QR code)
4. สแกน QR ใน PDF → ต้องนำไปสู่ `/debt/:id`

---

## Feature 4: Dispute Resolution System

### Why
ปัจจุบันเมื่อเกิดปัญหา (เช่น ผู้ให้กู้ไม่ยืนยันการจ่าย, จำนวนเงินผิด) ไม่มีช่องทางทางการในการโต้แย้ง — ต้องพึ่ง chat เท่านั้น ทำให้ไม่มี audit trail

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_create_disputes.sql

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID REFERENCES debt_agreements(id) ON DELETE CASCADE NOT NULL,
  installment_id UUID REFERENCES installments(id) ON DELETE SET NULL,
  raised_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  dispute_type TEXT NOT NULL CHECK (dispute_type IN (
    'payment_not_received',
    'wrong_amount',
    'incorrect_status',
    'other'
  )),
  description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'under_review', 'resolved', 'closed'
  )),
  resolution TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view disputes on their agreements" ON disputes
  FOR SELECT USING (
    raised_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM debt_agreements da
      WHERE da.id = agreement_id
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    )
  );

CREATE POLICY "Users can create disputes on own agreements" ON disputes
  FOR INSERT WITH CHECK (
    raised_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM debt_agreements da
      WHERE da.id = agreement_id
        AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
    )
  );

-- Trigger: อัพเดต updated_at อัตโนมัติ
CREATE OR REPLACE FUNCTION update_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_disputes_updated_at();
```

### New Files

#### `src/hooks/useDisputes.ts`
```typescript
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Dispute {
  id: string;
  agreement_id: string;
  installment_id: string | null;
  raised_by: string;
  dispute_type: 'payment_not_received' | 'wrong_amount' | 'incorrect_status' | 'other';
  description: string;
  evidence_urls: string[];
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDisputeInput {
  agreement_id: string;
  installment_id?: string;
  dispute_type: Dispute['dispute_type'];
  description: string;
  evidence_urls?: string[];
}

export function useDisputes(agreementId?: string) {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDisputes = useCallback(async () => {
    if (!agreementId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('agreement_id', agreementId)
      .order('created_at', { ascending: false });

    if (!error && data) setDisputes(data as Dispute[]);
    setIsLoading(false);
  }, [agreementId]);

  const createDispute = useCallback(async (input: CreateDisputeInput) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('disputes')
      .insert({ ...input, raised_by: user.id })
      .select()
      .single();

    if (error) {
      toast.error('ไม่สามารถแจ้งปัญหาได้');
      return null;
    }
    toast.success('ส่งเรื่องแจ้งปัญหาแล้ว');
    await fetchDisputes();
    return data;
  }, [user, fetchDisputes]);

  return { disputes, isLoading, fetchDisputes, createDispute };
}
```

#### `src/components/DisputeDialog.tsx`
```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useDisputes, type CreateDisputeInput } from '@/hooks/useDisputes';

const DISPUTE_TYPES = [
  { value: 'payment_not_received', label: '💸 ไม่ได้รับเงิน / ไม่ยืนยันการจ่าย' },
  { value: 'wrong_amount', label: '🔢 จำนวนเงินไม่ถูกต้อง' },
  { value: 'incorrect_status', label: '📋 สถานะสัญญาไม่ถูกต้อง' },
  { value: 'other', label: '❓ อื่นๆ' },
] as const;

interface DisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agreementId: string;
  installmentId?: string;
}

export function DisputeDialog({ open, onOpenChange, agreementId, installmentId }: DisputeDialogProps) {
  const { createDispute } = useDisputes(agreementId);
  const [disputeType, setDisputeType] = useState<CreateDisputeInput['dispute_type']>('payment_not_received');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!description.trim()) return;
    setIsSubmitting(true);
    await createDispute({
      agreement_id: agreementId,
      installment_id: installmentId,
      dispute_type: disputeType,
      description: description.trim(),
    });
    setIsSubmitting(false);
    setDescription('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แจ้งปัญหา / โต้แย้ง</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">ประเภทปัญหา</Label>
            <RadioGroup value={disputeType} onValueChange={(v) => setDisputeType(v as any)}>
              {DISPUTE_TYPES.map((t) => (
                <div key={t.value} className="flex items-center gap-2">
                  <RadioGroupItem value={t.value} id={t.value} />
                  <Label htmlFor={t.value}>{t.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="description">รายละเอียด</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="อธิบายปัญหาที่เกิดขึ้น..."
              rows={4}
            />
          </div>
          <Button onClick={handleSubmit} disabled={!description.trim() || isSubmitting} className="w-full">
            {isSubmitting ? 'กำลังส่ง...' : 'ส่งเรื่องแจ้งปัญหา'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

#### `src/components/DisputeStatusCard.tsx`
```tsx
import { Badge } from '@/components/ui/badge';
import type { Dispute } from '@/hooks/useDisputes';

const STATUS_CONFIG = {
  open: { label: 'รอดำเนินการ', variant: 'secondary' as const },
  under_review: { label: 'กำลังตรวจสอบ', variant: 'outline' as const },
  resolved: { label: 'แก้ไขแล้ว', variant: 'default' as const },
  closed: { label: 'ปิดแล้ว', variant: 'destructive' as const },
};

export function DisputeStatusCard({ dispute }: { dispute: Dispute }) {
  const config = STATUS_CONFIG[dispute.status];
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-start">
        <p className="text-sm font-medium">{dispute.description}</p>
        <Badge variant={config.variant}>{config.label}</Badge>
      </div>
      {dispute.resolution && (
        <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
          <span className="font-medium">การแก้ไข:</span> {dispute.resolution}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {new Date(dispute.created_at).toLocaleDateString('th-TH')}
      </p>
    </div>
  );
}
```

#### `src/pages/DisputeDetail.tsx`
```tsx
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDisputes } from '@/hooks/useDisputes';
import { DisputeStatusCard } from '@/components/DisputeStatusCard';

export default function DisputeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { disputes, fetchDisputes } = useDisputes(id);

  useEffect(() => { void fetchDisputes(); }, [fetchDisputes]);

  return (
    <div className="container max-w-lg mx-auto p-4">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> กลับ
      </Button>
      <h1 className="text-xl font-bold mb-4">รายการแจ้งปัญหา</h1>
      <div className="space-y-3">
        {disputes.map((d) => <DisputeStatusCard key={d.id} dispute={d} />)}
        {disputes.length === 0 && (
          <p className="text-center text-muted-foreground py-8">ไม่มีการแจ้งปัญหา</p>
        )}
      </div>
    </div>
  );
}
```

### Modified Files

#### `src/App.tsx`
```tsx
import DisputeDetail from '@/pages/DisputeDetail';

// เพิ่มใน ProtectedRoute:
<Route path="/dispute/:id" element={<DisputeDetail />} />
```

#### `src/pages/DebtDetail.tsx`
```tsx
import { DisputeDialog } from '@/components/DisputeDialog';
import { AlertTriangle } from 'lucide-react';

// State:
const [disputeOpen, setDisputeOpen] = useState(false);
const [disputeInstallmentId, setDisputeInstallmentId] = useState<string>();

// ใน installment actions:
<Button
  variant="ghost"
  size="sm"
  className="text-destructive"
  onClick={() => {
    setDisputeInstallmentId(inst.id);
    setDisputeOpen(true);
  }}
>
  <AlertTriangle className="w-4 h-4 mr-1" /> แจ้งปัญหา
</Button>

// Dialog:
<DisputeDialog
  open={disputeOpen}
  onOpenChange={setDisputeOpen}
  agreementId={agreement.id}
  installmentId={disputeInstallmentId}
/>
```

#### `src/hooks/useNotifications.ts`
```typescript
// เพิ่มใน notification type handling:
case 'dispute_updated':
  // navigate to /dispute/:related_id หรือแสดง toast
  break;
```

### Testing
1. เปิด agreement ในฐานะ lender หรือ borrower
2. กด "แจ้งปัญหา" บน installment
3. เลือกประเภทและกรอกรายละเอียด → submit
4. ตรวจ `disputes` table ว่ามี record ใหม่ถูกต้อง
5. ตรวจว่าอีกฝ่ายสามารถเห็น dispute ได้ (RLS policy)

---

## Dependencies ระหว่าง Features

```
Feature 1 (PromptPay) ─── ไม่มี dependency
Feature 2 (Reminders) ─── ไม่มี dependency
Feature 3 (PDF Export) ── ไม่มี dependency
Feature 4 (Disputes) ──── ถ้ามี Feature 8 (Credit Score) จะรวม dispute_rate เข้าไปใน score ได้
```

## Testing Checklist

- [ ] PromptPay QR สแกนได้ถูกต้องทั้ง iOS และ Android
- [ ] Reminder cron ไม่ส่ง notification ซ้ำในวันเดียวกัน
- [ ] PDF export ทำงานบน mobile browser
- [ ] Dispute RLS: ผู้ที่ไม่เกี่ยวข้องเข้าถึงไม่ได้
- [ ] ทุก feature ทำงานบน dark mode
