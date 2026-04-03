import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Loader2 } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { clearAdminSession, getValidatedAdminSession, type AdminSessionDetails } from "@/utils/adminSession";

interface AdminLayoutProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function AdminLayout({ children, requireAdmin = false }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const isMobile = useIsMobile();
  const hasAdminAccess = isAdmin || isModerator;
  const [adminSession, setAdminSession] = useState<AdminSessionDetails | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    if (authLoading || roleLoading) {
      return;
    }

    if (!user || !hasAdminAccess) {
      setAdminSession(null);
      setSessionLoading(false);
      return;
    }

    let cancelled = false;
    setSessionLoading(true);

    void (async () => {
      const validatedSession = await getValidatedAdminSession(user.id);

      if (cancelled) {
        return;
      }

      if (!validatedSession) {
        clearAdminSession();
      }

      setAdminSession(validatedSession);
      setSessionLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, roleLoading, user, hasAdminAccess]);

  const isCodeLogin = adminSession?.verifiedVia === "code";
  const isCodeAdmin = isCodeLogin && adminSession?.codeRole === "admin";

  // Loading state (for database role check flow)
  if (authLoading || roleLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in with code and no user
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">กรุณาเข้าสู่ระบบ</h2>
            <p className="text-muted-foreground mb-4">
              คุณต้องเข้าสู่ระบบเพื่อเข้าถึงหน้านี้
            </p>
            <Button onClick={() => navigate("/auth")}>เข้าสู่ระบบ</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No admin/moderator role
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-muted-foreground mb-4">
              เฉพาะ Admin และ Moderator เท่านั้น
            </p>
            <Button onClick={() => navigate("/profile")}>
              กลับหน้าโปรไฟล์
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Requires admin but user is only moderator
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-muted-foreground mb-4">
              เฉพาะ Admin เท่านั้นที่สามารถเข้าถึงหน้านี้
            </p>
            <Button onClick={() => navigate("/admin")}>กลับหน้าแอดมิน</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not verified with 2FA
  if (!adminSession) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar adminSession={adminSession} isCodeLogin={isCodeLogin} isCodeAdmin={isCodeAdmin} />
      
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "min-h-screen transition-all duration-200",
          isMobile ? "pl-0 pt-16" : "pl-64"
        )}
      >
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          {children}
        </div>
      </motion.main>
    </div>
  );
}
