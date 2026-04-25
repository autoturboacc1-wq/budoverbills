import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRateLimiter } from "@/hooks/useRateLimiter";

interface PasswordConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmButtonText?: string;
  isLoading?: boolean;
}

export function PasswordConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "ยืนยันตัวตน",
  description = "กรุณายืนยันตัวตนเพื่อดำเนินการ",
  confirmButtonText = "ยืนยัน",
  isLoading = false,
}: PasswordConfirmDialogProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<'password' | 'confirm' | 'text-confirm'>('password');
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isOAuthUser, setIsOAuthUser] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const passwordVerifyLimiter = useRateLimiter("password_confirm_password_verify", {
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000,
    blockDurationMs: 15 * 60 * 1000,
  });

  // Check if user is OAuth (Google) user - they don't have a password
  useEffect(() => {
    let cancelled = false;

    const checkAuthMethod = async () => {
      if (!open) {
        setIsCheckingAuth(false);
        return;
      }
      
      setIsCheckingAuth(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (cancelled) return;
        
        if (user) {
          setUserEmail(user.email || "");
          // Check if user has identity from OAuth provider
          const hasOAuthIdentity = user.app_metadata?.provider === 'google' ||
            user.identities?.some(identity => identity.provider === 'google');
          
          if (cancelled) return;
          setIsOAuthUser(Boolean(hasOAuthIdentity));
          
          if (hasOAuthIdentity) {
            setStep('text-confirm');
          } else {
            setStep('password');
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error checking auth method:", err);
        setStep('password');
      } finally {
        if (!cancelled) {
          setIsCheckingAuth(false);
        }
      }
    };
    
    void checkAuthMethod();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      setError("กรุณากรอกรหัสผ่านปัจจุบัน");
      return;
    }

    if (!passwordVerifyLimiter.checkRateLimit()) {
      setError(`กรุณารออีก ${passwordVerifyLimiter.blockTimeRemaining} วินาที ก่อนลองใหม่`);
      return;
    }

    if (!userEmail) {
      setError("ไม่พบข้อมูลอีเมลผู้ใช้");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      // Verify the current user's password without rotating the session.
      // The RPC compares against auth.users.encrypted_password directly so
      // there's no JWT churn (signInWithPassword would issue a new session).
      const { data, error: rpcError } = await supabase.rpc(
        "verify_user_password" as never,
        { p_password: password } as never,
      );

      if (rpcError) {
        passwordVerifyLimiter.recordAttempt(false);
        if (String(rpcError.message ?? "").includes("locked")) {
          setError("ใส่รหัสผ่านผิดเกินจำนวน กรุณารอสักครู่ก่อนลองใหม่");
        } else {
          setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
        }
        return;
      }

      const result = data as { success?: boolean; reason?: string } | null;
      if (!result?.success) {
        passwordVerifyLimiter.recordAttempt(false);
        if (result?.reason === "no_password_set") {
          setError("บัญชีนี้ไม่ได้ตั้งรหัสผ่าน กรุณาเข้าสู่ระบบด้วย Google แล้วยืนยันด้วยข้อความ");
        } else {
          setError("รหัสผ่านไม่ถูกต้อง");
        }
        return;
      }

      passwordVerifyLimiter.reset();
      setStep("confirm");
    } catch (err) {
      passwordVerifyLimiter.recordAttempt(false);
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTextConfirmCheck = () => {
    if (confirmText.trim().toLowerCase() === "ยืนยัน") {
      setStep('confirm');
      setError("");
    } else {
      setError("กรุณาพิมพ์คำว่า 'ยืนยัน' ให้ถูกต้อง");
    }
  };

  const handleFinalConfirm = () => {
    onConfirm();
    handleClose();
  };

  const handleClose = () => {
    setPassword("");
    setConfirmText("");
    setError("");
    setStep('password');
    setUserEmail("");
    setIsOAuthUser(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-center font-heading">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {isOAuthUser 
              ? "กรุณาพิมพ์คำว่า 'ยืนยัน' เพื่อดำเนินการ" 
              : description
            }
          </DialogDescription>
        </DialogHeader>

        {isCheckingAuth ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : step === 'password' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <Label htmlFor="confirm-password">รหัสผ่านปัจจุบัน</Label>
              <Input
                id="confirm-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่านปัจจุบัน"
              />
              <p className="text-sm text-muted-foreground">
                เพื่อความปลอดภัย กรุณายืนยันด้วยรหัสผ่านปัจจุบันก่อนดำเนินการต่อ
              </p>
              {error && (
                <p className="text-destructive text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClose}
              >
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={handleVerifyPassword}
                disabled={isVerifying}
              >
                {isVerifying ? "กำลังตรวจสอบ..." : "ยืนยันรหัสผ่าน"}
              </Button>
            </div>
          </motion.div>
        ) : step === 'text-confirm' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <Label htmlFor="confirm-text">พิมพ์คำว่า "ยืนยัน" เพื่อดำเนินการ</Label>
              <Input
                id="confirm-text"
                type="text"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  setError("");
                }}
                placeholder="พิมพ์ ยืนยัน"
                className={`h-12 text-center text-lg ${error ? 'border-destructive' : ''}`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTextConfirmCheck();
                  }
                }}
              />
              {error && (
                <p className="text-destructive text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClose}
              >
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={handleTextConfirmCheck}
                disabled={!confirmText.trim()}
              >
                ถัดไป
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mt-4"
          >
            <div className="bg-status-paid/10 border border-status-paid/20 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-status-paid font-medium">
                <CheckCircle className="w-5 h-5" />
                <span>{isOAuthUser ? "ยืนยันตัวตนแล้ว" : "ยืนยันรหัสสำเร็จแล้ว"}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                กดยืนยันเพื่อดำเนินการต่อ
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(isOAuthUser ? 'text-confirm' : 'password')}
              >
                ย้อนกลับ
              </Button>
              <Button
                className="flex-1"
                onClick={handleFinalConfirm}
                disabled={isLoading}
              >
                {isLoading ? "กำลังดำเนินการ..." : confirmButtonText}
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
