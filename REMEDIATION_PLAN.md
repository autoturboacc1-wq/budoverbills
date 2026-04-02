# Bud Over Bills (BOB) — Remediation Plan

> วันที่สร้าง: 2 เมษายน 2026
> สถานะ: Draft
> ผู้จัดทำ: Code Review Automated Analysis

---

## สารบัญ

- [1. ภาพรวมปัญหา](#1-ภาพรวมปัญหา)
- [2. Phase 0 — Critical Security Fixes](#2-phase-0--critical-security-fixes)
- [3. Phase 1 — Financial Integrity & Type Safety](#3-phase-1--financial-integrity--type-safety)
- [4. Phase 2 — Architecture Refactoring](#4-phase-2--architecture-refactoring)
- [5. Phase 3 — Observability & Quality](#5-phase-3--observability--quality)
- [6. Phase 4 — UX & Performance](#6-phase-4--ux--performance)
- [7. Dependency & Risk Matrix](#7-dependency--risk-matrix)
- [8. Definition of Done](#8-definition-of-done)

---

## 1. ภาพรวมปัญหา

| หมวด | จำนวนปัญหา | ความรุนแรงสูงสุด |
|------|------------|-----------------|
| Security | 4 | CRITICAL |
| Financial Calculation | 3 | CRITICAL |
| Testing | 1 | CRITICAL |
| TypeScript / Type Safety | 2 | HIGH |
| Architecture / God Components | 6 | HIGH |
| Error Handling | 1 | HIGH |
| Code Duplication | 3 | HIGH |
| i18n | 1 | MEDIUM |
| Accessibility | 4 | MEDIUM |
| Performance | 4 | MEDIUM |
| Folder Structure | 1 | LOW |

---

## 2. Phase 0 — Critical Security Fixes

> ต้องทำก่อนสิ่งอื่นใด เป็นความเสี่ยงที่กระทบ user โดยตรง

### 2.1 แก้ Storage Policy สำหรับ Payment Slips

**ปัญหา:** user ที่ login แล้วสามารถดู payment slips ของคนอื่นได้ทั้งหมด เพราะ policy เช็คแค่ `auth.uid() IS NOT NULL`

**ไฟล์ที่เกี่ยวข้อง:**
- `supabase/migrations/20251231154105_*.sql`

**แนวทางแก้ไข:**

1. สร้าง migration ใหม่ใน `supabase/migrations/`
2. Drop policy เดิม แล้วสร้างใหม่ที่เช็คว่า user เป็นคู่สัญญา:

```sql
-- ลบ policy เดิม
DROP POLICY IF EXISTS "Parties can view payment slips" ON storage.objects;

-- สร้าง policy ใหม่ที่เช็คคู่สัญญา
-- ไฟล์ payment slip ควรเก็บในรูปแบบ: payment-slips/{agreement_id}/{filename}
CREATE POLICY "Parties can view payment slips"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-slips'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.debt_agreements da
    WHERE da.id::text = (storage.foldername(name))[1]
    AND (da.lender_id = auth.uid() OR da.borrower_id = auth.uid())
  )
);
```

3. ตรวจสอบว่า path ที่ upload slip ใช้ format `{agreement_id}/{filename}` จริง
4. ถ้า path format ไม่ตรง ให้แก้ upload logic ใน client ด้วย

**ตรวจสอบ:**
- [ ] Login เป็น User A ที่ไม่มีส่วนเกี่ยวข้องกับสัญญา → ไม่สามารถดู slip ของสัญญาอื่นได้
- [ ] Login เป็น lender/borrower ของสัญญา → ดู slip ของสัญญาตัวเองได้

---

### 2.2 เพิ่ม Route Guards สำหรับ Protected Pages

**ปัญหา:** ทุกหน้าเข้าถึงได้โดยไม่ต้อง login รวมถึง `/admin`, `/settings`, `/profile`

**ไฟล์ที่เกี่ยวข้อง:**
- `src/App.tsx`

**แนวทางแก้ไข:**

1. สร้าง component `src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  requireAdmin?: boolean;
}

export function ProtectedRoute({ requireAdmin }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/auth" replace />;

  if (requireAdmin) {
    const adminVerified = sessionStorage.getItem("admin_verified");
    if (adminVerified !== user.id) {
      return <Navigate to="/admin/login" replace />;
    }
  }

  return <Outlet />;
}
```

2. แก้ `App.tsx` ให้ wrap routes:

```tsx
{/* Public routes */}
<Route path="/auth" element={<Auth />} />
<Route path="/admin/login" element={<AdminLogin />} />

{/* Protected routes */}
<Route element={<ProtectedRoute />}>
  <Route path="/" element={<Index />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="/profile" element={<Profile />} />
  {/* ... other protected routes */}
</Route>

{/* Admin routes */}
<Route element={<ProtectedRoute requireAdmin />}>
  <Route path="/admin" element={<AdminHub />} />
  <Route path="/admin/security" element={<AdminSecurity />} />
</Route>
```

3. ลบ auth check ที่ซ้ำซ้อนออกจากแต่ละ page component (optional, ทำทีหลังได้)

**ตรวจสอบ:**
- [ ] เข้า `/` โดยไม่ login → redirect ไป `/auth`
- [ ] เข้า `/admin` โดยไม่ผ่าน admin login → redirect ไป `/admin/login`
- [ ] Login แล้วเข้าหน้าต่างๆ ได้ปกติ

---

### 2.3 เพิ่ม Input Validation ใน Edge Functions

**ปัญหา:** Edge function รับ input โดยไม่ validate type/format

**ไฟล์ที่เกี่ยวข้อง:**
- `supabase/functions/send-chat-push-notification/index.ts`
- `supabase/functions/downgrade-expired-trials/index.ts`

**แนวทางแก้ไข:**

1. เพิ่ม Zod (หรือ validation function) ใน Edge Functions:

```typescript
// supabase/functions/_shared/validation.ts
export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
```

2. ใช้ validate ก่อน process:

```typescript
// send-chat-push-notification/index.ts
const body = await req.json();
if (!isValidUUID(body.recipientId)) {
  return new Response(JSON.stringify({ error: "Invalid recipientId" }), { status: 400 });
}
if (typeof body.senderName !== "string" || body.senderName.length > 255) {
  return new Response(JSON.stringify({ error: "Invalid senderName" }), { status: 400 });
}
```

**ตรวจสอบ:**
- [ ] ส่ง recipientId ที่ไม่ใช่ UUID → ได้ 400
- [ ] ส่ง senderName ยาวเกิน → ได้ 400
- [ ] ส่งข้อมูลถูกต้อง → ทำงานปกติ

---

### 2.4 ตรวจสอบ Feed Images Policy

**ปัญหา:** feed images เปิด public ทั้งหมด (ไม่ต้อง login ก็ดูได้)

**ไฟล์ที่เกี่ยวข้อง:**
- `supabase/migrations/20251231165211_*.sql`

**แนวทางแก้ไข:**
- ถ้า feed เป็น public feature → ยอมรับได้ แต่ต้องมั่นใจว่าไม่มีข้อมูลส่วนตัว (สลิป, เอกสาร) ถูกเก็บใน bucket นี้
- ถ้า feed เป็น private → เปลี่ยน policy ให้เช็ค `auth.uid() IS NOT NULL`
- เพิ่ม validation ฝั่ง upload ว่าไฟล์ที่อัปโหลดเป็นรูปภาพจริง (check MIME type)

**ตรวจสอบ:**
- [ ] Audit ว่ามีไฟล์อะไรอยู่ใน feed-images bucket
- [ ] ตัดสินใจว่า feed ควรเป็น public หรือ private

---

## 3. Phase 1 — Financial Integrity & Type Safety

> ปัญหาที่อาจทำให้การคำนวณเงินผิดพลาด

### 3.1 เพิ่ม Unit Tests สำหรับ Domain Logic การเงิน

**ปัญหา:** ไม่มี test เลย — 0 จาก 163 ไฟล์

**แนวทางแก้ไข:**

1. ติดตั้ง Vitest:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

2. เพิ่ม config ใน `vite.config.ts`:

```typescript
export default defineConfig({
  // ... existing config
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
```

3. เขียน test สำหรับไฟล์เหล่านี้ (เรียงตามความสำคัญ):

| ไฟล์ | Test Cases ที่ต้องมี |
|------|---------------------|
| `src/domains/debt/calculateRemainingAmount.ts` | empty array, all paid, all unpaid, mixed, undefined input |
| `src/domains/debt/calculatePaidAmount.ts` | ยอดที่จ่ายแล้วถูกต้อง |
| `src/domains/debt/calculateInterestPaid.ts` | ดอกเบี้ยที่จ่ายแล้วถูกต้อง |
| `src/domains/debt/getNextInstallment.ts` | หางวดถัดไปจาก list ที่มี status ต่างๆ |
| `src/domains/debt/isInstallmentOverdue.ts` | เช็ค overdue กับวันที่ต่างๆ |
| `src/domains/debt/getAgreementDisplayStatus.ts` | ทุก status combination |
| `src/domains/role/getUserRoleInAgreement.ts` | lender, borrower, unknown user |

4. ตัวอย่าง test:

```typescript
// src/domains/debt/__tests__/calculateRemainingAmount.test.ts
import { describe, it, expect } from "vitest";
import { calculateRemainingAmount } from "../calculateRemainingAmount";

describe("calculateRemainingAmount", () => {
  it("returns 0 for empty installments", () => {
    expect(calculateRemainingAmount([])).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(calculateRemainingAmount(undefined)).toBe(0);
  });

  it("returns sum of unpaid installments", () => {
    const installments = [
      { amount: 1000, status: "paid" },
      { amount: 1000, status: "pending" },
      { amount: 1000, status: "overdue" },
    ];
    expect(calculateRemainingAmount(installments)).toBe(2000);
  });

  it("handles floating point correctly", () => {
    const installments = [
      { amount: 333.33, status: "pending" },
      { amount: 333.33, status: "pending" },
      { amount: 333.34, status: "pending" },
    ];
    expect(calculateRemainingAmount(installments)).toBeCloseTo(1000, 2);
  });
});
```

5. เพิ่ม script ใน `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

**เป้าหมาย:** Domain logic ต้องมี test coverage 100%

**ตรวจสอบ:**
- [ ] `npm run test:run` ผ่านทั้งหมด
- [ ] Coverage ของ `src/domains/` ≥ 95%

---

### 3.2 แก้ Floating Point สำหรับการคำนวณเงิน

**ปัญหา:** ใช้ `Number()` ตรงๆ กับค่าเงิน → precision loss

**ไฟล์ที่เกี่ยวข้อง:**
- `src/hooks/useDebtAgreements.ts` (lines 135-146)
- `src/hooks/useExtraPayment.ts` (lines 40-100)
- `src/hooks/useRescheduleRequests.ts`
- `src/domains/debt/calculateRemainingAmount.ts`

**แนวทางแก้ไข:**

1. สร้าง utility สำหรับค่าเงิน:

```typescript
// src/utils/money.ts

/**
 * แปลงค่าเป็นตัวเลขทางการเงิน (ทศนิยม 2 ตำแหน่ง)
 * throw error ถ้าค่าไม่ valid
 */
export function toMoney(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid monetary value: ${value}`);
  }
  if (num < 0) {
    throw new Error(`Negative monetary value: ${value}`);
  }
  return Math.round(num * 100) / 100;
}

/**
 * บวกค่าเงินหลายจำนวนอย่างปลอดภัย
 */
export function sumMoney(...values: number[]): number {
  const sum = values.reduce((acc, val) => acc + Math.round(val * 100), 0);
  return sum / 100;
}

/**
 * เปรียบเทียบค่าเงิน (tolerance 1 สตางค์)
 */
export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}
```

2. แทนที่ `Number()` ด้วย `toMoney()` ในทุกจุดที่แปลงค่าเงิน:

```typescript
// useDebtAgreements.ts — before
principal_amount: Number(agreement.principal_amount),

// useDebtAgreements.ts — after
principal_amount: toMoney(agreement.principal_amount),
```

3. แก้ rounding tolerance:

```typescript
// useDebtAgreements.ts — before
const allowedDifference = input.installments.length; // 1 baht per installment

// useDebtAgreements.ts — after
const allowedDifference = 0.01; // 1 สตางค์
```

4. เขียน test สำหรับ `money.ts`:

```typescript
describe("toMoney", () => {
  it("rounds to 2 decimal places", () => {
    expect(toMoney(10.005)).toBe(10.01);
  });
  it("throws on NaN", () => {
    expect(() => toMoney("abc")).toThrow();
  });
  it("throws on negative", () => {
    expect(() => toMoney(-100)).toThrow();
  });
});

describe("sumMoney", () => {
  it("handles floating point correctly", () => {
    expect(sumMoney(0.1, 0.2)).toBe(0.3); // ไม่ใช่ 0.30000000000000004
  });
});
```

**ตรวจสอบ:**
- [ ] `toMoney()` ใช้แทน `Number()` ในทุกจุดที่เกี่ยวกับเงิน
- [ ] Test ผ่านทั้งหมด
- [ ] สร้างสัญญา 12 งวด แล้วยอดรวมตรง (ไม่คลาดเคลื่อน)

---

### 3.3 เปิด TypeScript Strict Mode

**ปัญหา:** `noImplicitAny: false` และ `strictNullChecks: false` ทำให้ compiler ไม่จับ bug

**ไฟล์ที่เกี่ยวข้อง:**
- `tsconfig.json`
- ไฟล์ที่มี `any` 69 จุด (22 ไฟล์)

**แนวทางแก้ไข (ทำเป็นขั้นตอน):**

**ขั้นที่ 1 — เปิด `strictNullChecks` ก่อน:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

- Build แล้วแก้ error ทั้งหมด
- ส่วนใหญ่จะเป็น `X is possibly undefined` → เพิ่ม null check
- ไฟล์ที่จะ error เยอะที่สุด:
  - `src/hooks/useDebtAgreements.ts`
  - `src/pages/DebtDetail.tsx`
  - `src/pages/CreateAgreement.tsx`
  - `src/components/PaymentCalendar.tsx`

**ขั้นที่ 2 — เปิด `noImplicitAny`:**

```json
{
  "compilerOptions": {
    "noImplicitAny": true
  }
}
```

- แก้ `any` ทั้ง 69 จุด โดยเรียงตามไฟล์:

| ไฟล์ | จำนวน `any` | วิธีแก้ |
|------|------------|--------|
| `src/hooks/useDebtAgreements.ts` | 11 | สร้าง type สำหรับ Supabase response |
| `src/pages/DebtDetail.tsx` | 10 | ใช้ type จาก Supabase generated types |
| `src/components/PaymentCalendar.tsx` | 7 | กำหนด type ให้ calendar data |
| `src/hooks/useFriendRequests.ts` | 5 | type error เป็น `Error` แทน `any` |
| `src/hooks/useExtraPayment.ts` | 4 | กำหนด installment type |
| อื่นๆ (17 ไฟล์) | 32 | แก้ทีละไฟล์ |

ตัวอย่างการแก้:

```typescript
// before
} catch (error: any) {
  toast.error('Error: ' + error.message);
}

// after
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  toast.error('Error: ' + message);
}
```

```typescript
// before
installments: (agreement.installments || []).map((inst: any) => ({

// after — ใช้ type จาก Supabase
import { Tables } from "@/integrations/supabase/types";
type Installment = Tables<"installments">;

installments: (agreement.installments || []).map((inst: Installment) => ({
```

**ขั้นที่ 3 — เปิด `strict: true` เต็มรูปแบบ:**

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

**ตรวจสอบ:**
- [ ] `npm run build` ไม่มี TypeScript error
- [ ] ค้นหา `any` ใน codebase → 0 ผลลัพธ์ (ยกเว้น type definitions)

---

## 4. Phase 2 — Architecture Refactoring

> ปรับโครงสร้างโค้ดให้ maintain ได้ง่ายขึ้น

### 4.1 แยก God Components

**เป้าหมาย:** ไม่มี component/page เกิน 300 บรรทัด

#### 4.1.1 แยก CreateAgreement.tsx (1,282 บรรทัด)

```
src/pages/CreateAgreement/
  ├── index.tsx                    — Page wrapper + routing (≤100 lines)
  ├── CreateAgreementForm.tsx      — Form container + step navigation (≤150 lines)
  ├── steps/
  │   ├── SelectPartnerStep.tsx    — เลือกคู่สัญญา
  │   ├── LoanDetailsStep.tsx      — จำนวนเงิน + ดอกเบี้ย
  │   ├── InstallmentSetupStep.tsx — ตั้งค่างวดชำระ
  │   ├── BankAccountStep.tsx      — เลือกบัญชีธนาคาร
  │   └── ConfirmStep.tsx          — สรุป + ยืนยัน
  ├── hooks/
  │   └── useCreateAgreement.ts    — Business logic + API calls (≤200 lines)
  └── types.ts                     — Form types + validation schema
```

**ขั้นตอน:**
1. สร้างโครงสร้างโฟลเดอร์
2. ย้าย form state + validation ไป `useCreateAgreement.ts`
3. ย้าย interest calculation ไป `src/domains/debt/calculateInterest.ts`
4. แยก UI ของแต่ละ step ออกเป็น component
5. ทดสอบ flow ทั้งหมด

#### 4.1.2 แยก PaymentCalendar.tsx (1,246 บรรทัด)

```
src/components/payments/
  ├── PaymentCalendar/
  │   ├── index.tsx                — Calendar container (≤150 lines)
  │   ├── CalendarGrid.tsx         — ตาราง calendar
  │   ├── CalendarDay.tsx          — แต่ละวัน
  │   ├── InstallmentList.tsx      — รายการงวดในวันที่เลือก
  │   ├── SlipUploader.tsx         — อัปโหลดสลิป
  │   └── hooks/
  │       ├── useCalendarData.ts   — Data fetching + transformation
  │       └── useSlipUpload.ts     — Upload logic
```

#### 4.1.3 แยก PaymentDialog.tsx (996 บรรทัด)

```
src/components/payments/
  ├── PaymentDialog/
  │   ├── index.tsx                — Dialog wrapper (≤100 lines)
  │   ├── PaymentForm.tsx          — ฟอร์มชำระเงิน
  │   ├── SlipPreview.tsx          — แสดงตัวอย่างสลิป
  │   ├── PaymentHistory.tsx       — ประวัติการชำระ
  │   ├── VerificationStatus.tsx   — สถานะการตรวจสอบ
  │   └── hooks/
  │       └── usePaymentSubmit.ts  — Payment submission logic
```

#### 4.1.4 แยก DebtDetail.tsx (967 บรรทัด)

```
src/pages/DebtDetail/
  ├── index.tsx                    — Page wrapper (≤100 lines)
  ├── AgreementSummary.tsx         — สรุปสัญญา
  ├── InstallmentTimeline.tsx      — Timeline งวดชำระ
  ├── AgreementActions.tsx         — ปุ่ม actions
  ├── PartnerInfo.tsx              — ข้อมูลคู่สัญญา
  └── hooks/
      └── useDebtDetail.ts         — Data fetching + state
```

**ตรวจสอบ (ทุก component ที่แยก):**
- [ ] ทุกไฟล์ ≤ 300 บรรทัด
- [ ] ไม่มี prop drilling เกิน 2 ระดับ
- [ ] UI ทำงานเหมือนเดิมทุกประการ
- [ ] ไม่มี regression จาก manual testing

---

### 4.2 แยก God Hooks

#### 4.2.1 แยก useDebtAgreements.ts (417 บรรทัด)

```
src/hooks/agreements/
  ├── useAgreements.ts           — Fetch agreements (≤100 lines)
  ├── useCreateAgreement.ts      — Create agreement (≤100 lines)
  ├── useUpdateAgreement.ts      — Update status (≤80 lines)
  ├── useInstallments.ts         — Installment CRUD (≤100 lines)
  └── useAgreementSummary.ts     — Financial summary calculations (≤80 lines)
```

#### 4.2.2 แยก useExtraPayment.ts (316 บรรทัด)

```
src/hooks/payments/
  ├── useExtraPayment.ts         — Extra payment orchestration (≤100 lines)
  ├── usePrincipalReduction.ts   — ลดเงินต้น (≤80 lines)
  └── useInterestRecalc.ts       — คำนวณดอกเบี้ยใหม่ (≤80 lines)
```

**ย้าย financial logic ไป domain layer:**

```typescript
// src/domains/debt/recalculateInterest.ts
export function recalculateEffectiveRateInstallments(
  remainingPrincipal: number,
  annualRate: number,
  remainingMonths: number
): { amount: number; principal: number; interest: number }[] {
  // PMT formula logic ย้ายมาจาก useExtraPayment.ts
}
```

**ตรวจสอบ:**
- [ ] แต่ละ hook ≤ 150 บรรทัด
- [ ] Financial logic อยู่ใน `src/domains/debt/` ทั้งหมด
- [ ] Test ครอบคลุม logic ที่ย้ายมา

---

### 4.3 กำจัด Code Duplication

#### 4.3.1 Profile Fetching (ซ้ำ 5+ ที่)

สร้าง shared utility:

```typescript
// src/hooks/useProfileLookup.ts
import { supabase } from "@/integrations/supabase/client";

interface ProfileData {
  display_name: string | null;
  user_code: string | null;
  avatar_url: string | null;
}

const profileCache = new Map<string, ProfileData>();

export async function fetchProfile(userId: string): Promise<ProfileData | null> {
  if (profileCache.has(userId)) return profileCache.get(userId)!;

  const { data } = await supabase
    .from("profiles")
    .select("display_name, user_code, avatar_url")
    .eq("user_id", userId)
    .single();

  if (data) profileCache.set(userId, data);
  return data;
}

export async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileData>> {
  const uncached = userIds.filter(id => !profileCache.has(id));

  if (uncached.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, user_code, avatar_url")
      .in("user_id", uncached);

    (data || []).forEach(p => profileCache.set(p.user_id, p));
  }

  const result = new Map<string, ProfileData>();
  userIds.forEach(id => {
    const cached = profileCache.get(id);
    if (cached) result.set(id, cached);
  });
  return result;
}
```

แล้วแทนที่ทุกจุดที่ fetch profile ด้วย function นี้

#### 4.3.2 Error Handling Pattern (91 จุด)

สร้าง error handler กลาง:

```typescript
// src/utils/errorHandler.ts
import { toast } from "sonner";

export function handleSupabaseError(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[${context}]`, error);
  // TODO: ส่งไป Sentry เมื่อ setup แล้ว (Phase 3)
  toast.error(getThaiMessage(context));
}

function getThaiMessage(context: string): string {
  const messages: Record<string, string> = {
    "fetch-agreements": "ไม่สามารถโหลดข้อตกลงได้ กรุณาลองใหม่",
    "create-agreement": "ไม่สามารถสร้างข้อตกลงได้ กรุณาลองใหม่",
    "fetch-friends": "ไม่สามารถโหลดรายชื่อเพื่อนได้",
    "upload-slip": "ไม่สามารถอัปโหลดสลิปได้",
    // ... เพิ่มตาม context
  };
  return messages[context] || "เกิดข้อผิดพลาด กรุณาลองใหม่";
}
```

แล้วแทนที่:

```typescript
// before
} catch (error: any) {
  console.error('Error fetching agreements:', error);
  toast.error('ไม่สามารถโหลดข้อตกลงได้');
}

// after
} catch (error) {
  handleSupabaseError(error, "fetch-agreements");
}
```

#### 4.3.3 Thai Month Constants (ซ้ำหลายที่)

```typescript
// src/constants/thai.ts
export const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
] as const;

export const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
] as const;
```

**ตรวจสอบ:**
- [ ] grep `from('profiles')` → เหลือแค่ใน `useProfileLookup.ts`
- [ ] grep `console.error` → เหลือแค่ใน `errorHandler.ts`
- [ ] grep `thaiMonth` → เหลือแค่ใน `constants/thai.ts`

---

### 4.4 จัดโครงสร้างโฟลเดอร์ Components

**โครงสร้างใหม่:**

```
src/components/
  ├── ui/                  (shadcn primitives — คงเดิม, 52 ไฟล์)
  ├── layout/
  │   ├── Header.tsx
  │   ├── BottomNav.tsx
  │   └── PageContainer.tsx
  ├── agreements/
  │   ├── AgreementCard.tsx
  │   ├── AgreementStatusBadge.tsx
  │   ├── BankAccountSection.tsx
  │   └── InterestCalculator.tsx
  ├── payments/
  │   ├── PaymentCalendar/     (แยกจาก 4.1.2)
  │   ├── PaymentDialog/       (แยกจาก 4.1.3)
  │   └── SlipUploader.tsx
  ├── friends/
  │   ├── AddFriendSection.tsx
  │   ├── FriendList.tsx
  │   └── QRScanner.tsx
  ├── chat/                (มีแล้ว — คงเดิม)
  ├── admin/               (มีแล้ว — คงเดิม)
  ├── home/                (มีแล้ว — คงเดิม)
  └── shared/
      ├── AvatarUpload.tsx
      ├── LoadingSpinner.tsx
      └── EmptyState.tsx
```

**ขั้นตอน:**
1. สร้าง folder structure ใหม่
2. ย้ายไฟล์ทีละ folder (เริ่มจาก payments → agreements → friends → layout → shared)
3. อัพเดท import paths ทั้งหมด (ใช้ IDE refactor หรือ find-and-replace)
4. ตรวจสอบว่า build ผ่าน

**ตรวจสอบ:**
- [ ] `npm run build` สำเร็จ
- [ ] ไม่มีไฟล์ component อยู่ root ของ `src/components/` (ยกเว้น index files)

---

## 5. Phase 3 — Observability & Quality

### 5.1 เพิ่ม Error Tracking (Sentry)

**แนวทาง:**

1. ติดตั้ง:

```bash
npm install @sentry/react
```

2. Setup ใน `src/main.tsx`:

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

3. เพิ่ม Error Boundary:

```typescript
// src/components/shared/ErrorBoundary.tsx
import * as Sentry from "@sentry/react";

export const ErrorBoundary = Sentry.withErrorBoundary(
  ({ children }) => <>{children}</>,
  {
    fallback: ({ error }) => (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-bold mb-2">เกิดข้อผิดพลาด</h1>
        <p className="text-muted-foreground mb-4">กรุณารีเฟรชหน้า</p>
        <button onClick={() => window.location.reload()}>รีเฟรช</button>
      </div>
    ),
  }
);
```

4. อัพเดท `errorHandler.ts` ให้ส่ง Sentry:

```typescript
export function handleSupabaseError(error: unknown, context: string): void {
  Sentry.captureException(error, { extra: { context } });
  toast.error(getThaiMessage(context));
}
```

**ตรวจสอบ:**
- [ ] Error ใน production ส่งไป Sentry dashboard
- [ ] ErrorBoundary จับ crash ได้ ไม่แสดงหน้าขาว

---

### 5.2 ทำ i18n ให้สมบูรณ์ หรือตัดออก

**ตัดสินใจ:**
- **Option A:** ทำ i18n จริงจัง → ลงทุนเวลาแปลทุก string
- **Option B:** ตัดฟีเจอร์เลือกภาษาออก → ลดความสับสน

**ถ้าเลือก Option A:**

1. Audit ทุก component หา hardcoded Thai strings:

```bash
# ค้นหา Thai characters ใน source code
grep -rn '[ก-๙]' src/components/ src/pages/ --include="*.tsx"
```

2. แทนที่ด้วย translation keys:

```tsx
// before
<p>สวัสดี,</p>

// after
const { t } = useLanguage();
<p>{t("greeting")},</p>
```

3. เพิ่ม translation ครบทุกภาษา

**ถ้าเลือก Option B:**

1. ลบ `LanguageContext` และ language selector ออก
2. ใช้ Thai strings ตรงๆ ทั้งหมด (เป็นอยู่แล้ว)
3. ลดความซับซ้อนของ codebase

**ตรวจสอบ:**
- [ ] ถ้า Option A: เปลี่ยนภาษาเป็น English → ทุกหน้าแสดงเป็น English
- [ ] ถ้า Option B: ไม่มี language selector ในแอป

---

## 6. Phase 4 — UX & Performance

### 6.1 ปรับ React Query Caching

**ไฟล์:** `src/App.tsx`

```typescript
const [queryClient] = useState(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,        // 1 นาที — ข้อมูลไม่ stale ทันที
      gcTime: 10 * 60 * 1000,      // 10 นาที — เก็บ cache นานขึ้น
      retry: 2,                     // retry 2 ครั้งเมื่อ fail
      refetchOnWindowFocus: false,  // ไม่ refetch ทุกครั้งที่กลับมาที่หน้าต่าง
    },
  },
}));
```

**ตรวจสอบ:**
- [ ] Network tab แสดง request น้อยลงเมื่อ navigate ไปมา
- [ ] ข้อมูลยังอัพเดทเมื่อมีการเปลี่ยนแปลงจริง

---

### 6.2 เปลี่ยน Polling เป็น Realtime

**ไฟล์:** `src/components/home/PendingActionsCard.tsx` (line 173)

```typescript
// before
refetchInterval: 30000, // poll ทุก 30 วินาที

// after — ใช้ Supabase Realtime แทน
useEffect(() => {
  const channel = supabase
    .channel("pending-actions")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "installments",
    }, () => {
      refetch();
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, []);
```

**ตรวจสอบ:**
- [ ] เมื่อมีการชำระเงิน → PendingActionsCard อัพเดททันทีโดยไม่ต้อง poll
- [ ] Network tab ไม่มี request ทุก 30 วินาที

---

### 6.3 เพิ่ม Accessibility (a11y)

**ลำดับความสำคัญ:**

1. **เพิ่ม aria-label ให้ปุ่ม icon ทั้งหมด:**

```tsx
// ค้นหาปุ่มที่ไม่มี aria-label
// grep -rn '<button' src/ --include="*.tsx" | grep -v 'aria-label'

// before
<button onClick={handleSearch}>
  <Search className="w-5 h-5" />
</button>

// after
<button onClick={handleSearch} aria-label="ค้นหาข้อตกลง">
  <Search className="w-5 h-5" />
</button>
```

2. **แทนที่ `<div onClick>` ด้วย `<button>` หรือ `<a>`:**

```tsx
// before
<div className="cursor-pointer" onClick={handleClick}>...</div>

// after
<button className="..." onClick={handleClick}>...</button>
```

3. **เพิ่ม alt text สำหรับรูปภาพ:**

```tsx
// before
<img src={avatarUrl} />

// after
<img src={avatarUrl} alt={`รูปโปรไฟล์ของ ${displayName}`} />
```

4. **เพิ่ม skip navigation:**

```tsx
// src/components/layout/SkipNav.tsx
export function SkipNav() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:p-2 focus:rounded"
    >
      ข้ามไปเนื้อหาหลัก
    </a>
  );
}
```

**ตรวจสอบ:**
- [ ] ใช้ Lighthouse Accessibility audit → score ≥ 90
- [ ] Tab ผ่านทุก interactive element ได้ครบ
- [ ] Screen reader อ่านได้เข้าใจ

---

## 7. Dependency & Risk Matrix

```
Phase 0 (Security) ─── ไม่มี dependency ── ทำได้ทันที
    │
    ▼
Phase 1 (Financial) ── ต้องทำหลัง Phase 0
    │                   (เพราะ test ต้อง cover security fixes ด้วย)
    │
    ▼
Phase 2 (Architecture) ── ต้องมี test จาก Phase 1 ก่อน refactor
    │                      (refactor โดยไม่มี test = เสี่ยง regression)
    │
    ▼
Phase 3 (Observability) ── ทำควบคู่กับ Phase 2 ได้
    │
    ▼
Phase 4 (UX/Perf) ─── ทำได้อิสระ ── ไม่ต้องรอ phase อื่น
```

**ความเสี่ยงแต่ละ Phase:**

| Phase | ความเสี่ยง | Mitigation |
|-------|-----------|------------|
| Phase 0 | Storage policy แก้แล้วอาจ break upload flow | ทดสอบ upload + view slip ทั้ง lender/borrower |
| Phase 1 | เปิด strict TS อาจมี error หลายร้อยจุด | ทำทีละ flag, ทีละไฟล์ |
| Phase 2 | Refactor อาจ break UI | ทำทีละ component, manual test ทุกครั้ง |
| Phase 3 | Sentry อาจเพิ่ม bundle size | ใช้ lazy loading สำหรับ Sentry |
| Phase 4 | เปลี่ยน polling เป็น realtime อาจ miss events | เก็บ polling เป็น fallback |

---

## 8. Definition of Done

### Phase 0 ถือว่าเสร็จเมื่อ:
- [ ] Payment slips มองเห็นได้เฉพาะคู่สัญญา
- [ ] หน้า protected ทั้งหมด redirect ไป login เมื่อไม่ได้ auth
- [ ] Edge functions validate input ทุก endpoint
- [ ] Feed images policy ได้รับการ review

### Phase 1 ถือว่าเสร็จเมื่อ:
- [ ] `npm run test:run` ผ่าน ≥ 50 test cases
- [ ] Domain logic coverage ≥ 95%
- [ ] ไม่มี `Number()` ใช้ตรงกับค่าเงินโดยไม่ validate
- [ ] TypeScript `strictNullChecks` เปิดและ build ผ่าน

### Phase 2 ถือว่าเสร็จเมื่อ:
- [ ] ไม่มีไฟล์เกิน 300 บรรทัด (ยกเว้น generated types)
- [ ] ไม่มี `any` ใน source code
- [ ] Code duplication ลดลง ≥ 80%
- [ ] Components จัดอยู่ใน feature folders

### Phase 3 ถือว่าเสร็จเมื่อ:
- [ ] Sentry ทำงานใน production
- [ ] ErrorBoundary ครอบทุก route
- [ ] i18n ตัดสินใจแล้ว (ทำจริง หรือ ตัดออก)

### Phase 4 ถือว่าเสร็จเมื่อ:
- [ ] Lighthouse Performance ≥ 80
- [ ] Lighthouse Accessibility ≥ 90
- [ ] ไม่มี polling-based data fetching (ใช้ realtime ทั้งหมด)
- [ ] React Query ตั้ง default caching strategy

---

> **หมายเหตุ:** แผนนี้ออกแบบให้ทำได้ทีละ Phase โดยแต่ละ Phase ส่งมอบคุณค่าได้เอง ไม่จำเป็นต้องทำครบทุก Phase ถึงจะได้ประโยชน์ แนะนำให้เริ่มจาก Phase 0 เพราะเป็นเรื่อง Security ที่กระทบ user โดยตรง
