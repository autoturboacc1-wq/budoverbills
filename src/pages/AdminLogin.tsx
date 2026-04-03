import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import { Shield, Lock, Mail, KeyRound, ArrowLeft, AlertCircle, CheckCircle2, Timer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { BobLogo } from "@/components/BobLogo";
import { clearAdminSession, getValidatedAdminSession, issueAdminOtpSession, setAdminSession } from "@/utils/adminSession";

type LoginStep = "credentials" | "otp" | "success" | "locked";

export default function AdminLogin() {
  const OTP_RESEND_COOLDOWN_SECONDS = 60;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // OTP is now sent via email only - never stored or displayed client-side
  const [lockCountdown, setLockCountdown] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Check if already logged in as admin
  useEffect(() => {
    if (!user || roleLoading) {
      return;
    }

    if (!isAdmin && !isModerator) {
      navigate("/profile", { replace: true });
      return;
    }

    let cancelled = false;

    const checkAdminStatus = async () => {
      const validatedSession = await getValidatedAdminSession(user.id);

      if (cancelled) {
        return;
      }

      if (validatedSession) {
        navigate("/admin", { replace: true });
      }
    };
    void checkAdminStatus();

    return () => {
      cancelled = true;
    };
  }, [user, roleLoading, isAdmin, isModerator, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Sign in with email/password
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("เข้าสู่ระบบล้มเหลว");

      // Check if user is admin/moderator
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id);

      if (rolesError) throw rolesError;

      const isAdmin = roles?.some(r => r.role === "admin" || r.role === "moderator");
      
      if (!isAdmin) {
        await supabase.auth.signOut();
        throw new Error("คุณไม่มีสิทธิ์เข้าถึงหน้าผู้ดูแลระบบ");
      }

      // Generate and send OTP via email (secure - never display OTP client-side)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: otpError } = await (supabase.rpc as any)("generate_and_send_admin_otp", {
        p_user_id: authData.user.id
      }) as { data: { success: boolean; message: string; email: string } | null; error: Error | null };

      if (otpError) throw otpError;

      // Only show confirmation message - never display OTP
      toast.success("รหัส OTP ถูกส่งไปยังอีเมลของคุณแล้ว", {
        duration: 10000,
        description: "กรุณาตรวจสอบอีเมลของคุณ (รหัสจะหมดอายุใน 5 นาที)"
      });

      setStep("otp");
      
      // Log activity
      await supabase.rpc("log_activity", {
        p_user_id: authData.user.id,
        p_action_type: "admin_login_attempt",
        p_action_category: "admin"
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  // Countdown timer for lock
  useEffect(() => {
    if (lockCountdown > 0) {
      const timer = setInterval(() => {
        setLockCountdown(prev => {
          if (prev <= 1) {
            setStep("otp");
            setError("");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockCountdown]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError("กรุณากรอกรหัส OTP 6 หลัก");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("เซสชันหมดอายุ");

      const result = await issueAdminOtpSession(otp);

      if (result.success) {
        // Store verification in session
        clearAdminSession();
        if (!result.session_token) {
          throw new Error("ไม่สามารถสร้างเซสชันผู้ดูแลระบบได้");
        }
        setAdminSession({
          sessionToken: result.session_token,
        });

        const validatedSession = await getValidatedAdminSession(currentUser.id);
        if (!validatedSession) {
          clearAdminSession();
          throw new Error("ไม่สามารถยืนยันเซสชันผู้ดูแลระบบได้");
        }

        // Log successful verification
        await supabase.rpc("log_activity", {
          p_user_id: currentUser.id,
          p_action_type: "admin_login_success",
          p_action_category: "admin"
        });

        setStep("success");
        toast.success("ยืนยันตัวตนสำเร็จ!");
        
        setTimeout(() => {
          navigate("/admin");
        }, 1500);
      } else {
        // Handle different error types
        if (result.error === "locked") {
          setStep("locked");
          if (result.locked_until) {
            const lockTime = new Date(result.locked_until);
            const remaining = Math.ceil((lockTime.getTime() - Date.now()) / 1000);
            setLockCountdown(remaining > 0 ? remaining : 900);
          } else {
            setLockCountdown(900); // 15 minutes default
          }
          
          // Log lockout
          await supabase.rpc("log_activity", {
            p_user_id: currentUser.id,
            p_action_type: "admin_account_locked",
            p_action_category: "admin",
            p_is_suspicious: true
          });
        } else {
          setError(result.message || "เกิดข้อผิดพลาด");
          if (result.remaining !== undefined) {
            setRemainingAttempts(result.remaining);
          }
          setOtp("");
        }
        
        // Log failed attempt
        await supabase.rpc("log_activity", {
          p_user_id: currentUser.id,
          p_action_type: "admin_otp_failed",
          p_action_category: "admin",
          p_is_suspicious: result.error === "locked"
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) {
      toast.error(`กรุณารอ ${resendCooldown} วินาทีก่อนขอรหัสใหม่`);
      return;
    }

    setLoading(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("เซสชันหมดอายุ");

      // Generate and send new OTP via email (secure - never display OTP client-side)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("generate_and_send_admin_otp", {
        p_user_id: currentUser.id
      }) as { error: Error | null };

      if (error) throw error;

      // Only show confirmation message - never display OTP
      toast.success("รหัส OTP ใหม่ถูกส่งไปยังอีเมลของคุณแล้ว", {
        duration: 10000,
        description: "กรุณาตรวจสอบอีเมลของคุณ"
      });
      setOtp("");
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error("ไม่สามารถส่งรหัส OTP ใหม่ได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl border-primary/20">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              <BobLogo size="lg" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Shield className="w-6 h-6 text-primary" aria-hidden="true" />
              <CardTitle className="text-xl">เข้าสู่ระบบแอดมิน</CardTitle>
            </div>
            <CardDescription>
              {step === "credentials" && "เข้าสู่ระบบด้วยบัญชีแอดมิน"}
              {step === "otp" && `ยืนยันตัวตนด้วยรหัส OTP (เหลือ ${remainingAttempts} ครั้ง)`}
              {step === "success" && "ยืนยันตัวตนสำเร็จ!"}
              {step === "locked" && "บัญชีถูกล็อกชั่วคราว"}
            </CardDescription>
            
            {/* Progress indicator */}
            <div className="flex justify-center gap-2">
              {["credentials", "otp", "success"].map((s, i) => (
                <div
                  key={s}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    step === s || (step === "locked" && s === "otp")
                      ? step === "locked" ? "bg-destructive" : "bg-primary"
                      : ["credentials", "otp", "success"].indexOf(step) > i 
                        ? "bg-primary/50" 
                        : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </CardHeader>

          <CardContent>
            {step === "credentials" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">อีเมล</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="email"
                      type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                  />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">รหัสผ่าน</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="current-password"
                  />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" aria-hidden="true" />
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                </Button>
              </form>
            )}

            {step === "otp" && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <KeyRound className="w-8 h-8 text-primary" aria-hidden="true" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    กรุณากรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมลของคุณ
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    (รหัสจะหมดอายุใน 5 นาที)
                  </p>
                </div>

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
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
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" aria-hidden="true" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Button 
                    onClick={handleVerifyOtp} 
                    className="w-full" 
                    type="button"
                    disabled={loading || otp.length !== 6}
                  >
                    {loading ? "กำลังยืนยัน..." : "ยืนยันรหัส OTP"}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleResendOtp}
                    type="button"
                    disabled={loading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `ส่งรหัส OTP ใหม่ใน ${resendCooldown} วินาที` : "ส่งรหัส OTP อีกครั้ง"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setStep("credentials");
                      setError("");
                      setOtp("");
                      setRemainingAttempts(3);
                      supabase.auth.signOut();
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                    กลับ
                  </Button>
                </div>
              </div>
            )}

            {step === "locked" && (
              <div className="space-y-6">
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <Lock className="w-10 h-10 text-destructive" aria-hidden="true" />
                  </motion.div>
                  <h3 className="text-lg font-semibold text-destructive mb-2">บัญชีถูกล็อกชั่วคราว</h3>
                  <p className="text-sm text-muted-foreground">
                    กรอกรหัส OTP ผิดเกินจำนวนที่กำหนด
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    กรุณารอ 15 นาที แล้วลองใหม่อีกครั้ง
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 p-4 bg-destructive/5 rounded-lg">
                  <Timer className="w-6 h-6 text-destructive" aria-hidden="true" />
                  <span className="text-2xl font-mono font-bold text-destructive">
                    {formatTime(lockCountdown)}
                  </span>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  ระบบจะปลดล็อกอัตโนมัติเมื่อหมดเวลา
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setStep("credentials");
                    setError("");
                    setOtp("");
                    setRemainingAttempts(3);
                    supabase.auth.signOut();
                  }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                  กลับหน้าเข้าสู่ระบบ
                </Button>
              </div>
            )}

            {step === "success" && (
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto"
                >
                  <CheckCircle2 className="w-10 h-10 text-green-500" aria-hidden="true" />
                </motion.div>
                <p className="text-muted-foreground">กำลังนำคุณไปยังหน้าผู้ดูแลระบบ...</p>
              </div>
            )}

            {step === "credentials" && (
              <div className="mt-6 pt-4 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/auth")}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                  กลับไปหน้าเข้าสู่ระบบปกติ
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          🔒 การเข้าสู่ระบบนี้ใช้การยืนยันตัวตนสองขั้นตอน (2FA) เพื่อความปลอดภัย
        </p>
      </motion.div>
    </div>
    </PageTransition>
  );
}
