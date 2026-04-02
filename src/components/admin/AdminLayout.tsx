import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Loader2 } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function AdminLayout({ children, requireAdmin = false }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const [isVerified, setIsVerified] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(true);
  const isMobile = useIsMobile();
  
  // Check for admin code login (no user required)
  const isCodeVerified = sessionStorage.getItem("admin_code_verified") === "true";
  const codeRole = sessionStorage.getItem("admin_code_role");
  const isCodeAdmin = codeRole === "admin";
  const isCodeModerator = codeRole === "moderator" || codeRole === "admin";

  // Check 2FA verification
  useEffect(() => {
    const checkVerification = async () => {
      if (!user) {
        setCheckingVerification(false);
        return;
      }

      const verified = sessionStorage.getItem("admin_verified");
      if (verified === user.id) {
        setIsVerified(true);
      }
      setCheckingVerification(false);
    };

    if (!authLoading && !roleLoading) {
      checkVerification();
    }
  }, [user, authLoading, roleLoading]);

  // If verified with admin code - prioritize code-based access
  if (isCodeVerified && user) {
    // Moderator trying to access admin-only page
    if (requireAdmin && !isCodeAdmin) {
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
    
    // Code verified - allow access
    return (
      <div className="min-h-screen bg-background">
        <AdminSidebar isCodeLogin={true} isCodeAdmin={isCodeAdmin} />
        
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

  // Loading state (for database role check flow)
  if (authLoading || roleLoading || checkingVerification) {
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
  if (!isAdmin && !isModerator) {
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
  if (!isVerified) {
    navigate("/admin/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      
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
