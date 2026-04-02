# Phase 3 — Growth Features

> **Priority:** ปานกลาง — ดึงดูดผู้ใช้ใหม่และเพิ่ม DAU  
> **เป้าหมาย:** Viral growth ผ่าน referral, community content, ขยาย market

---

## Feature 9: Invite & Referral System

### Why
`profiles.user_code` เป็น unique identifier ที่มีอยู่แล้วในทุก user — ใช้เป็น referral code ได้ทันที ไม่ต้องสร้าง mechanism ใหม่ แค่เพิ่ม tracking + reward

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_create_referrals.sql

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  referred_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'rewarded')),
  referrer_points INTEGER DEFAULT 100,
  referred_points INTEGER DEFAULT 50,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_id)  -- แต่ละ user ถูกเชิญได้ครั้งเดียว
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals" ON referrals
  FOR SELECT USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE POLICY "System can insert referrals" ON referrals
  FOR INSERT WITH CHECK (referred_id = auth.uid());
```

### Referral Flow (End-to-End)
```
1. User A → คัดลอก link: https://app.com/auth?ref=USERCODE
2. User B → คลิก link → Auth page บันทึก ref code ใน sessionStorage
3. User B → สมัครสมาชิก → Auth.tsx สร้าง referral record โดยอัตโนมัติ
4. User B → สร้างสัญญาแรก → trigger เปลี่ยน status เป็น 'activated'
5. ทั้งคู่ได้รับ points → rewarded_at = NOW()
```

### New Files

#### `src/hooks/useReferral.ts`
```typescript
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReferralStats {
  totalReferred: number;
  activated: number;
  totalPointsEarned: number;
}

export function useReferral() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<ReferralStats>({ totalReferred: 0, activated: 0, totalPointsEarned: 0 });

  const referralLink = profile?.user_code
    ? `${window.location.origin}/auth?ref=${profile.user_code}`
    : null;

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('referrals')
      .select('status, referrer_points')
      .eq('referrer_id', user.id);

    if (data) {
      setStats({
        totalReferred: data.length,
        activated: data.filter((r) => ['activated', 'rewarded'].includes(r.status)).length,
        totalPointsEarned: data
          .filter((r) => r.status === 'rewarded')
          .reduce((sum, r) => sum + r.referrer_points, 0),
      });
    }
  }, [user]);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  // เรียกหลัง signup เพื่อ link referral
  const processReferralCode = useCallback(async (refCode: string, newUserId: string) => {
    // หา referrer จาก user_code
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_code', refCode)
      .maybeSingle();

    if (!referrer || referrer.id === newUserId) return;

    await supabase.from('referrals').insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
    }).onConflict('referred_id').ignoreDuplicates(); // ป้องกัน duplicate
  }, []);

  // เรียกเมื่อ user สร้างสัญญาแรก
  const activateReferral = useCallback(async () => {
    if (!user) return;
    const { data: referral } = await supabase
      .from('referrals')
      .select('id, referrer_id, referrer_points, referred_points')
      .eq('referred_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (!referral) return;

    // อัพเดต status + มอบ points
    await supabase.from('referrals').update({ status: 'activated' }).eq('id', referral.id);

    // มอบ points ให้ทั้งคู่ (reuse point_transactions table)
    await Promise.all([
      supabase.from('point_transactions').insert({
        user_id: referral.referrer_id,
        action_type: 'referral_reward',
        points_earned: referral.referrer_points,
        reference_id: referral.id,
      }),
      supabase.from('point_transactions').insert({
        user_id: user.id,
        action_type: 'referral_welcome',
        points_earned: referral.referred_points,
        reference_id: referral.id,
      }),
    ]);

    await supabase
      .from('referrals')
      .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
      .eq('id', referral.id);
  }, [user]);

  return { referralLink, stats, fetchStats, processReferralCode, activateReferral };
}
```

#### `src/components/ReferralShareCard.tsx`
```tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Users, Gift, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useReferral } from '@/hooks/useReferral';

export function ReferralShareCard() {
  const { referralLink, stats } = useReferral();
  const [showQR, setShowQR] = useState(false);

  async function handleCopy() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast.success('คัดลอก link แล้ว');
  }

  async function handleShare() {
    if (!referralLink || !navigator.share) return;
    await navigator.share({
      title: 'เชิญมาใช้ BudOverBills',
      text: 'แอปจัดการสัญญาและหนี้ระหว่างเพื่อน สมัครผ่าน link นี้รับ 50 points ฟรี!',
      url: referralLink,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="w-5 h-5 text-yellow-500" /> เชิญเพื่อน รับ Points
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-bold">{stats.totalReferred}</p>
            <p className="text-xs text-muted-foreground">เชิญแล้ว</p>
          </div>
          <div>
            <p className="text-xl font-bold">{stats.activated}</p>
            <p className="text-xs text-muted-foreground">สมัครแล้ว</p>
          </div>
          <div>
            <p className="text-xl font-bold text-yellow-500">{stats.totalPointsEarned}</p>
            <p className="text-xs text-muted-foreground">Points ได้รับ</p>
          </div>
        </div>

        {/* Reward info */}
        <div className="bg-muted rounded-lg p-3 text-sm">
          <p className="font-medium">รางวัลการเชิญ</p>
          <p className="text-muted-foreground">• คุณรับ <strong>100 Points</strong> ต่อ 1 คนที่เชิญสำเร็จ</p>
          <p className="text-muted-foreground">• เพื่อนรับ <strong>50 Points</strong> เมื่อสมัครผ่าน link ของคุณ</p>
        </div>

        {/* QR Code toggle */}
        {showQR && referralLink && (
          <div className="flex justify-center">
            <QRCodeSVG value={referralLink} size={160} includeMargin />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
            <Copy className="w-4 h-4 mr-1" /> คัดลอก link
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
            QR
          </Button>
          {navigator.share && (
            <Button size="sm" onClick={handleShare} className="flex-1">
              <Share2 className="w-4 h-4 mr-1" /> แชร์
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

#### `src/pages/Referral.tsx`
```tsx
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReferralShareCard } from '@/components/ReferralShareCard';

export default function Referral() {
  const navigate = useNavigate();
  return (
    <div className="container max-w-lg mx-auto p-4 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">เชิญเพื่อน</h1>
      </div>
      <ReferralShareCard />
    </div>
  );
}
```

### Modified Files

#### `src/pages/Auth.tsx`
```typescript
// ขณะโหลดหน้า: เก็บ ref code
const [searchParams] = useSearchParams();
const refCode = searchParams.get('ref');
useEffect(() => {
  if (refCode) sessionStorage.setItem('referral_code', refCode);
}, [refCode]);

// หลัง signup สำเร็จ:
const savedRef = sessionStorage.getItem('referral_code');
if (savedRef && newUser) {
  await processReferralCode(savedRef, newUser.id);
  sessionStorage.removeItem('referral_code');
}
```

#### `src/pages/Profile.tsx`
```tsx
import { ReferralShareCard } from '@/components/ReferralShareCard';
// เพิ่ม section ใน profile:
<ReferralShareCard />
```

#### `src/App.tsx`
```tsx
import Referral from '@/pages/Referral';
<Route path="/referral" element={<Referral />} />
```

### Testing
1. Copy referral link → เปิดใน incognito → สมัครสมาชิก
2. ตรวจ `referrals` table ว่ามี record ถูกต้อง
3. สร้างสัญญาแรก → ตรวจว่า points ถูกมอบให้ทั้งคู่
4. ทดสอบ: เชิญ user เดิม 2 ครั้ง → ต้อง unique constraint error

---

## Feature 10: Social Feed Enhancement (User Posts)

### Why
ปัจจุบัน `feed_posts` เป็น admin-only — community-driven content จะเพิ่ม daily active usage เพราะ users มี incentive กลับมาอ่าน posts ของเพื่อน

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_add_user_posts_to_feed.sql

ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS author_type TEXT DEFAULT 'admin'
    CHECK (author_type IN ('admin', 'user')),
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderation_note TEXT,
  ADD COLUMN IF NOT EXISTS author_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- User posts เริ่มต้นเป็น pending, admin ต้อง approve
-- Admin posts ข้าม moderation ไปเลย (default 'approved')
```

### New Files

#### `src/components/CreatePostDialog.tsx`
```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreatePostDialog({ open, onOpenChange, onSuccess }: CreatePostDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<'tip' | 'article'>('tip');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!user || !title.trim() || !content.trim()) return;
    setIsSubmitting(true);

    const { error } = await supabase.from('feed_posts').insert({
      title: title.trim(),
      content: content.trim(),
      content_type: contentType,
      author_type: 'user',
      author_user_id: user.id,
      moderation_status: 'pending',
      is_published: false, // admin จะ publish เมื่อ approve
    });

    setIsSubmitting(false);
    if (error) { toast.error('ส่ง post ไม่สำเร็จ'); return; }

    toast.success('ส่ง post แล้ว รอการตรวจสอบจากทีมงาน');
    setTitle('');
    setContent('');
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แชร์เคล็ดลับการเงิน</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>ประเภท</Label>
            <Select value={contentType} onValueChange={(v) => setContentType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tip">💡 เคล็ดลับสั้น</SelectItem>
                <SelectItem value="article">📄 บทความ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>หัวข้อ</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น: วิธีออมเงินง่ายๆ ทำได้ทุกวัน"
            />
          </div>
          <div>
            <Label>เนื้อหา</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="เขียนเนื้อหาที่เป็นประโยชน์..."
              rows={5}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            * post จะถูกตรวจสอบโดยทีมงานก่อนเผยแพร่ ใช้เวลาประมาณ 1-2 วันทำการ
          </p>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !content.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'กำลังส่ง...' : 'ส่งเพื่อตรวจสอบ'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

#### `src/components/PostModerationBadge.tsx`
```tsx
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle } from 'lucide-react';

type ModerationStatus = 'pending' | 'approved' | 'rejected';

const STATUS_CONFIG: Record<ModerationStatus, { label: string; icon: any; variant: any }> = {
  pending: { label: 'รอตรวจสอบ', icon: Clock, variant: 'secondary' },
  approved: { label: 'อนุมัติแล้ว', icon: CheckCircle, variant: 'default' },
  rejected: { label: 'ไม่อนุมัติ', icon: XCircle, variant: 'destructive' },
};

export function PostModerationBadge({ status }: { status: ModerationStatus }) {
  const { label, icon: Icon, variant } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1 text-xs">
      <Icon className="w-3 h-3" /> {label}
    </Badge>
  );
}
```

### Modified Files

#### `src/hooks/useActivityFeed.ts`
```typescript
// เพิ่ม function createPost:
export async function createUserPost(input: { title: string; content: string; contentType: string }) {
  // delegate to CreatePostDialog ด้านบน
}

// แก้ไข query ให้ filter moderation_status:
// Regular users เห็นเฉพาะ approved posts
// Admin เห็นทุก status
const query = supabase
  .from('feed_posts')
  .select('*')
  .eq('is_published', true)
  .eq('moderation_status', 'approved') // เพิ่มบรรทัดนี้
  .order('created_at', { ascending: false });
```

#### `src/pages/Index.tsx`
```tsx
import { CreatePostDialog } from '@/components/CreatePostDialog';
import { PenSquare } from 'lucide-react';

// เพิ่ม state:
const [createPostOpen, setCreatePostOpen] = useState(false);

// ใน feed section header:
<div className="flex justify-between items-center">
  <h2 className="font-semibold">ฟีดความรู้</h2>
  <Button variant="outline" size="sm" onClick={() => setCreatePostOpen(true)}>
    <PenSquare className="w-4 h-4 mr-1" /> แชร์เคล็ดลับ
  </Button>
</div>

<CreatePostDialog
  open={createPostOpen}
  onOpenChange={setCreatePostOpen}
/>
```

### Admin Moderation Queue
เพิ่มในหน้า admin (ไฟล์ที่เกี่ยวข้องกับ admin feed management):
```tsx
// Query posts รอ moderation:
const { data: pendingPosts } = await supabase
  .from('feed_posts')
  .select('*, profiles!author_user_id(display_name)')
  .eq('author_type', 'user')
  .eq('moderation_status', 'pending')
  .order('created_at');

// Approve:
await supabase.from('feed_posts')
  .update({ moderation_status: 'approved', is_published: true })
  .eq('id', postId);

// Reject:
await supabase.from('feed_posts')
  .update({ moderation_status: 'rejected', moderation_note: reason })
  .eq('id', postId);
```

### Testing
1. สร้าง user post → ตรวจว่า status = 'pending' และไม่แสดงใน feed
2. Admin approve → ตรวจว่าปรากฏใน feed
3. Admin reject → ตรวจว่าผู้สร้างได้รับ notification
4. ทดสอบ: user พยายาม approve ตัวเอง → ต้อง RLS block

---

## Feature 11: Multi-Currency Support

### Why
ขยายฐาน user ไปถึงคนไทยที่มีเพื่อน/ธุรกิจข้ามพรมแดน (ญี่ปุ่น, สิงคโปร์, สหรัฐ) — เพิ่ม market size โดยไม่เปลี่ยน core logic

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_add_currency_to_agreements.sql

ALTER TABLE debt_agreements
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'THB' NOT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_thb NUMERIC(12,6) DEFAULT 1.0;

-- exchange_rate_to_thb = อัตราแลกเปลี่ยน ณ วันที่สร้างสัญญา
-- เก็บไว้เพื่อ historical accuracy (ไม่ใช้ live rate ย้อนหลัง)
COMMENT ON COLUMN debt_agreements.exchange_rate_to_thb IS 
  'Exchange rate at agreement creation time. Used for dashboard THB totals.';
```

### New Files

#### `src/hooks/useExchangeRates.ts`
```typescript
import { useState, useEffect } from 'react';

const SUPPORTED_CURRENCIES = ['THB', 'USD', 'JPY', 'EUR', 'SGD', 'CNY', 'GBP', 'AUD'] as const;
export type Currency = typeof SUPPORTED_CURRENCIES[number];

// ใช้ Open Exchange Rates API (free tier: 1000 req/month)
// หรือ exchangerate-api.com (free tier)
const API_BASE = 'https://open.er-api.com/v6/latest/THB';

export function useExchangeRates() {
  const [rates, setRates] = useState<Record<Currency, number>>({ THB: 1 } as any);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    // Cache ใน localStorage, update ทุก 1 ชั่วโมง
    const cached = localStorage.getItem('exchange_rates_cache');
    if (cached) {
      const { rates: cachedRates, timestamp } = JSON.parse(cached);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (timestamp > oneHourAgo) {
        setRates(cachedRates);
        setLastFetched(new Date(timestamp));
        return;
      }
    }

    setIsLoading(true);
    fetch(API_BASE)
      .then((r) => r.json())
      .then((data) => {
        if (data.result === 'success') {
          // rates จาก API คือ THB → other currencies
          // เราต้องการ other → THB ดังนั้น invert
          const invertedRates: Record<string, number> = { THB: 1 };
          for (const currency of SUPPORTED_CURRENCIES) {
            if (data.rates[currency]) {
              invertedRates[currency] = 1 / data.rates[currency];
            }
          }
          setRates(invertedRates as any);
          localStorage.setItem('exchange_rates_cache', JSON.stringify({
            rates: invertedRates,
            timestamp: Date.now(),
          }));
          setLastFetched(new Date());
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  function convertToTHB(amount: number, fromCurrency: Currency): number {
    return amount * (rates[fromCurrency] ?? 1);
  }

  return { rates, isLoading, lastFetched, convertToTHB, SUPPORTED_CURRENCIES };
}
```

#### `src/components/CurrencySelector.tsx`
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useExchangeRates, type Currency } from '@/hooks/useExchangeRates';

const CURRENCY_LABELS: Record<string, string> = {
  THB: '🇹🇭 THB — บาทไทย',
  USD: '🇺🇸 USD — ดอลลาร์สหรัฐ',
  JPY: '🇯🇵 JPY — เยนญี่ปุ่น',
  EUR: '🇪🇺 EUR — ยูโร',
  SGD: '🇸🇬 SGD — ดอลลาร์สิงคโปร์',
  CNY: '🇨🇳 CNY — หยวนจีน',
  GBP: '🇬🇧 GBP — ปอนด์อังกฤษ',
  AUD: '🇦🇺 AUD — ดอลลาร์ออสเตรเลีย',
};

interface CurrencySelectorProps {
  value: Currency;
  onChange: (currency: Currency) => void;
}

export function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  const { SUPPORTED_CURRENCIES, rates } = useExchangeRates();

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            <span>{CURRENCY_LABELS[c]}</span>
            {c !== 'THB' && rates[c] && (
              <span className="text-xs text-muted-foreground ml-1">
                (1 {c} ≈ ฿{rates[c].toFixed(2)})
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Modified Files

#### `src/pages/CreateAgreement.tsx`
```tsx
import { CurrencySelector, type Currency } from '@/components/CurrencySelector';
import { useExchangeRates } from '@/hooks/useExchangeRates';

const { convertToTHB } = useExchangeRates();
const [currency, setCurrency] = useState<Currency>('THB');

// ใน form:
<div className="space-y-2">
  <Label>สกุลเงิน</Label>
  <CurrencySelector value={currency} onChange={setCurrency} />
</div>

// เมื่อ submit:
const exchangeRate = currency === 'THB' ? 1 : convertToTHB(1, currency);
await createAgreement({
  ...formData,
  currency,
  exchange_rate_to_thb: exchangeRate,
});
```

#### `src/domains/debt/types.ts`
```typescript
// เพิ่มใน DebtAgreement interface:
currency?: string;  // default 'THB'
exchange_rate_to_thb?: number;
```

#### `src/utils/money.ts`
```typescript
// เพิ่ม function:
export function formatMoney(
  amount: number,
  currency: string = 'THB',
  locale: string = 'th-TH'
): string {
  const currencyLocale: Record<string, string> = {
    THB: 'th-TH', USD: 'en-US', JPY: 'ja-JP',
    EUR: 'de-DE', SGD: 'en-SG', CNY: 'zh-CN',
    GBP: 'en-GB', AUD: 'en-AU',
  };
  return new Intl.NumberFormat(currencyLocale[currency] ?? locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount);
}
```

#### `src/components/DebtCard.tsx`
```tsx
// แสดง currency symbol ถ้าไม่ใช่ THB:
import { formatMoney } from '@/utils/money';
// แทนที่ ฿{amount} ด้วย:
{formatMoney(amount, agreement.currency ?? 'THB')}
// ถ้าไม่ใช่ THB ให้แสดง THB equivalent ด้วย:
{agreement.currency !== 'THB' && agreement.exchange_rate_to_thb && (
  <span className="text-xs text-muted-foreground">
    ≈ ฿{(amount * agreement.exchange_rate_to_thb).toLocaleString('th-TH')}
  </span>
)}
```

#### `src/components/DashboardStats.tsx`
```tsx
// Total คำนวณเป็น THB โดยใช้ exchange_rate_to_thb:
const totalLentTHB = agreements
  .filter((a) => getUserRoleInAgreement(a, userId) === 'lender')
  .reduce((sum, a) => {
    const remaining = calculateRemainingAmount(a.installments ?? []);
    return sum + remaining * (a.exchange_rate_to_thb ?? 1);
  }, 0);
```

### Testing
1. สร้างสัญญาสกุล USD → ตรวจว่า exchange_rate ถูก record
2. Dashboard totals ควรแปลงเป็น THB ถูกต้อง
3. DebtCard แสดงทั้ง original currency และ THB equivalent
4. ทดสอบ JPY (ไม่มี decimal places)

---

## Feature 12: Debt Consolidation View

### Why
Users ที่มีหนี้หลายก้อนมักไม่รู้ว่าควรจ่ายก้อนไหนก่อน — Snowball vs Avalanche method เป็น financial education ที่ practical และช่วยเพิ่ม engagement

### Database Changes
ไม่มี — compute จาก `debt_agreements` + `installments` ที่มีอยู่

### New Files

#### `src/utils/debtStrategies.ts`
```typescript
export interface DebtItem {
  id: string;
  name: string;          // ชื่อสัญญาหรือ lender
  balance: number;       // ยอดคงเหลือทั้งหมด
  minPayment: number;    // ยอดชำระขั้นต่ำต่อเดือน (installment amount)
  interestRate: number;  // annual interest rate (%)
}

export interface MonthlySnapshot {
  month: number;
  totalBalance: number;
  totalInterestPaid: number;
}

export interface PaymentPlan {
  monthsToPayoff: number;
  totalInterestPaid: number;
  totalPaid: number;
  payoffOrder: string[]; // debt IDs ตามลำดับที่จะ payoff
  monthlySnapshots: MonthlySnapshot[];
}

/**
 * Debt Snowball: จ่ายก้อนที่ balance น้อยที่สุดก่อน
 * ข้อดี: motivation สูง เห็นผลเร็ว
 */
export function snowball(debts: DebtItem[], extraPayment: number = 0): PaymentPlan {
  return simulate([...debts].sort((a, b) => a.balance - b.balance), extraPayment);
}

/**
 * Debt Avalanche: จ่ายก้อนที่ interest rate สูงที่สุดก่อน
 * ข้อดี: ประหยัดดอกเบี้ยมากที่สุด
 */
export function avalanche(debts: DebtItem[], extraPayment: number = 0): PaymentPlan {
  return simulate([...debts].sort((a, b) => b.interestRate - a.interestRate), extraPayment);
}

function simulate(orderedDebts: DebtItem[], extraPayment: number): PaymentPlan {
  const debts = orderedDebts.map((d) => ({ ...d })); // deep copy
  let month = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  const payoffOrder: string[] = [];
  const snapshots: MonthlySnapshot[] = [];

  while (debts.some((d) => d.balance > 0) && month < 600) {
    month++;
    let extra = extraPayment;

    // คำนวณดอกเบี้ยและ minimum payment แต่ละก้อน
    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = debt.balance * monthlyRate;
      totalInterest += interest;
      debt.balance += interest;

      const payment = Math.min(debt.minPayment, debt.balance);
      debt.balance -= payment;
      totalPaid += payment;

      if (debt.balance <= 0) {
        extra += debt.minPayment; // freed-up payment → extra
        if (!payoffOrder.includes(debt.id)) payoffOrder.push(debt.id);
      }
    }

    // Apply extra payment ไปที่ก้อนแรกที่ยังเหลือ
    for (const debt of debts) {
      if (debt.balance <= 0 || extra <= 0) continue;
      const applied = Math.min(extra, debt.balance);
      debt.balance -= applied;
      totalPaid += applied;
      extra -= applied;
      if (debt.balance <= 0 && !payoffOrder.includes(debt.id)) {
        payoffOrder.push(debt.id);
        extra += debt.minPayment;
      }
    }

    snapshots.push({
      month,
      totalBalance: debts.reduce((s, d) => s + Math.max(0, d.balance), 0),
      totalInterestPaid: totalInterest,
    });
  }

  return {
    monthsToPayoff: month,
    totalInterestPaid: Math.round(totalInterest * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    payoffOrder,
    monthlySnapshots: snapshots,
  };
}
```

#### `src/components/DebtStrategyComparison.tsx`
```tsx
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { snowball, avalanche, type DebtItem, type PaymentPlan } from '@/utils/debtStrategies';
import { Badge } from '@/components/ui/badge';

interface DebtStrategyComparisonProps {
  debts: DebtItem[];
}

export function DebtStrategyComparison({ debts }: DebtStrategyComparisonProps) {
  const [extraPayment, setExtraPayment] = useState(0);

  const { snowballPlan, avalanchePlan } = useMemo(() => ({
    snowballPlan: snowball(debts, extraPayment),
    avalanchePlan: avalanche(debts, extraPayment),
  }), [debts, extraPayment]);

  // รวม snapshots ทั้งสองแผน
  const chartData = useMemo(() => {
    const maxMonths = Math.max(snowballPlan.monthsToPayoff, avalanchePlan.monthsToPayoff);
    return Array.from({ length: maxMonths }, (_, i) => ({
      month: i + 1,
      snowball: snowballPlan.monthlySnapshots[i]?.totalBalance ?? 0,
      avalanche: avalanchePlan.monthlySnapshots[i]?.totalBalance ?? 0,
    }));
  }, [snowballPlan, avalanchePlan]);

  const interestSaved = snowballPlan.totalInterestPaid - avalanchePlan.totalInterestPaid;

  return (
    <div className="space-y-4">
      {/* Extra payment input */}
      <div>
        <Label>จ่ายเพิ่มต่อเดือน (บาท)</Label>
        <Input
          type="number"
          value={extraPayment || ''}
          onChange={(e) => setExtraPayment(Number(e.target.value))}
          placeholder="0"
          min={0}
        />
      </div>

      {/* Strategy comparison */}
      <div className="grid grid-cols-2 gap-3">
        <StrategyCard
          title="Snowball"
          subtitle="จ่ายก้อนเล็กก่อน"
          plan={snowballPlan}
          color="text-blue-500"
          tip="เห็นผลเร็ว สร้าง momentum"
        />
        <StrategyCard
          title="Avalanche"
          subtitle="จ่ายดอกเบี้ยสูงก่อน"
          plan={avalanchePlan}
          color="text-purple-500"
          tip="ประหยัดดอกเบี้ยมากกว่า"
          recommended={interestSaved > 0}
        />
      </div>

      {interestSaved > 0 && (
        <p className="text-sm text-center text-green-600 font-medium">
          วิธี Avalanche ประหยัดดอกเบี้ยได้ ฿{interestSaved.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </p>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">แนวโน้มหนี้คงเหลือ</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: 'เดือน', position: 'insideBottom' }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `฿${v.toLocaleString('th-TH')}`} />
              <Legend />
              <Line type="monotone" dataKey="snowball" stroke="#3b82f6" name="Snowball" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="avalanche" stroke="#8b5cf6" name="Avalanche" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function StrategyCard({
  title, subtitle, plan, color, tip, recommended
}: {
  title: string; subtitle: string; plan: PaymentPlan;
  color: string; tip: string; recommended?: boolean;
}) {
  return (
    <Card className={recommended ? 'ring-2 ring-purple-400' : ''}>
      <CardContent className="pt-3 space-y-1">
        <div className="flex justify-between items-start">
          <div>
            <p className={`font-bold text-sm ${color}`}>{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {recommended && <Badge variant="outline" className="text-xs">แนะนำ</Badge>}
        </div>
        <p className="text-xs"><span className="font-medium">{plan.monthsToPayoff}</span> เดือน</p>
        <p className="text-xs">ดอกเบี้ยรวม <span className="font-medium">฿{plan.totalInterestPaid.toLocaleString('th-TH')}</span></p>
        <p className="text-xs text-muted-foreground italic">{tip}</p>
      </CardContent>
    </Card>
  );
}
```

#### `src/pages/DebtConsolidation.tsx`
```tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDebtAgreements } from '@/hooks/useDebtAgreements';
import { useAuth } from '@/contexts/AuthContext';
import { DebtStrategyComparison } from '@/components/DebtStrategyComparison';
import { getUserRoleInAgreement } from '@/domains/role';
import { calculateRemainingAmount } from '@/domains/debt';
import type { DebtItem } from '@/utils/debtStrategies';

export default function DebtConsolidation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agreements, isLoading } = useDebtAgreements();

  // แปลง agreements ที่ user เป็น borrower → DebtItem[]
  const debtItems: DebtItem[] = useMemo(() => {
    if (!user) return [];
    return agreements
      .filter((a) => getUserRoleInAgreement(a, user.id) === 'borrower' && a.status === 'active')
      .map((a) => ({
        id: a.id,
        name: `สัญญา ${a.id.slice(0, 6).toUpperCase()}`,
        balance: calculateRemainingAmount(a.installments ?? []),
        minPayment: a.installments?.find((i) => i.status === 'pending')?.amount ?? 0,
        interestRate: Number(a.interest_rate ?? 0),
      }))
      .filter((d) => d.balance > 0);
  }, [agreements, user]);

  return (
    <div className="container max-w-lg mx-auto p-4 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">กลยุทธ์ชำระหนี้</h1>
      </div>

      {isLoading ? (
        <p>กำลังโหลด...</p>
      ) : debtItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">ไม่มีหนี้ที่ active อยู่</p>
      ) : (
        <DebtStrategyComparison debts={debtItems} />
      )}
    </div>
  );
}
```

### Modified Files

#### `src/App.tsx`
```tsx
import DebtConsolidation from '@/pages/DebtConsolidation';
<Route path="/consolidation" element={<DebtConsolidation />} />
```

#### `src/pages/History.tsx`
```tsx
import { useNavigate } from 'react-router-dom';
// เพิ่มปุ่มใน header:
<Button variant="outline" size="sm" onClick={() => navigate('/consolidation')}>
  ดูกลยุทธ์ชำระหนี้
</Button>
```

### Testing
1. สร้าง 3+ agreements ในฐานะ borrower ที่มี interest rate ต่างกัน
2. เปิด `/consolidation` → ตรวจว่า chart แสดงถูกต้อง
3. ทดสอบ extra payment → เดือนลดลง
4. ทดสอบ: agreements ไม่มีดอกเบี้ย → Snowball = Avalanche

---

## Dependencies ระหว่าง Features

```
Feature 9 (Referral) ──── ต้องการ user_code ใน profiles ✓ (มีอยู่แล้ว)
Feature 9 (Referral) ──── ต้องการ point_transactions table ✓ (มีอยู่แล้ว)
Feature 10 (Feed) ─────── ต้องการ feed_posts table ✓ (มีอยู่แล้ว)
Feature 11 (Currency) ─── ต้องการ external API (exchange rates)
Feature 12 (Consolidation) ─ ใช้ DebtAgreements data ✓ (มีอยู่แล้ว)
Feature 12 ──────────────── ใช้ recharts ✓ (มีอยู่แล้ว)
```

## Testing Checklist

- [ ] Referral: UNIQUE constraint บน referred_id ทำงาน
- [ ] Referral: Points มอบให้ถูกต้องทั้งสองฝ่าย
- [ ] Feed: User posts ไม่แสดงจน admin approve
- [ ] Currency: Exchange rate cache invalidate ทุก 1 ชั่วโมง
- [ ] Currency: JPY ไม่แสดง decimal
- [ ] Consolidation: simulation ไม่ loop ∞ (max 600 months guard)
- [ ] ทุก feature ทำงานใน offline mode (PWA)
