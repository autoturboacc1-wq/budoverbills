import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, KeyRound, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { clearAdminSession, getValidatedAdminSession, issueAdminCodeSession, setAdminSession } from "@/utils/adminSession";

const AdminCodeLogin = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const hasAdminAccess = isAdmin || isModerator;

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      navigate("/auth", { state: { returnTo: "/admin/code" } });
    }

    let cancelled = false;

    const checkExistingSession = async () => {
      if (!user || authLoading || roleLoading || !hasAdminAccess) {
        return;
      }

      const validatedSession = await getValidatedAdminSession(user.id);
      if (cancelled) {
        return;
      }

      if (validatedSession) {
        navigate("/admin", { replace: true });
      }
    };

    if (!authLoading && !roleLoading && user && !hasAdminAccess) {
      toast.error("ไม่มีสิทธิ์เข้าถึงหน้านี้");
      navigate("/profile", { replace: true });
      return;
    }

    void checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, roleLoading, hasAdminAccess, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim()) {
      toast.error("กรุณากรอกรหัสเข้าใช้งาน");
      return;
    }

    if (!user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    if (!hasAdminAccess) {
      toast.error("ไม่มีสิทธิ์เข้าถึงหน้านี้");
      navigate("/profile", { replace: true });
      return;
    }

    setIsLoading(true);

    try {
      const result = await issueAdminCodeSession(code.trim());

      if (result.success) {
        if (result.code_role !== "admin" && result.code_role !== "moderator") {
          throw new Error("รหัสนี้ไม่มีสิทธิ์เข้าถึงหน้าผู้ดูแลระบบ");
        }
        if (!result.session_token) {
          throw new Error("ไม่สามารถสร้างเซสชันผู้ดูแลระบบได้");
        }

        // Store verification in session
        clearAdminSession();
        setAdminSession({
          sessionToken: result.session_token,
        });

        const validatedSession = await getValidatedAdminSession(user.id);
        if (!validatedSession) {
          clearAdminSession();
          throw new Error("ไม่สามารถยืนยันเซสชันผู้ดูแลระบบได้");
        }
        
        toast.success(`ยินดีต้อนรับ ${result.code_name}`);
        
        navigate("/admin");
      } else {
        toast.error(result.error || "รหัสไม่ถูกต้อง");
      }
    } catch (error) {
      console.error("Code verification error:", error);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  // Don't render if not logged in (will redirect)
  if (!user) {
    return null;
  }

  if (!hasAdminAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-primary/20 shadow-xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-2xl">ปลดล็อกสิทธิ์แอดมิน</CardTitle>
              <CardDescription className="mt-2">
                กรอกรหัสพิเศษเพื่อเข้าสู่ระบบจัดการ
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent>
            {/* Show logged in user */}
            <div className="mb-6 p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">เข้าสู่ระบบในฐานะ</p>
              <p className="font-medium">{user.email}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="password"
                    placeholder="กรอกรหัสเข้าใช้งาน"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-10 h-12 text-lg"
                    autoFocus
                    autoComplete="one-time-code"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" aria-hidden="true" />
                    กำลังตรวจสอบ...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" aria-hidden="true" />
                    ปลดล็อกสิทธิ์
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t">
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/")}
                type="button"
              >
                <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                กลับหน้าหลัก
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          หากไม่มีรหัส กรุณาติดต่อผู้ดูแลระบบ
        </p>
      </motion.div>
    </div>
  );
};

export default AdminCodeLogin;
