import { useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BobLogo } from "@/components/BobLogo";
import { getSafeInternalPath } from "@/utils/navigation";
import { getRequiredOnboardingPath } from "@/utils/onboardingGuard";
import { PageTransition } from "@/components/ux/PageTransition";

export default function Auth() {
  const { signInWithGoogle, user, profile, isPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as { from?: { pathname?: string }; returnTo?: string } | null;
  const fromQuery = new URLSearchParams(location.search).get("from");
  const from = getSafeInternalPath(locationState?.from?.pathname || locationState?.returnTo || fromQuery || "/");
  const isRecoveryCallback = new URLSearchParams(location.search).get("type") === "recovery";

  useEffect(() => {
    const checkRoleAndRedirect = async () => {
      if (user && profile !== undefined) {
        if (isPasswordRecovery || isRecoveryCallback) {
          return;
        }

        const requiredOnboardingPath = getRequiredOnboardingPath(profile, from);
        if (requiredOnboardingPath) {
          navigate(requiredOnboardingPath, { replace: true });
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
  }, [user, profile, navigate, from, isPasswordRecovery, isRecoveryCallback]);

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle(from);
    if (error) {
      toast.error("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google");
      console.error("Google sign in error:", error);
    }
  };

  return (
    <PageTransition>
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

      <div className="page-shell flex-1">
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
              เข้าสู่ระบบด้วย Google
            </h1>
            <p className="text-muted-foreground mt-2">
              ใช้บัญชี Google เพื่อสมัครและเข้าสู่ระบบ Bud Over Bills
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
          </div>

          <div className="surface-panel mt-5">
            <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
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
    </PageTransition>
  );
}
