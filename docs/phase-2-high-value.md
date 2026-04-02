# Phase 2 — High Value Features

> **Priority:** สูง — เพิ่มมูลค่าให้ Premium tier  
> **เป้าหมาย:** เพิ่ม analytical insights, ทำให้ expense groups สมบูรณ์, เพิ่ม social trust

---

## Feature 5: Dashboard Analytics ขั้นสูง

### Why
`recharts` ติดตั้งอยู่แล้ว แต่ dashboard ปัจจุบันแสดงแค่ตัวเลข summary ไม่มี trend หรือ historical data — ผู้ใช้ที่มีสัญญาหลายรายการจำเป็นต้องเห็น cash flow ภาพรวม

### Database Changes
ไม่มี — aggregate จาก `installments` ที่มีอยู่แล้ว

### New Files

#### `src/pages/Analytics.tsx`
```tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDebtAgreements } from '@/hooks/useDebtAgreements';
import { useAuth } from '@/contexts/AuthContext';
import { CashFlowChart } from '@/components/home/CashFlowChart';
import { DebtProgressChart } from '@/components/home/DebtProgressChart';
import { InterestBreakdownCard } from '@/components/home/InterestBreakdownCard';
import { getUserRoleInAgreement } from '@/domains/role';
import { format, startOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';

export default function Analytics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agreements, isLoading } = useDebtAgreements();

  // สร้าง monthly cash flow data จาก paid installments
  const cashFlowData = useMemo(() => {
    if (!user) return [];
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date(),
    });

    return months.map((month) => {
      const monthKey = format(month, 'yyyy-MM');
      let income = 0;
      let expense = 0;

      for (const agreement of agreements) {
        const role = getUserRoleInAgreement(agreement, user.id);
        for (const inst of agreement.installments ?? []) {
          if (!inst.paid_at) continue;
          const instMonth = inst.paid_at.slice(0, 7);
          if (instMonth !== monthKey) continue;
          if (role === 'lender') income += Number(inst.amount);
          else expense += Number(inst.amount);
        }
      }

      return {
        month: format(month, 'MMM', { locale: th }),
        income,
        expense,
      };
    });
  }, [agreements, user]);

  // คำนวณดอกเบี้ยสะสม
  const interestSummary = useMemo(() => {
    if (!user) return { earned: 0, paid: 0 };
    let earned = 0, paid = 0;
    for (const agreement of agreements) {
      const role = getUserRoleInAgreement(agreement, user.id);
      const totalInterest = (agreement.installments ?? []).reduce(
        (sum, inst) => sum + Number(inst.interest_amount ?? 0), 0
      );
      if (role === 'lender') earned += totalInterest;
      else paid += totalInterest;
    }
    return { earned, paid };
  }, [agreements, user]);

  return (
    <div className="container max-w-lg mx-auto p-4 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">วิเคราะห์การเงิน</h1>
      </div>

      <div className="space-y-4">
        <CashFlowChart data={cashFlowData} />
        <InterestBreakdownCard earned={interestSummary.earned} paid={interestSummary.paid} />
        <DebtProgressChart agreements={agreements} userId={user?.id ?? ''} />
      </div>
    </div>
  );
}
```

#### `src/components/home/CashFlowChart.tsx`
```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CashFlowData { month: string; income: number; expense: number; }

export function CashFlowChart({ data }: { data: CashFlowData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">กระแสเงินสด 6 เดือนล่าสุด</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value: number) => [`฿${value.toLocaleString('th-TH')}`, '']}
              labelFormatter={(label) => `เดือน ${label}`}
            />
            <Legend />
            <Bar dataKey="income" fill="#22c55e" name="รับเงิน" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" name="จ่ายเงิน" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

#### `src/components/home/InterestBreakdownCard.tsx`
```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function InterestBreakdownCard({ earned, paid }: { earned: number; paid: number }) {
  const net = earned - paid;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">สรุปดอกเบี้ย</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 text-center">
        <div>
          <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">ดอกเบี้ยรับ</p>
          <p className="font-bold text-green-600">฿{earned.toLocaleString('th-TH')}</p>
        </div>
        <div>
          <TrendingDown className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">ดอกเบี้ยจ่าย</p>
          <p className="font-bold text-red-600">฿{paid.toLocaleString('th-TH')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mt-6">สุทธิ</p>
          <p className={`font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {net >= 0 ? '+' : ''}฿{net.toLocaleString('th-TH')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### `src/components/home/DebtProgressChart.tsx`
```tsx
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DebtAgreement } from '@/domains/debt/types';
import { getUserRoleInAgreement } from '@/domains/role';

export function DebtProgressChart({ agreements, userId }: { agreements: DebtAgreement[]; userId: string }) {
  const data = useMemo(() => {
    // คำนวณยอดหนี้รวมที่ยังค้างอยู่ในแต่ละเดือน
    const borrowerAgreements = agreements.filter(
      (a) => getUserRoleInAgreement(a, userId) === 'borrower'
    );

    return borrowerAgreements.reduce((acc, agreement) => {
      const remaining = (agreement.installments ?? [])
        .filter((i) => i.status === 'pending' || i.status === 'overdue')
        .reduce((sum, i) => sum + Number(i.amount), 0);
      acc.push({ name: agreement.id.slice(0, 6), remaining });
      return acc;
    }, [] as { name: string; remaining: number }[]);
  }, [agreements, userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ยอดหนี้คงเหลือแต่ละสัญญา</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => [`฿${v.toLocaleString('th-TH')}`, 'คงเหลือ']} />
            <Line type="monotone" dataKey="remaining" stroke="#8b5cf6" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

### Modified Files

#### `src/App.tsx`
```tsx
import Analytics from '@/pages/Analytics';
// เพิ่มใน ProtectedRoute:
<Route path="/analytics" element={<Analytics />} />
```

#### `src/components/BottomNav.tsx`
```tsx
import { BarChart2 } from 'lucide-react';
// เพิ่ม analytics nav item:
{ path: '/analytics', icon: BarChart2, label: 'วิเคราะห์' }
```

### Testing
1. สร้างสัญญาหลายรายการที่มี installments ที่ paid แล้ว
2. เปิด `/analytics` → ตรวจว่า bar chart แสดงถูกต้อง
3. ตรวจ tooltip format เป็น Thai baht
4. ตรวจว่า interest summary ถูกต้องตาม role (lender vs borrower)

---

## Feature 6: Expense Group Settlement (Splitwise Algorithm)

### Why
`expense_groups` และ `group_expenses` มีอยู่แล้วแต่ไม่มีการคำนวณ "ใครต้องจ่ายใคร" — ทำให้ feature กลุ่มยังไม่สมบูรณ์

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_create_group_settlements.sql

CREATE TABLE group_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES expense_groups(id) ON DELETE CASCADE NOT NULL,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  from_name TEXT,           -- สำหรับ non-registered users
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  to_name TEXT,             -- สำหรับ non-registered users
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE group_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view settlements" ON group_settlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_settlements.group_id
        AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group creator can manage settlements" ON group_settlements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM expense_groups eg
      WHERE eg.id = group_settlements.group_id
        AND eg.created_by = auth.uid()
    )
  );
```

### New Files

#### `src/utils/settlementAlgorithm.ts`
```typescript
export interface NetBalance {
  userId: string;
  name: string;
  balance: number; // บวก = คนอื่นเป็นหนี้เรา, ลบ = เราเป็นหนี้คนอื่น
}

export interface Settlement {
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  amount: number;
}

/**
 * Optimal debt simplification — minimize number of transactions
 * โดยใช้ greedy matching ระหว่าง creditors และ debtors
 */
export function calculateOptimalSettlements(balances: NetBalance[]): Settlement[] {
  // Deep copy เพื่อไม่ mutate input
  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.balance - b.balance);

  const result: Settlement[] = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const transfer = Math.min(creditors[i].balance, -debtors[j].balance);
    const rounded = Math.round(transfer * 100) / 100;

    if (rounded > 0) {
      result.push({
        from: { userId: debtors[j].userId, name: debtors[j].name },
        to: { userId: creditors[i].userId, name: creditors[i].name },
        amount: rounded,
      });
    }

    creditors[i].balance -= transfer;
    debtors[j].balance += transfer;

    if (Math.abs(creditors[i].balance) < 0.01) i++;
    if (Math.abs(debtors[j].balance) < 0.01) j++;
  }

  return result;
}

/**
 * คำนวณ net balance ของแต่ละคนจาก list ของ expenses
 */
export function calculateNetBalances(
  expenses: { paid_by: string; amount: number; split_between: string[] }[],
  members: { user_id: string; name: string }[]
): NetBalance[] {
  const balanceMap = new Map<string, number>();
  members.forEach((m) => balanceMap.set(m.user_id, 0));

  for (const expense of expenses) {
    const splitCount = expense.split_between.length;
    if (splitCount === 0) continue;
    const perPerson = expense.amount / splitCount;

    // คนที่จ่าย: ได้รับเงินคืน
    balanceMap.set(expense.paid_by, (balanceMap.get(expense.paid_by) ?? 0) + expense.amount);

    // คนที่แชร์: ต้องจ่าย
    for (const userId of expense.split_between) {
      balanceMap.set(userId, (balanceMap.get(userId) ?? 0) - perPerson);
    }
  }

  return members.map((m) => ({
    userId: m.user_id,
    name: m.name,
    balance: Math.round((balanceMap.get(m.user_id) ?? 0) * 100) / 100,
  }));
}
```

#### `src/hooks/useGroupSettlement.ts`
```typescript
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateNetBalances, calculateOptimalSettlements } from '@/utils/settlementAlgorithm';
import type { Settlement } from '@/utils/settlementAlgorithm';
import { toast } from 'sonner';

export function useGroupSettlement(groupId: string) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [savedSettlements, setSavedSettlements] = useState<any[]>([]);

  const calculateSettlements = useCallback(async () => {
    // ดึง expenses
    const { data: expenses } = await supabase
      .from('group_expenses')
      .select('paid_by, amount, split_between')
      .eq('group_id', groupId);

    // ดึง members
    const { data: members } = await supabase
      .from('group_members')
      .select('user_id, name')
      .eq('group_id', groupId);

    if (!expenses || !members) return;

    const balances = calculateNetBalances(expenses, members);
    const optimal = calculateOptimalSettlements(balances);
    setSettlements(optimal);
    return optimal;
  }, [groupId]);

  const saveSettlements = useCallback(async (items: Settlement[]) => {
    const rows = items.map((s) => ({
      group_id: groupId,
      from_user_id: s.from.userId,
      from_name: s.from.name,
      to_user_id: s.to.userId,
      to_name: s.to.name,
      amount: s.amount,
    }));

    const { error } = await supabase.from('group_settlements').insert(rows);
    if (error) { toast.error('บันทึกไม่สำเร็จ'); return; }
    toast.success('บันทึกการหักหนี้แล้ว');
  }, [groupId]);

  const markAsPaid = useCallback(async (settlementId: string) => {
    await supabase
      .from('group_settlements')
      .update({ status: 'paid', settled_at: new Date().toISOString() })
      .eq('id', settlementId);
  }, []);

  return { settlements, calculateSettlements, saveSettlements, markAsPaid };
}
```

#### `src/components/GroupSettlementView.tsx`
```tsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, QrCode } from 'lucide-react';
import { useGroupSettlement } from '@/hooks/useGroupSettlement';
import { PromptPayQR } from '@/components/PromptPayQR'; // จาก Feature 1
import type { Settlement } from '@/utils/settlementAlgorithm';

export function GroupSettlementView({ groupId }: { groupId: string }) {
  const { settlements, calculateSettlements } = useGroupSettlement(groupId);
  const [qrTarget, setQrTarget] = useState<Settlement | null>(null);

  useEffect(() => { void calculateSettlements(); }, [calculateSettlements]);

  if (settlements.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-6 text-muted-foreground">
          <p>ทุกคนเสมอกัน ไม่ต้องโอนเงิน 🎉</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">สรุปการหักหนี้ ({settlements.length} รายการ)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {settlements.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{s.from.name}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{s.to.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">฿{s.amount.toLocaleString('th-TH')}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setQrTarget(s)}
                >
                  <QrCode className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!qrTarget} onOpenChange={() => setQrTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>จ่ายให้ {qrTarget?.to.name}</DialogTitle>
          </DialogHeader>
          {/* ต้องดึง phone ของ to.userId จาก profiles */}
          <p className="text-center text-muted-foreground text-sm">
            ฿{qrTarget?.amount.toLocaleString('th-TH')}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### Testing
1. สร้าง expense group ที่มีสมาชิก 3-4 คน
2. เพิ่ม expenses หลายรายการที่คนละคนจ่าย
3. เปิด settlement view → ตรวจว่า transactions ถูกต้องและ minimize แล้ว
4. ทดสอบ edge case: คนที่จ่ายตรงกับส่วนแบ่ง → balance = 0 ไม่ควรมี transaction

---

## Feature 7: Recurring Agreements (Template)

### Why
ผู้ใช้ที่แชร์ค่าใช้จ่ายรายเดือนกัน (Netflix, ค่าเช่า, ค่า utilities) ต้องสร้างสัญญาใหม่ทุกเดือน — template จะลด friction นี้

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_create_agreement_templates.sql

CREATE TABLE agreement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  borrower_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  principal_amount NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
  interest_type TEXT DEFAULT 'none' CHECK (interest_type IN ('none', 'flat', 'effective')),
  interest_rate NUMERIC(5,2) DEFAULT 0,
  installment_count INTEGER DEFAULT 1 CHECK (installment_count > 0),
  payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN ('daily', 'weekly', 'monthly')),
  auto_create BOOLEAN DEFAULT FALSE,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('weekly', 'monthly', 'quarterly')),
  next_create_at DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agreement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access" ON agreement_templates
  FOR ALL USING (creator_id = auth.uid());

-- Link agreements to templates (optional)
ALTER TABLE debt_agreements ADD COLUMN template_id UUID REFERENCES agreement_templates(id) ON DELETE SET NULL;
```

### New Files

#### `src/hooks/useAgreementTemplates.ts`
```typescript
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AgreementTemplate {
  id: string;
  name: string;
  borrower_id: string | null;
  principal_amount: number;
  interest_type: string;
  interest_rate: number;
  installment_count: number;
  payment_frequency: string;
  auto_create: boolean;
  recurrence_interval: string | null;
  next_create_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateTemplateInput {
  name: string;
  borrower_id?: string;
  principal_amount: number;
  interest_type: string;
  interest_rate: number;
  installment_count: number;
  payment_frequency: string;
  auto_create?: boolean;
  recurrence_interval?: string;
}

export function useAgreementTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('agreement_templates')
      .select('*')
      .eq('creator_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data) setTemplates(data as AgreementTemplate[]);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { void fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = useCallback(async (input: CreateTemplateInput) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('agreement_templates')
      .insert({ ...input, creator_id: user.id })
      .select()
      .single();

    if (error) { toast.error('สร้าง template ไม่สำเร็จ'); return null; }
    toast.success(`บันทึก template "${input.name}" แล้ว`);
    await fetchTemplates();
    return data;
  }, [user, fetchTemplates]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    await supabase
      .from('agreement_templates')
      .update({ is_active: false })
      .eq('id', templateId);
    toast.success('ลบ template แล้ว');
    await fetchTemplates();
  }, [fetchTemplates]);

  return { templates, isLoading, fetchTemplates, createTemplate, deleteTemplate };
}
```

#### `src/components/AgreementTemplateCard.tsx`
```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AgreementTemplate } from '@/hooks/useAgreementTemplates';

interface AgreementTemplateCardProps {
  template: AgreementTemplate;
  borrowerName?: string;
  onDelete: (id: string) => void;
}

export function AgreementTemplateCard({ template, borrowerName, onDelete }: AgreementTemplateCardProps) {
  const navigate = useNavigate();

  function handleUseTemplate() {
    // Navigate to /create with pre-filled state
    navigate('/create', {
      state: {
        template: {
          principal_amount: template.principal_amount,
          borrower_id: template.borrower_id,
          interest_type: template.interest_type,
          interest_rate: template.interest_rate,
          installment_count: template.installment_count,
          payment_frequency: template.payment_frequency,
        }
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3 px-4">
        <div>
          <p className="font-medium text-sm">{template.name}</p>
          <p className="text-xs text-muted-foreground">
            ฿{Number(template.principal_amount).toLocaleString('th-TH')} • {template.installment_count} งวด
            {borrowerName && ` • ${borrowerName}`}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={handleUseTemplate}>
            <Copy className="w-3 h-3 mr-1" /> ใช้
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => onDelete(template.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### `supabase/functions/create-recurring-agreements/index.ts`
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (_req) => {
  const today = new Date().toISOString().split('T')[0];

  const { data: templates } = await supabase
    .from('agreement_templates')
    .select('*')
    .eq('auto_create', true)
    .eq('is_active', true)
    .lte('next_create_at', today);

  let created = 0;
  for (const template of templates ?? []) {
    // สร้าง agreement จาก template
    const { error } = await supabase.from('debt_agreements').insert({
      lender_id: template.creator_id,
      borrower_id: template.borrower_id,
      principal_amount: template.principal_amount,
      interest_type: template.interest_type,
      interest_rate: template.interest_rate,
      installment_count: template.installment_count,
      payment_frequency: template.payment_frequency,
      template_id: template.id,
      status: 'pending_confirmation',
    });

    if (!error) {
      // อัพเดต next_create_at
      const nextDate = new Date(today);
      if (template.recurrence_interval === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (template.recurrence_interval === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (template.recurrence_interval === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);

      await supabase
        .from('agreement_templates')
        .update({ next_create_at: nextDate.toISOString().split('T')[0] })
        .eq('id', template.id);

      created++;
    }
  }

  return new Response(JSON.stringify({ created }));
});
```

### Modified Files

#### `src/pages/CreateAgreement.tsx`
```tsx
import { useLocation } from 'react-router-dom';
import { useAgreementTemplates } from '@/hooks/useAgreementTemplates';

// รับ pre-filled data จาก template:
const location = useLocation();
const templateData = location.state?.template;

// ใช้ templateData เป็น defaultValues ของ form
const form = useForm({
  defaultValues: templateData ?? { /* existing defaults */ }
});

// เพิ่ม checkbox "บันทึกเป็น template":
const [saveAsTemplate, setSaveAsTemplate] = useState(false);
const [templateName, setTemplateName] = useState('');

// หลัง submit สำเร็จ ถ้า saveAsTemplate:
if (saveAsTemplate && templateName) {
  await createTemplate({ name: templateName, ...formValues });
}
```

### Testing
1. สร้างสัญญาแล้วเลือก "บันทึกเป็น template"
2. ตรวจว่า template ปรากฏในหน้า dashboard
3. กด "ใช้ template" → ตรวจว่า form pre-filled ถูกต้อง
4. ทดสอบ recurring cron: ตั้ง `next_create_at` เป็นวันนี้ → เรียก function → ตรวจว่าสร้าง agreement ใหม่

---

## Feature 8: In-App Credit Score

### Why
ก่อนให้ใครยืมเงิน ผู้ใช้อยากรู้ว่าคนนั้น reliable แค่ไหน — credit score ภายในแอปที่คำนวณจากพฤติกรรมจริงจะช่วยสร้าง trust

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_create_credit_scores.sql

CREATE TABLE credit_scores (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 500 CHECK (score BETWEEN 300 AND 850),
  on_time_rate NUMERIC(5,2) DEFAULT 100.0,
  completion_rate NUMERIC(5,2) DEFAULT 100.0,
  reschedule_rate NUMERIC(5,2) DEFAULT 0.0,
  dispute_rate NUMERIC(5,2) DEFAULT 0.0,
  total_agreements INTEGER DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_scores ENABLE ROW LEVEL SECURITY;

-- ทุกคนเห็นของทุกคนได้ (social trust signal)
CREATE POLICY "Public read" ON credit_scores FOR SELECT USING (true);
-- เฉพาะ system (service role) เท่านั้นที่เขียนได้
```

### New Files

#### `src/utils/creditScoreCalculator.ts`
```typescript
export interface CreditData {
  onTimeRate: number;       // 0-100%
  completionRate: number;   // 0-100%
  rescheduleRate: number;   // 0-100%
  disputeRate: number;      // 0-100%
  totalAgreements: number;
}

export function calculateCreditScore(data: CreditData): number {
  if (data.totalAgreements === 0) return 500; // ยังไม่มีประวัติ

  const base = 500;
  // จ่ายตรงเวลา: max +200 points
  const onTimeBonus = (data.onTimeRate / 100) * 200;
  // ปิดสัญญาครบ: max +100 points
  const completionBonus = (data.completionRate / 100) * 100;
  // ขอเลื่อน: max -150 points
  const reschedulePenalty = (data.rescheduleRate / 100) * 150;
  // มี dispute: max -200 points
  const disputePenalty = (data.disputeRate / 100) * 200;

  const raw = base + onTimeBonus + completionBonus - reschedulePenalty - disputePenalty;
  return Math.min(850, Math.max(300, Math.round(raw)));
}

export function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 750) return { label: 'ดีเยี่ยม', color: 'text-green-500' };
  if (score >= 650) return { label: 'ดี', color: 'text-blue-500' };
  if (score >= 550) return { label: 'ปานกลาง', color: 'text-yellow-500' };
  if (score >= 450) return { label: 'ต่ำกว่าเกณฑ์', color: 'text-orange-500' };
  return { label: 'ต้องปรับปรุง', color: 'text-red-500' };
}
```

#### `src/hooks/useCreditScore.ts`
```typescript
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CreditScore {
  user_id: string;
  score: number;
  on_time_rate: number;
  completion_rate: number;
  reschedule_rate: number;
  dispute_rate: number;
  total_agreements: number;
  calculated_at: string;
}

export function useCreditScore(userId?: string) {
  const [creditScore, setCreditScore] = useState<CreditScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCreditScore = useCallback(async (targetUserId: string) => {
    setIsLoading(true);
    const { data } = await supabase
      .from('credit_scores')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    setCreditScore(data as CreditScore | null);
    setIsLoading(false);
  }, []);

  return { creditScore, isLoading, fetchCreditScore };
}
```

#### `src/components/CreditScoreGauge.tsx`
```tsx
import { getScoreLabel } from '@/utils/creditScoreCalculator';

interface CreditScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function CreditScoreGauge({ score, size = 'md' }: CreditScoreGaugeProps) {
  const { label, color } = getScoreLabel(score);
  const percentage = ((score - 300) / 550) * 100; // normalize 300-850 to 0-100%

  const dimensions = { sm: 80, md: 120, lg: 160 };
  const dim = dimensions[size];
  const radius = (dim / 2) * 0.75;
  const circumference = Math.PI * radius; // half circle
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={dim} height={dim / 2 + 10} viewBox={`0 0 ${dim} ${dim / 2 + 10}`}>
        {/* Background arc */}
        <path
          d={`M ${dim * 0.1},${dim / 2} A ${radius},${radius} 0 0,1 ${dim * 0.9},${dim / 2}`}
          fill="none" stroke="currentColor" strokeWidth={dim * 0.08}
          className="text-muted stroke-current opacity-20"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M ${dim * 0.1},${dim / 2} A ${radius},${radius} 0 0,1 ${dim * 0.9},${dim / 2}`}
          fill="none" stroke="currentColor" strokeWidth={dim * 0.08}
          className={color.replace('text-', 'stroke-') + ' stroke-current'}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="text-center -mt-2">
        <p className={`font-bold ${size === 'lg' ? 'text-3xl' : size === 'md' ? 'text-2xl' : 'text-lg'} ${color}`}>
          {score}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
```

#### `src/components/CreditScoreBadge.tsx`
```tsx
import { Badge } from '@/components/ui/badge';
import { getScoreLabel } from '@/utils/creditScoreCalculator';

export function CreditScoreBadge({ score }: { score: number }) {
  const { label } = getScoreLabel(score);
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <span className="font-bold">{score}</span>
      <span className="text-muted-foreground">{label}</span>
    </Badge>
  );
}
```

#### `supabase/functions/recalculate-credit-scores/index.ts`
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (_req) => {
  // ดึง users ที่มี agreements
  const { data: users } = await supabase
    .from('profiles')
    .select('id');

  let updated = 0;
  for (const user of users ?? []) {
    // คำนวณ metrics
    const { data: installments } = await supabase
      .from('installments')
      .select('status, due_date, paid_at, debt_agreements!inner(borrower_id)')
      .eq('debt_agreements.borrower_id', user.id);

    const total = installments?.length ?? 0;
    if (total === 0) continue;

    const paid = installments?.filter((i) => i.status === 'paid') ?? [];
    const onTime = paid.filter((i) => i.paid_at && i.paid_at <= i.due_date + 'T23:59:59Z');

    const { data: agreements } = await supabase
      .from('debt_agreements')
      .select('status')
      .eq('borrower_id', user.id);

    const totalAgreements = agreements?.length ?? 0;
    const completed = agreements?.filter((a) => a.status === 'completed').length ?? 0;

    const score = calculateFromMetrics({
      onTimeRate: total > 0 ? (onTime.length / total) * 100 : 100,
      completionRate: totalAgreements > 0 ? (completed / totalAgreements) * 100 : 100,
      rescheduleRate: 0, // TODO: คำนวณจาก reschedule_requests
      disputeRate: 0,    // TODO: คำนวณจาก disputes
      totalAgreements,
    });

    await supabase.from('credit_scores').upsert({
      user_id: user.id,
      score,
      on_time_rate: total > 0 ? (onTime.length / total) * 100 : 100,
      completion_rate: totalAgreements > 0 ? (completed / totalAgreements) * 100 : 100,
      total_agreements: totalAgreements,
      calculated_at: new Date().toISOString(),
    });

    updated++;
  }

  return new Response(JSON.stringify({ updated }));
});

function calculateFromMetrics(data: any): number {
  const base = 500;
  const onTimeBonus = (data.onTimeRate / 100) * 200;
  const completionBonus = (data.completionRate / 100) * 100;
  const reschedulePenalty = (data.rescheduleRate / 100) * 150;
  const disputePenalty = (data.disputeRate / 100) * 200;
  return Math.min(850, Math.max(300, Math.round(base + onTimeBonus + completionBonus - reschedulePenalty - disputePenalty)));
}
```

**Cron schedule:** `0 2 * * 0` (ทุกวันอาทิตย์ 09:00 Bangkok)

### Modified Files

#### `src/pages/Profile.tsx`
```tsx
import { CreditScoreGauge } from '@/components/CreditScoreGauge';
import { useCreditScore } from '@/hooks/useCreditScore';

// เพิ่ม credit score section ใต้ profile info:
const { creditScore, fetchCreditScore } = useCreditScore();
useEffect(() => { if (user) void fetchCreditScore(user.id); }, [user]);

// ใน UI:
{creditScore && (
  <div className="text-center py-4">
    <p className="text-sm text-muted-foreground mb-2">คะแนนความน่าเชื่อถือ</p>
    <CreditScoreGauge score={creditScore.score} size="lg" />
    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
      <p>จ่ายตรงเวลา {creditScore.on_time_rate.toFixed(0)}%</p>
      <p>ปิดสัญญาครบ {creditScore.completion_rate.toFixed(0)}%</p>
    </div>
  </div>
)}
```

#### `src/pages/CreateAgreement.tsx`
```tsx
// แสดง credit score ของ borrower ที่เลือก
import { CreditScoreBadge } from '@/components/CreditScoreBadge';
import { useCreditScore } from '@/hooks/useCreditScore';

// ข้างๆ ชื่อ borrower ที่เลือก:
{selectedBorrowerCreditScore && (
  <CreditScoreBadge score={selectedBorrowerCreditScore.score} />
)}
```

### Testing
1. เรียก `recalculate-credit-scores` function
2. ตรวจ `credit_scores` table
3. เปิด profile → ตรวจว่า gauge แสดงถูกต้อง
4. ตรวจว่า non-authenticated user เห็น credit score ของคนอื่นได้ (public read policy)

---

## Dependencies ระหว่าง Features

```
Feature 5 (Analytics) ──── ต้องมี agreements + paid installments ถึงจะมีข้อมูล
Feature 6 (Settlement) ─── ต้องมี expense groups + expenses
Feature 7 (Templates) ──── ต้องมี CreateAgreement flow ที่ stable
Feature 8 (Credit Score) ── จะดีขึ้นถ้ามี Feature 4 (Disputes) ด้วย (dispute_rate)
Feature 6 (Settlement) ─── ใช้ PromptPayQR จาก Feature 1 ได้เลย
```

## Testing Checklist

- [ ] Analytics charts แสดงถูกต้องเมื่อไม่มี data (empty state)
- [ ] Settlement algorithm: ทดสอบกับ 4+ คน verify ว่า minimize transactions
- [ ] Template: form pre-fill ถูกต้อง 100%
- [ ] Credit score cron ไม่ crash เมื่อ user ไม่มี agreements
- [ ] Credit score visible ใน public profile (RLS ถูกต้อง)
