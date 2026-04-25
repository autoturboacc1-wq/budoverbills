# Phase 4 — Polish Features

> **Priority:** ปานกลาง-ต่ำ — เพิ่ม UX quality และ premium differentiation  
> **เป้าหมาย:** สร้าง delight, เพิ่ม reach ผ่าน LINE, เพิ่ม premium perks

---

## Feature 13: LINE Notification Integration

### Why
คนไทยใช้ LINE เป็น primary communication app — push notification ของ browser มีอัตราการเปิดต่ำมาก แต่ LINE notification เปิดแน่นอน การ integrate LINE จะเพิ่ม notification effectiveness อย่างมาก

### Prerequisites
- สมัคร LINE Developers account: https://developers.line.biz/
- สร้าง Messaging API Channel
- ได้ Channel Access Token (Long-lived)
- สร้าง LINE Login Channel สำหรับ OAuth

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_add_line_to_profiles.sql

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS line_user_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS line_display_name TEXT,
  ADD COLUMN IF NOT EXISTS line_notifications_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.line_user_id IS 'LINE User ID from LINE Login OAuth';
COMMENT ON COLUMN profiles.line_notifications_enabled IS 'User preference to receive LINE notifications';
```

### New Files

#### `supabase/functions/send-line-notification/index.ts`
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const LINE_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;

interface SendLineNotificationPayload {
  userId: string;       // Supabase user ID
  title: string;
  message: string;
  actionUrl?: string;   // deep link URL ถ้ามี
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, title, message, actionUrl }: SendLineNotificationPayload = await req.json();

    // ดึง LINE user ID จาก profiles
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('line_user_id, line_notifications_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile?.line_user_id || !profile.line_notifications_enabled) {
      return new Response(
        JSON.stringify({ success: false, reason: 'LINE not linked or notifications disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // สร้าง LINE message object
    const lineMessage = actionUrl
      ? {
          type: 'template',
          altText: `${title}: ${message}`,
          template: {
            type: 'buttons',
            title: title.substring(0, 40),
            text: message.substring(0, 160),
            actions: [
              {
                type: 'uri',
                label: 'ดูรายละเอียด',
                uri: actionUrl,
              },
            ],
          },
        }
      : {
          type: 'text',
          text: `🔔 ${title}\n${message}`,
        };

    // ส่ง push message ผ่าน LINE Messaging API
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: profile.line_user_id,
        messages: [lineMessage],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('LINE API error:', result);
      return new Response(
        JSON.stringify({ success: false, lineError: result }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

#### `src/components/LineLinkButton.tsx`
```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const LINE_CLIENT_ID = import.meta.env.VITE_LINE_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/settings?line_callback=1`;

export function LineLinkButton() {
  const { user, profile } = useAuth();
  const [isUnlinking, setIsUnlinking] = useState(false);

  const isLinked = !!profile?.line_user_id;

  function handleLink() {
    // LINE Login OAuth flow
    const state = crypto.randomUUID(); // CSRF protection
    sessionStorage.setItem('line_oauth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      state,
      scope: 'profile openid',
    });

    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`;
  }

  async function handleUnlink() {
    if (!user) return;
    setIsUnlinking(true);
    await supabase
      .from('profiles')
      .update({
        line_user_id: null,
        line_display_name: null,
        line_notifications_enabled: false,
      })
      .eq('id', user.id);
    setIsUnlinking(false);
    toast.success('ยกเลิกการเชื่อมต่อ LINE แล้ว');
  }

  return isLinked ? (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-green-600">✓ เชื่อมต่อ LINE แล้ว</p>
        <p className="text-xs text-muted-foreground">{profile?.line_display_name}</p>
      </div>
      <Button variant="outline" size="sm" onClick={handleUnlink} disabled={isUnlinking}>
        ยกเลิก
      </Button>
    </div>
  ) : (
    <Button
      onClick={handleLink}
      className="w-full bg-[#06C755] hover:bg-[#05b04c] text-white"
    >
      <img src="/icons/line-icon.svg" className="w-5 h-5 mr-2" alt="LINE" />
      เชื่อมต่อ LINE
    </Button>
  );
}
```

### Modified Files

#### `src/pages/Settings.tsx`
```tsx
import { LineLinkButton } from '@/components/LineLinkButton';
import { Switch } from '@/components/ui/switch';

// เพิ่ม section "การแจ้งเตือน LINE":
<div className="space-y-3">
  <h3 className="font-medium text-sm">การแจ้งเตือนผ่าน LINE</h3>
  <LineLinkButton />
  {isLineLinked && (
    <div className="flex items-center justify-between">
      <Label>เปิดการแจ้งเตือนผ่าน LINE</Label>
      <Switch
        checked={lineNotificationsEnabled}
        onCheckedChange={async (checked) => {
          await supabase.from('profiles')
            .update({ line_notifications_enabled: checked })
            .eq('id', user.id);
        }}
      />
    </div>
  )}
</div>
```

#### LINE OAuth Callback ใน Settings.tsx
```tsx
// Handle LINE OAuth callback:
const [searchParams] = useSearchParams();
useEffect(() => {
  const lineCallback = searchParams.get('line_callback');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!lineCallback || !code || !state) return;

  // Verify state
  const savedState = sessionStorage.getItem('line_oauth_state');
  if (state !== savedState) { toast.error('Invalid OAuth state'); return; }
  sessionStorage.removeItem('line_oauth_state');

  // Exchange code for LINE user ID via Supabase Edge Function
  supabase.functions.invoke('link-line-account', { body: { code } })
    .then(({ data }) => {
      if (data?.success) toast.success('เชื่อมต่อ LINE สำเร็จ!');
    });
}, [searchParams]);
```

#### `supabase/functions/link-line-account/index.ts`
```typescript
// Exchange OAuth code → LINE user ID → save to profiles
const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: Deno.env.get('LINE_CLIENT_ID')!,
    client_secret: Deno.env.get('LINE_CLIENT_SECRET')!,
  }),
});

const { access_token } = await tokenResponse.json();

// Get LINE profile
const profileResponse = await fetch('https://api.line.me/v2/profile', {
  headers: { Authorization: `Bearer ${access_token}` },
});
const lineProfile = await profileResponse.json();

// Save to Supabase profiles
await supabase.from('profiles').update({
  line_user_id: lineProfile.userId,
  line_display_name: lineProfile.displayName,
}).eq('id', supabaseUserId);
```

### ENV Variables ที่ต้องเพิ่ม
```
VITE_LINE_CLIENT_ID=your_line_login_client_id
LINE_CHANNEL_ACCESS_TOKEN=your_messaging_api_token
LINE_CLIENT_ID=your_line_login_client_id
LINE_CLIENT_SECRET=your_line_login_client_secret
```

### Testing
1. กด "เชื่อมต่อ LINE" → OAuth flow → verify redirect กลับมาถูกต้อง
2. ตรวจ `profiles.line_user_id` ถูก save
3. Invoke `send-line-notification` manually → ตรวจว่าได้รับ LINE message
4. ปิด notifications → ตรวจว่าไม่ส่งอีก

---

## Feature 14: Voice Notes in Chat

### Why
Storage ใน Supabase มีอยู่แล้ว (`chat-attachments` bucket) และ MediaRecorder API พร้อมใช้บน modern browsers — voice note ทำให้สื่อสารเรื่องหนี้ง่ายขึ้นโดยไม่ต้องพิมพ์อธิบายยาว

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_add_voice_to_messages.sql

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS voice_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_duration INTEGER;  -- seconds

COMMENT ON COLUMN messages.voice_duration IS 'Duration of voice note in seconds';
```

### New Files

#### `src/components/chat/VoiceRecorder.tsx`
```tsx
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Send, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VoiceRecorderProps {
  onVoiceReady: (voiceUrl: string, duration: number) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onVoiceReady, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setIsRecording(false);
      };

      mediaRecorderRef.current.start(100); // collect every 100ms
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= 120) { stopRecording(); return d; } // max 2 minutes
          return d + 1;
        });
      }, 1000);

    } catch (err) {
      toast.error('ไม่สามารถเข้าถึงไมโครโฟนได้');
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  async function uploadAndSend() {
    if (!audioBlob) return;
    setIsUploading(true);

    const filename = `voice/${Date.now()}.webm`;
    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(filename, audioBlob, { contentType: 'audio/webm' });

    if (error) {
      toast.error('อัพโหลดไม่สำเร็จ');
      setIsUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filename);

    setIsUploading(false);
    onVoiceReady(publicUrl, duration);
  }

  function handleCancel() {
    if (isRecording) stopRecording();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    onCancel();
  }

  function formatDuration(s: number): string {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
      {!audioBlob ? (
        <>
          <Button
            variant={isRecording ? 'destructive' : 'outline'}
            size="icon"
            className="h-9 w-9"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          {isRecording && (
            <span className="text-sm font-mono text-red-500 animate-pulse">
              ● {formatDuration(duration)}
            </span>
          )}
          {!isRecording && (
            <span className="text-xs text-muted-foreground">กดค้างเพื่อบันทึก</span>
          )}
        </>
      ) : (
        <>
          <audio src={audioUrl!} controls className="h-8 flex-1" />
          <span className="text-xs text-muted-foreground">{formatDuration(duration)}</span>
          <Button size="icon" className="h-8 w-8" onClick={uploadAndSend} disabled={isUploading}>
            <Send className="w-4 h-4" />
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
```

#### `src/components/chat/VoiceMessagePlayer.tsx`
```tsx
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';

interface VoiceMessagePlayerProps {
  voiceUrl: string;
  duration: number;
  isSender: boolean;
}

export function VoiceMessagePlayer({ voiceUrl, duration, isSender }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  function formatTime(s: number): string {
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl min-w-[160px] max-w-[240px]
      ${isSender ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
    >
      <audio
        ref={audioRef}
        src={voiceUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={togglePlay}
      >
        {isPlaying
          ? <Pause className="w-4 h-4" />
          : <Play className="w-4 h-4" />
        }
      </Button>

      <div className="flex flex-col flex-1 gap-1">
        {/* Progress bar */}
        <div className="h-1 bg-current/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-current/60 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs opacity-70">
          {isPlaying ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
```

### Modified Files

#### `src/components/ChatRoom.tsx`
```tsx
import { useState } from 'react';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { Mic } from 'lucide-react';

// State:
const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

// ฟังก์ชัน send voice:
async function handleVoiceReady(voiceUrl: string, duration: number) {
  await supabase.from('messages').insert({
    sender_id: user.id,
    // agreement_id หรือ direct_chat_id ตาม chat type
    voice_url: voiceUrl,
    voice_duration: duration,
  });
  setShowVoiceRecorder(false);
}

// ใน input area:
{showVoiceRecorder ? (
  <VoiceRecorder
    onVoiceReady={handleVoiceReady}
    onCancel={() => setShowVoiceRecorder(false)}
  />
) : (
  <div className="flex items-center gap-2">
    {/* existing message input */}
    <Button variant="ghost" size="icon" onClick={() => setShowVoiceRecorder(true)}>
      <Mic className="w-5 h-5" />
    </Button>
  </div>
)}
```

#### `src/components/ChatMessageBubble.tsx`
```tsx
import { VoiceMessagePlayer } from '@/components/chat/VoiceMessagePlayer';

// ใน message bubble rendering:
{message.voice_url ? (
  <VoiceMessagePlayer
    voiceUrl={message.voice_url}
    duration={message.voice_duration ?? 0}
    isSender={message.sender_id === currentUserId}
  />
) : (
  /* existing text message rendering */
  <p>{message.content}</p>
)}
```

### Testing
1. กดปุ่ม mic → บันทึก 5 วินาที → ส่ง
2. ตรวจว่า audio upload ไปที่ `chat-attachments/voice/`
3. อีกฝ่ายเห็น voice message พร้อม play button
4. ทดสอบบน iOS (Safari มี MediaRecorder ที่ต่างออกไป)
5. ทดสอบ max duration (2 นาที) → ต้อง stop อัตโนมัติ

---

## Feature 15: Bank Statement Import (OCR)

> **Note:** A scoped-down version — **per-slip OCR verification** — already exists in the codebase but is **dormant by default**.
> See [supabase/functions/verify-payment-slip/index.ts](../supabase/functions/verify-payment-slip/index.ts) for activation criteria (~50+ slips/day, fraud signal, or sustained lender-confirm latency complaints).
> Migration `20260425270000_slip_ocr_verification.sql` already added the `slip_verifications.ocr_*` columns. Don't re-design those when building Feature 15 — extend, don't replace.

### Why
ขั้นตอน upload payment slip ทีละใบเป็นเรื่องที่ users complain มาก — ถ้า import statement ทั้งหมดได้ครั้งเดียวและ auto-match กับ installments จะลด friction ได้มาก

### Prerequisites
- Google Cloud Vision API key หรือ Tesseract.js (client-side OCR)
- สำหรับ MVP อาจใช้ Tesseract.js ก่อน (ไม่ต้องมี API key)

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_create_statement_imports.sql

CREATE TABLE statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT NOT NULL,
  bank_name TEXT,
  ocr_raw_text TEXT,
  parsed_transactions JSONB DEFAULT '[]',
  matched_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own imports" ON statement_imports
  FOR ALL USING (user_id = auth.uid());
```

### New Files

#### `src/hooks/useStatementImport.ts`
```typescript
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  matchedInstallmentId?: string;
}

export interface StatementImport {
  id: string;
  file_url: string;
  bank_name: string | null;
  parsed_transactions: ParsedTransaction[];
  matched_count: number;
  status: 'processing' | 'done' | 'failed';
  created_at: string;
}

export function useStatementImport() {
  const { user } = useAuth();
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadAndProcess = useCallback(async (file: File) => {
    if (!user) return null;
    setIsProcessing(true);

    // Upload file ไป Supabase Storage
    const filename = `statements/${user.id}/${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-attachments') // reuse existing bucket
      .upload(filename, file, { contentType: file.type });

    if (uploadError) {
      toast.error('อัพโหลดไม่สำเร็จ');
      setIsProcessing(false);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filename);

    // สร้าง import record
    const { data: importRecord } = await supabase
      .from('statement_imports')
      .insert({ user_id: user.id, file_url: publicUrl })
      .select()
      .single();

    if (!importRecord) {
      setIsProcessing(false);
      return null;
    }

    // ส่งไปประมวลผล OCR ผ่าน Edge Function
    const { data: processResult } = await supabase.functions.invoke('process-bank-statement', {
      body: { importId: importRecord.id, fileUrl: publicUrl, userId: user.id },
    });

    setIsProcessing(false);
    if (processResult?.success) {
      toast.success(`ประมวลผลสำเร็จ พบ ${processResult.matchedCount} รายการ`);
    }

    return importRecord.id;
  }, [user]);

  const fetchImports = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('statement_imports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) setImports(data as StatementImport[]);
  }, [user]);

  return { imports, isProcessing, uploadAndProcess, fetchImports };
}
```

#### `src/components/StatementImportDialog.tsx`
```tsx
import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useStatementImport, type ParsedTransaction } from '@/hooks/useStatementImport';

interface StatementImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatementImportDialog({ open, onOpenChange }: StatementImportDialogProps) {
  const { isProcessing, uploadAndProcess } = useStatementImport();
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const importId = await uploadAndProcess(file);
    if (importId) {
      // Poll for results (หรือใช้ realtime subscription)
      setTimeout(async () => {
        // Fetch processed results
      }, 3000);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleFile(file);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>นำเข้า Statement ธนาคาร</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">กำลังประมวลผล OCR...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">ลากไฟล์หรือคลิกเพื่อเลือก</p>
                <p className="text-xs text-muted-foreground">รองรับ PNG, JPG, PDF</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  เลือกไฟล์
                </Button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {/* Matched transactions */}
          {transactions.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <p className="text-sm font-medium">รายการที่พบ ({transactions.length})</p>
              {transactions.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                  <div>
                    <p>{t.description.slice(0, 30)}</p>
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={t.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                      {t.type === 'credit' ? '+' : '-'}฿{t.amount.toLocaleString('th-TH')}
                    </span>
                    {t.matchedInstallmentId
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : <XCircle className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

#### `supabase/functions/process-bank-statement/index.ts`
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Thai bank statement transaction patterns (regex)
const TRANSACTION_PATTERNS = {
  kbank: /(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR|DR)?/g,
  scb:   /(\d{2} \w{3} \d{4})\s+(.+?)\s+([\d,]+\.\d{2})/g,
  bbl:   /(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,.]+)/g,
};

serve(async (req) => {
  const { importId, fileUrl, userId } = await req.json();

  try {
    // ดาวน์โหลด image
    const imageResponse = await fetch(fileUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Google Vision OCR
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_VISION_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION' }],
          }],
        }),
      }
    );

    const visionData = await visionResponse.json();
    const rawText = visionData.responses?.[0]?.fullTextAnnotation?.text ?? '';

    // Parse transactions (ลองหลาย patterns)
    const transactions = parseTransactions(rawText);

    // Match กับ pending installments
    const { data: pendingInstallments } = await supabase
      .from('installments')
      .select('id, amount, due_date, debt_agreements!inner(borrower_id, lender_id)')
      .eq('status', 'pending')
      .or(`debt_agreements.borrower_id.eq.${userId},debt_agreements.lender_id.eq.${userId}`);

    let matchedCount = 0;
    const matchedTransactions = transactions.map((tx) => {
      // Match โดย amount และ date ใกล้เคียง (±3 วัน)
      const match = pendingInstallments?.find((inst) => {
        const amountMatch = Math.abs(Number(inst.amount) - tx.amount) < 1;
        const dateMatch = isDateNear(tx.date, inst.due_date, 3);
        return amountMatch && dateMatch;
      });

      if (match) matchedCount++;
      return { ...tx, matchedInstallmentId: match?.id };
    });

    // Update import record
    await supabase.from('statement_imports').update({
      ocr_raw_text: rawText,
      parsed_transactions: matchedTransactions,
      matched_count: matchedCount,
      status: 'done',
    }).eq('id', importId);

    return new Response(JSON.stringify({ success: true, matchedCount }));

  } catch (err) {
    await supabase.from('statement_imports').update({
      status: 'failed',
      error_message: String(err),
    }).eq('id', importId);

    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500 });
  }
});

function parseTransactions(text: string) {
  // สร้าง regex-based parser สำหรับ Thai bank statements
  const transactions = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // ตัวอย่าง KBank format: DD/MM/YY Description Amount CR/DR
    const match = line.match(/(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR|DR)?/);
    if (match) {
      transactions.push({
        date: match[1],
        description: match[2].trim(),
        amount: parseFloat(match[3].replace(/,/g, '')),
        type: match[4] === 'CR' ? 'credit' : 'debit',
      });
    }
  }

  return transactions;
}

function isDateNear(txDate: string, dueDate: string, toleranceDays: number): boolean {
  // Parse และเปรียบเทียบ dates
  try {
    const tx = new Date(txDate.replace(/(\d{2})\/(\d{2})\/(\d{2})/, '20$3-$2-$1'));
    const due = new Date(dueDate);
    const diffMs = Math.abs(tx.getTime() - due.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= toleranceDays;
  } catch {
    return false;
  }
}
```

### Testing
1. Upload screenshot ของ statement ทดสอบ
2. ตรวจ OCR text ใน `statement_imports.ocr_raw_text`
3. ตรวจว่า transactions ถูก parse ถูกต้อง (amount, date)
4. ตรวจ matching: installment ที่มี amount ตรงกัน → ต้องมี matchedInstallmentId
5. ทดสอบ failed case: ไฟล์ไม่ใช่ statement → status = 'failed'

---

## Feature 16: Custom Themes (Premium Perk)

### Why
`ThemeContext.tsx` มีอยู่แล้วพร้อม dark/light switch — เพิ่ม color themes เป็น premium perk ที่ทำง่ายและ perceived value สูงมาก

### Database Migration
```sql
-- สร้างไฟล์: supabase/migrations/YYYYMMDDHHMMSS_add_theme_to_profiles.sql

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'default';

COMMENT ON COLUMN profiles.theme_preference IS 
  'User selected color theme: default, ocean, sunset, forest, midnight';
```

### Theme Definitions

#### 5 themes ที่จะสร้าง:
```
default  → สีปัจจุบัน (สีเขียว-เทา)
ocean    → น้ำเงินเขียวทะเล (#0284c7, #22d3ee)
sunset   → ส้มอบอุ่น (#ea580c, #f59e0b)
forest   → เขียวธรรมชาติ (#16a34a, #84cc16)
midnight → ม่วงเข้ม (#7c3aed, #a78bfa)
```

### Modified Files

#### `src/contexts/ThemeContext.tsx`
```tsx
export type ColorTheme = 'default' | 'ocean' | 'sunset' | 'forest' | 'midnight';

const THEME_CSS_VARS: Record<ColorTheme, Record<string, string>> = {
  default: {
    '--primary': '142 71% 45%',       // green
    '--primary-foreground': '0 0% 100%',
    '--accent': '142 71% 45%',
    '--ring': '142 71% 45%',
  },
  ocean: {
    '--primary': '199 89% 48%',       // sky blue
    '--primary-foreground': '0 0% 100%',
    '--accent': '187 85% 53%',
    '--ring': '199 89% 48%',
  },
  sunset: {
    '--primary': '24 95% 53%',        // orange
    '--primary-foreground': '0 0% 100%',
    '--accent': '38 92% 50%',
    '--ring': '24 95% 53%',
  },
  forest: {
    '--primary': '142 69% 58%',       // green-lime
    '--primary-foreground': '0 0% 100%',
    '--accent': '84 85% 53%',
    '--ring': '142 69% 58%',
  },
  midnight: {
    '--primary': '263 70% 50%',       // violet
    '--primary-foreground': '0 0% 100%',
    '--accent': '269 64% 73%',
    '--ring': '263 70% 50%',
  },
};

// เพิ่มใน ThemeContext:
const [colorTheme, setColorTheme] = useState<ColorTheme>('default');

function applyColorTheme(theme: ColorTheme) {
  const vars = THEME_CSS_VARS[theme];
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  setColorTheme(theme);
}

// โหลด theme จาก profile เมื่อ user เข้าสู่ระบบ
useEffect(() => {
  if (profile?.theme_preference) {
    applyColorTheme(profile.theme_preference as ColorTheme);
  }
}, [profile?.theme_preference]);
```

#### `src/components/ThemePicker.tsx`
```tsx
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

type ColorTheme = 'default' | 'ocean' | 'sunset' | 'forest' | 'midnight';

const THEMES: { id: ColorTheme; label: string; preview: string; isPremium: boolean }[] = [
  { id: 'default', label: 'Default', preview: '#22c55e', isPremium: false },
  { id: 'ocean', label: 'Ocean', preview: '#0284c7', isPremium: true },
  { id: 'sunset', label: 'Sunset', preview: '#ea580c', isPremium: true },
  { id: 'forest', label: 'Forest', preview: '#16a34a', isPremium: true },
  { id: 'midnight', label: 'Midnight', preview: '#7c3aed', isPremium: true },
];

export function ThemePicker() {
  const { user } = useAuth();
  const { colorTheme, applyColorTheme } = useTheme();
  const { isPremium } = useSubscription();

  async function handleSelectTheme(themeId: ColorTheme, isPremiumTheme: boolean) {
    if (isPremiumTheme && !isPremium) {
      toast.error('Theme นี้สำหรับ Premium เท่านั้น');
      return;
    }

    applyColorTheme(themeId);

    if (user) {
      await supabase.from('profiles')
        .update({ theme_preference: themeId })
        .eq('id', user.id);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">เลือก Theme</p>
      <div className="grid grid-cols-5 gap-2">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleSelectTheme(theme.id, theme.isPremium)}
            className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all
              ${colorTheme === theme.id ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'}
              ${theme.isPremium && !isPremium ? 'opacity-50' : ''}`}
          >
            <div
              className="w-10 h-10 rounded-full"
              style={{ backgroundColor: theme.preview }}
            />
            <span className="text-xs">{theme.label}</span>
            {theme.isPremium && !isPremium && (
              <Lock className="w-3 h-3 absolute top-1 right-1 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>
      {!isPremium && (
        <p className="text-xs text-muted-foreground">
          🔒 อัพเกรดเป็น Premium เพื่อปลดล็อก 4 themes เพิ่มเติม
        </p>
      )}
    </div>
  );
}
```

#### `src/pages/Settings.tsx`
```tsx
import { ThemePicker } from '@/components/ThemePicker';

// เพิ่มใน settings sections:
<div className="space-y-3">
  <h3 className="font-medium">ธีมสี</h3>
  <ThemePicker />
</div>
```

### Testing
1. เปลี่ยน theme ด้วย free account → ใช้ได้เฉพาะ Default
2. เปลี่ยน theme ด้วย premium account → ทุก theme ใช้ได้
3. Reload หน้า → theme ยังคงเดิม (load จาก profiles)
4. ตรวจ CSS variables ถูก apply ใน `document.documentElement.style`

---

## Dependencies ระหว่าง Features

```
Feature 13 (LINE) ──────── ต้องการ LINE Developer account + API keys
Feature 13 (LINE) ──────── ต้องการ edge function link-line-account (OAuth callback)
Feature 14 (Voice) ─────── ใช้ chat-attachments bucket ✓ (มีอยู่แล้ว)
Feature 14 (Voice) ─────── ต้องการ MediaRecorder browser support
Feature 15 (OCR) ───────── ต้องการ Google Vision API key หรือ Tesseract.js
Feature 16 (Themes) ────── ต้องการ ThemeContext ✓ (มีอยู่แล้ว)
Feature 16 (Themes) ────── ต้องการ useSubscription hook ✓ (มีอยู่แล้ว)
```

## ENV Variables Summary (Phase 4)

```bash
# LINE Integration
VITE_LINE_CLIENT_ID=          # LINE Login Client ID (frontend)
LINE_CLIENT_ID=               # LINE Login Client ID (edge functions)
LINE_CLIENT_SECRET=           # LINE Login Client Secret
LINE_CHANNEL_ACCESS_TOKEN=    # LINE Messaging API Channel Access Token

# OCR (Feature 15)
GOOGLE_VISION_API_KEY=        # Google Cloud Vision API key
```

## Testing Checklist

- [ ] LINE link/unlink cycle สมบูรณ์ (OAuth flow ครบ)
- [ ] Voice recorder ทำงานบน Chrome, Safari, Firefox
- [ ] Voice file ลบได้จาก storage เมื่อ message ถูกลบ
- [ ] OCR: ทดสอบกับ statement จริงของ KBank, SCB, BBL
- [ ] OCR: graceful failure เมื่อ Vision API unreachable
- [ ] Themes: ไม่มี flash of wrong theme เมื่อ page reload
- [ ] Themes: dark mode + color theme ทำงานร่วมกันได้

---

## สรุปทุก .env ที่ต้องมีสำหรับทุก Phases

```bash
# Existing
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Phase 1 - Payment Reminders (ใช้ existing Supabase cron)
# ไม่ต้องเพิ่ม

# Phase 3 - Multi-Currency
# Exchange rate API ใช้ open.er-api.com (ไม่ต้องมี API key สำหรับ free tier)

# Phase 4
VITE_LINE_CLIENT_ID=
LINE_CLIENT_ID=
LINE_CLIENT_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
GOOGLE_VISION_API_KEY=
```
