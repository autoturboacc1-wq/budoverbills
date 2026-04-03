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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

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
  const [step, setStep] = useState<'reauth-request' | 'reauth-code' | 'confirm' | 'text-confirm'>('reauth-request');
  const [confirmText, setConfirmText] = useState("");
  const [reauthCode, setReauthCode] = useState("");
  const [isOAuthUser, setIsOAuthUser] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState("");

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
            setStep('reauth-request');
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error checking auth method:", err);
        setStep('reauth-request');
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

  const handleSendReauthCode = async () => {
    setIsVerifying(true);
    setError("");

    try {
      const { error: reauthError } = await supabase.auth.reauthenticate();

      if (reauthError) {
        setError(reauthError.message || "ไม่สามารถส่งรหัสยืนยันได้");
        return;
      }

      toast.success("ส่งรหัสยืนยันไปยังอีเมลของคุณแล้ว");
      setStep("reauth-code");
    } catch (err) {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyReauthCode = async () => {
    if (reauthCode.length < 6) {
      setError("กรุณากรอกรหัสยืนยัน");
      return;
    }

    if (!userEmail) {
      setError("ไม่พบข้อมูลอีเมลผู้ใช้");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: reauthCode.trim(),
        type: "email",
      });

      if (verifyError) {
        setError("รหัสยืนยันไม่ถูกต้อง");
        return;
      }

      setStep("confirm");
    } catch (err) {
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
    setConfirmText("");
    setReauthCode("");
    setError("");
    setStep('reauth-request');
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
        ) : step === 'reauth-request' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                เพื่อความปลอดภัย เราจะส่งรหัสยืนยันไปยังอีเมลของคุณก่อนดำเนินการต่อ
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
                onClick={handleSendReauthCode}
                disabled={isVerifying}
              >
                {isVerifying ? "กำลังส่ง..." : "ส่งรหัสยืนยัน"}
              </Button>
            </div>
          </motion.div>
        ) : step === 'reauth-code' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mt-4"
          >
            <div className="space-y-2">
              <Label>กรอกรหัสยืนยัน 6 หลัก</Label>
              <InputOTP
                maxLength={6}
                value={reauthCode}
                onChange={(value) => {
                  setReauthCode(value);
                  setError("");
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
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
                onClick={() => setStep("reauth-request")}
              >
                กลับ
              </Button>
              <Button
                className="flex-1"
                onClick={handleVerifyReauthCode}
                disabled={isVerifying || reauthCode.length < 6}
              >
                {isVerifying ? "กำลังตรวจสอบ..." : "ยืนยันรหัส"}
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
                onClick={() => setStep(isOAuthUser ? 'text-confirm' : 'reauth-code')}
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
