import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, Shield, AlertCircle, CheckCircle } from "lucide-react";
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
  description = "กรุณาใส่รหัสผ่านเพื่อยืนยันการดำเนินการ",
  confirmButtonText = "ยืนยัน",
  isLoading = false,
}: PasswordConfirmDialogProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<'password' | 'confirm' | 'text-confirm'>('password');
  const [confirmText, setConfirmText] = useState("");
  const [isOAuthUser, setIsOAuthUser] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if user is OAuth (Google) user - they don't have a password
  useEffect(() => {
    const checkAuthMethod = async () => {
      if (!open) return;
      
      setIsCheckingAuth(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Check if user has identity from OAuth provider
          const hasOAuthIdentity = user.app_metadata?.provider === 'google' ||
            user.identities?.some(identity => identity.provider === 'google');
          
          setIsOAuthUser(hasOAuthIdentity);
          
          if (hasOAuthIdentity) {
            setStep('text-confirm');
          } else {
            setStep('password');
          }
        }
      } catch (err) {
        console.error("Error checking auth method:", err);
        setStep('password');
      } finally {
        setIsCheckingAuth(false);
      }
    };
    
    checkAuthMethod();
  }, [open]);

  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      setError("กรุณาใส่รหัสผ่าน");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      // Get current user's email
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.email) {
        setError("ไม่พบข้อมูลผู้ใช้");
        return;
      }

      // Verify password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (signInError) {
        setError("รหัสผ่านไม่ถูกต้อง");
        return;
      }

      // Password verified, move to confirm step
      setStep('confirm');
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
    setPassword("");
    setConfirmText("");
    setError("");
    setStep('password');
    setShowPassword(false);
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
              <Label htmlFor="confirm-password">รหัสผ่าน</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="••••••••"
                  className={`pl-10 pr-10 h-12 ${error ? 'border-destructive' : ''}`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleVerifyPassword();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
                disabled={isVerifying || !password.trim()}
              >
                {isVerifying ? "กำลังตรวจสอบ..." : "ถัดไป"}
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
                <span>{isOAuthUser ? "ยืนยันตัวตนแล้ว" : "รหัสผ่านถูกต้อง"}</span>
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
