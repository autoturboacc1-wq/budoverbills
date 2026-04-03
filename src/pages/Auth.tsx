import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useRateLimiter } from "@/hooks/useRateLimiter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { BobLogo } from "@/components/BobLogo";
import { getSafeInternalPath } from "@/utils/navigation";
import { InlineValidationMessage } from "@/components/ux";

const emailSchema = z.string().email("อีเมลไม่ถูกต้อง");
const passwordSchema = z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isNewSignup, setIsNewSignup] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { signIn, signUp, signInWithGoogle, user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Rate limiting for login attempts
  const { 
    isBlocked, 
    remainingAttempts, 
    blockTimeRemaining, 
    recordAttempt 
  } = useRateLimiter('auth_login', {
    maxAttempts: 5,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 5 * 60 * 1000, // 5 minutes
  });

  const locationState = location.state as { from?: { pathname?: string }; returnTo?: string } | null;
  const fromQuery = new URLSearchParams(location.search).get("from");
  const from = getSafeInternalPath(locationState?.from?.pathname || locationState?.returnTo || fromQuery || "/");

  useEffect(() => {
    const checkRoleAndRedirect = async () => {
      if (user && profile !== undefined) {
        // If new signup, go to personal info collection first
        if (isNewSignup) {
          navigate("/personal-info", { replace: true });
          return;
        }
        
        // If user hasn't filled personal info (no first_name), redirect there
        if (profile && !profile.first_name) {
          navigate("/personal-info", { replace: true });
          return;
        }
        
        // If user hasn't accepted PDPA yet, redirect to PDPA consent
        if (profile && !profile.pdpa_accepted_at) {
          navigate("/pdpa-consent", { replace: true });
          return;
        }
        
        if (profile?.pdpa_accepted_at) {
          // Check if user is admin or moderator
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id);
          
          const userRoles = (roles || []).map(r => r.role);
          const isAdminOrMod = userRoles.includes("admin") || userRoles.includes("moderator");
          
          if (isAdminOrMod) {
            // Redirect admin/moderator to admin dashboard
            navigate("/admin", { replace: true });
          } else {
            navigate(from, { replace: true });
          }
        }
      }
    };
    
    checkRoleAndRedirect();
  }, [user, profile, navigate, from, isNewSignup]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    try {
      emailSchema.parse(email);
    } catch (e) {
      newErrors.email = "อีเมลไม่ถูกต้อง";
    }

    try {
      passwordSchema.parse(password);
    } catch (e) {
      newErrors.password = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check rate limit for login
    if (isLogin && isBlocked) {
      toast.error(`กรุณารอ ${blockTimeRemaining} วินาที ก่อนลองอีกครั้ง`);
      return;
    }

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          // Record failed attempt
          const result = recordAttempt(false);
          
          if (error.message.includes("Invalid login")) {
            toast.error(`อีเมลหรือรหัสผ่านไม่ถูกต้อง ${result.message ? `(${result.message})` : ''}`);
          } else {
            toast.error(error.message);
          }
        } else {
          // Record successful attempt (resets counter)
          recordAttempt(true);
          toast.success("เข้าสู่ระบบสำเร็จ");
        }
      } else {
        const { error } = await signUp(email, password, displayName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("อีเมลนี้ถูกใช้งานแล้ว");
          } else {
            toast.error(error.message);
          }
        } else {
          // Show email confirmation screen
          setShowEmailConfirmation(true);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle(from);
    if (error) {
      toast.error("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google");
      console.error("Google sign in error:", error);
    }
  };

  const handleLineSignIn = async () => {
    toast.info("การเข้าสู่ระบบด้วย LINE กำลังพัฒนา");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(email);
    } catch {
      setErrors({ email: "กรุณากรอกอีเมลที่ถูกต้อง" });
      return;
    }
    
    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth?type=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      
      if (error) {
        toast.error("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
      } else {
        setResetEmailSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password Screen
  if (showForgotPassword) {
    if (resetEmailSent) {
      return (
        <div className="min-h-screen bg-gradient-hero flex flex-col">
          <div className="p-4">
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                }}
                type="button"
                aria-label="กลับ"
                className="p-2 -ml-2 hover:bg-secondary/50 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
              </button>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center px-6 pb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-sm mx-auto w-full text-center"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <MailCheck className="w-10 h-10 text-primary" aria-hidden="true" />
              </div>
              
              <h1 className="text-2xl font-heading font-semibold text-foreground mb-3">
                ตรวจสอบอีเมลของคุณ
              </h1>
              
              <p className="text-muted-foreground mb-2">
                เราได้ส่งลิงก์รีเซ็ตรหัสผ่านไปที่
              </p>
              <p className="font-medium text-foreground mb-6">
                {email}
              </p>
              
              <div className="bg-secondary/50 rounded-xl p-4 mb-6">
                <p className="text-sm text-muted-foreground">
                  กรุณาคลิกลิงก์ในอีเมลเพื่อตั้งรหัสผ่านใหม่
                  <br />
                  หากไม่พบอีเมล กรุณาตรวจสอบโฟลเดอร์จดหมายขยะ (Spam)
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                  setIsLogin(true);
                }}
              >
                กลับไปหน้าเข้าสู่ระบบ
              </Button>
            </motion.div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <div className="p-4">
          <button
            onClick={() => setShowForgotPassword(false)}
            type="button"
            aria-label="กลับ"
            className="p-2 -ml-2 hover:bg-secondary/50 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-sm mx-auto w-full"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-primary" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-heading font-semibold text-foreground">
                ลืมรหัสผ่าน?
              </h1>
              <p className="text-muted-foreground mt-2">
                กรอกอีเมลที่ใช้สมัครสมาชิก เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้คุณ
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <Label htmlFor="resetEmail" className="text-foreground">
                  อีเมล
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="resetEmail"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrors({});
                    }}
                    placeholder="name@example.com"
                    className={`pl-10 h-12 ${errors.email ? "border-destructive" : ""}`}
                    autoComplete="email"
                  />
                </div>
                {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base" 
                disabled={isLoading}
              >
                {isLoading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
              </Button>
            </form>

            <p className="text-center text-muted-foreground mt-6">
              จำรหัสผ่านได้แล้ว?{" "}
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="text-primary font-medium hover:underline"
              >
                เข้าสู่ระบบ
              </button>
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Email Confirmation Screen
  if (showEmailConfirmation) {
    return (
      <div className="min-h-screen bg-gradient-hero flex flex-col">
        <div className="p-4">
          <button
            onClick={() => setShowEmailConfirmation(false)}
            type="button"
            aria-label="กลับ"
            className="p-2 -ml-2 hover:bg-secondary/50 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center px-6 pb-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-sm mx-auto w-full text-center"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <MailCheck className="w-10 h-10 text-primary" aria-hidden="true" />
            </div>
            
            <h1 className="text-2xl font-heading font-semibold text-foreground mb-3">
              ยืนยันอีเมลของคุณ
            </h1>
            
            <p className="text-muted-foreground mb-2">
              เราได้ส่งลิงก์ยืนยันไปที่
            </p>
            <p className="font-medium text-foreground mb-6">
              {email}
            </p>
            
            <div className="bg-secondary/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-muted-foreground">
                กรุณาคลิกลิงก์ในอีเมลเพื่อยืนยันบัญชีของคุณ
                <br />
                หากไม่พบอีเมล กรุณาตรวจสอบโฟลเดอร์จดหมายขยะ (Spam)
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowEmailConfirmation(false);
                setIsLogin(true);
              }}
            >
              กลับไปหน้าเข้าสู่ระบบ
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="p-4">
        <button
          onClick={() => navigate(-1)}
          type="button"
          aria-label="กลับ"
          className="p-2 -ml-2 hover:bg-secondary/50 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
        </button>
      </div>

      <div className="page-shell flex-1 max-w-lg px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="surface-panel mb-5 text-center">
            <div className="flex justify-center mb-4">
              <BobLogo size="lg" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              การเข้าถึงแบบปลอดภัย
            </p>
            <h1 className="mt-1 text-2xl font-heading font-semibold text-foreground">
              {isLogin ? "เข้าสู่ระบบอย่างปลอดภัย" : "สร้างบัญชี Bud Over Bills"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {isLogin
                ? "เข้าถึงข้อตกลง การชำระ และหลักฐานของคุณในมุมมองเดียว"
                : "เริ่มต้นด้วยบัญชีสำหรับจัดการข้อตกลงทางการเงินอย่างเป็นระบบ"}
            </p>
          </div>

          <div className="surface-panel space-y-3 mb-5">
            <Button variant="outline" className="w-full h-12 text-base" onClick={handleGoogleSignIn} type="button">
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              เข้าสู่ระบบด้วย Google
            </Button>

            <Button
              variant="outline"
              className="w-full h-12 text-base bg-[#06C755] hover:bg-[#06C755]/90 text-white border-[#06C755]"
              onClick={handleLineSignIn}
              type="button"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              เข้าสู่ระบบด้วย LINE
            </Button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background text-muted-foreground">หรือใช้อีเมลและรหัสผ่าน</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="surface-panel space-y-4">
            {!isLogin && (
              <div>
                <Label htmlFor="displayName" className="text-foreground">
                  ชื่อที่แสดง
                </Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="ชื่อของคุณ"
                    className="pl-10 h-12"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="email" className="text-foreground">
                อีเมล
              </Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={`pl-10 h-12 ${errors.email ? "border-destructive" : ""}`}
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
            </div>

            <div>
              <Label htmlFor="password" className="text-foreground">
                รหัสผ่าน
              </Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`pl-10 pr-10 h-12 ${errors.password ? "border-destructive" : ""}`}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-destructive text-sm mt-1">{errors.password}</p>
              )}
              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setErrors({});
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  ลืมรหัสผ่าน?
                </button>
              )}
            </div>

            {isLogin && isBlocked && (
              <InlineValidationMessage
                message={`ลองผิดเกินกำหนด กรุณารอ ${blockTimeRemaining} วินาที`}
              />
            )}

            {isLogin && !isBlocked && remainingAttempts < 5 && remainingAttempts > 0 && (
              <InlineValidationMessage
                tone="warning"
                message={`เหลือโอกาสอีก ${remainingAttempts} ครั้งก่อนระบบพักการลองชั่วคราว`}
              />
            )}

            <Button 
              type="submit" 
              className="w-full h-12 text-base" 
              disabled={isLoading || (isLogin && isBlocked)}
            >
              {isLoading ? "กำลังดำเนินการ..." : isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </Button>
          </form>

          <div className="surface-panel mt-5">
            <p className="text-center text-muted-foreground">
            {isLogin ? "ยังไม่มีบัญชี?" : "มีบัญชีแล้ว?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
              }}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
            </button>
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground transition-colors">
                ข้อกำหนดการใช้งาน
              </Link>
              <span>•</span>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                นโยบายความเป็นส่วนตัว
              </Link>
              <span>•</span>
              <Link to="/pdpa-consent" className="hover:text-foreground transition-colors">
                PDPA
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
