import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Settings, 
  Bell, 
  Shield, 
  HelpCircle, 
  LogOut, 
  ChevronRight,
  FileText,
  LogIn,
  ScrollText,
  Sun,
  Moon,
  LayoutDashboard
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NotificationSheet } from "@/components/NotificationSheet";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { AvatarUpload } from "@/components/AvatarUpload";
import { EditNameDialog } from "@/components/EditNameDialog";
import { ProfileBankAccount } from "@/components/ProfileBankAccount";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasAdminSession } from "@/utils/adminSession";
import { PageTransition } from "@/components/ux/PageTransition";

interface ProfileMenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  action: () => void;
  badge?: number;
  highlight?: boolean;
}

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, profile, signOut, isLoading } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const { unreadCount } = useNotifications();
  const { theme, setTheme } = useTheme();
  const isDarkMode = theme === "dark";
  const { isAdmin, isModerator } = useUserRole();
  const hasAdminAccess = isAdmin || isModerator;

  // Fetch real stats from database with realtime updates
  const { data: userStats, refetch: refetchStats } = useQuery({
    queryKey: ['user-profile-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Fetch agreements count - filter by specific user role
      const { data: lenderAgreements } = await supabase
        .from('debt_agreements')
        .select('id, status')
        .eq('lender_id', user.id);
      
      const { data: borrowerAgreements } = await supabase
        .from('debt_agreements')
        .select('id, status')
        .eq('borrower_id', user.id);
      
      // Combine unique agreements
      const allAgreements = [...(lenderAgreements || []), ...(borrowerAgreements || [])];
      const uniqueAgreements = allAgreements.filter((a, idx, self) => 
        idx === self.findIndex(t => t.id === a.id)
      );
      
      const totalAgreements = uniqueAgreements.length;
      const completedAgreements = uniqueAgreements.filter(a => a.status === 'completed').length;
      
      // Count by role
      const lenderCount = (lenderAgreements || []).filter(a => a.status === 'active').length;
      const borrowerCount = (borrowerAgreements || []).filter(a => a.status === 'active').length;
      
      return {
        totalAgreements,
        completedAgreements,
        lenderCount,
        borrowerCount
      };
    },
    enabled: !!user?.id,
  });

  // Realtime subscription for profile stats
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-stats-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'debt_agreements',
          filter: `lender_id=eq.${user.id}`,
        },
        () => {
          refetchStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'debt_agreements',
          filter: `borrower_id=eq.${user.id}`,
        },
        () => {
          refetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetchStats]);

  const menuItems: ProfileMenuItem[] = [
    { icon: Bell, label: t('profile.notifications'), path: "/notifications", action: () => navigate("/notifications") },
    { icon: Shield, label: t('profile.privacy'), path: "/settings", action: () => navigate("/settings") },
    { icon: FileText, label: t('profile.history'), path: "/history", action: () => navigate("/history") },
    { icon: ScrollText, label: "ข้อกำหนดการใช้งาน", path: "/terms", action: () => navigate("/terms") },
    { 
      icon: Shield, 
      label: profile?.pdpa_accepted_at ? "ยอมรับ PDPA แล้ว" : "นโยบาย PDPA", 
      path: "/pdpa-consent", 
      action: () => navigate("/pdpa-consent"),
      highlight: !!profile?.pdpa_accepted_at 
    },
    { icon: Shield, label: "นโยบายความเป็นส่วนตัว", path: "/privacy", action: () => navigate("/privacy") },
    { icon: HelpCircle, label: t('profile.help'), path: "/help", action: () => navigate("/help") },
    { icon: Settings, label: t('profile.settings'), path: "/settings", action: () => navigate("/settings") },
  ];

  const handleLogout = async () => {
    await signOut();
    toast.success(t('profile.logoutSuccess'));
  };

  const handleMenuClick = (item: ProfileMenuItem) => {
    if (item.action) {
      item.action();
    } else {
      toast.info(t('profile.featureInDev'));
    }
  };

  const displayName = profile?.display_name || user?.email?.split('@')[0] || "ผู้เยี่ยมชม";
  const displayInitial = displayName.charAt(0).toUpperCase();

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-md mx-auto px-5">
        {/* Top Header with Notification */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-end py-4"
        >
          <button 
            onClick={() => setShowNotifications(true)}
            className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors relative"
            aria-label="เปิดการแจ้งเตือน"
          >
            <Bell className="w-5 h-5 text-primary" />
            {unreadCount > 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-status-overdue text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </button>
        </motion.div>

        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-6"
        >
          {user ? (
            <AvatarUpload 
              currentAvatarUrl={profile?.avatar_url}
              displayName={displayName}
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl font-heading font-bold text-primary">{displayInitial}</span>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <h1 className="text-xl font-heading font-semibold text-foreground">
              {user ? displayName : "ผู้เยี่ยมชม"}
            </h1>
            {user && (
              <EditNameDialog
                displayName={displayName}
                firstName={profile?.first_name}
                lastName={profile?.last_name}
                phone={profile?.phone}
              />
            )}
          </div>
          {user ? (
            <>
              {(profile?.first_name || profile?.last_name) && (
                <p className="text-sm text-muted-foreground">
                  {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                </p>
              )}
              <p className="text-xs text-muted-foreground/70">{user.email}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">ยินดีต้อนรับ! สมัครสมาชิกเพื่อใช้งานเต็มรูปแบบ</p>
          )}
        </motion.div>

        {/* Guest CTA */}
        {!user && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-5 shadow-card mb-6"
          >
            <h2 className="font-medium text-primary-foreground mb-2">เริ่มต้นใช้งาน</h2>
            <p className="text-sm text-primary-foreground/80 mb-4">
              สมัครสมาชิกเพื่อสร้างข้อตกลง ติดตามหนี้ และจัดการการเงินอย่างเป็นระบบ
            </p>
            <Button
              onClick={() => navigate("/auth")}
              variant="secondary"
              className="w-full"
            >
              <LogIn className="w-4 h-4 mr-2" />
              เข้าสู่ระบบ / สมัครสมาชิก
            </Button>
          </motion.div>
        )}

        {/* Bank Account Section */}
        {user && <ProfileBankAccount />}

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-4 mb-6"
        >
          <div className="bg-card rounded-2xl p-5 shadow-card text-center">
            <p className="text-2xl font-heading font-semibold text-foreground">{userStats?.totalAgreements || 0}</p>
            <p className="text-sm text-muted-foreground">{t('profile.totalAgreements')}</p>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-card text-center">
            <p className="text-2xl font-heading font-semibold text-status-paid">{userStats?.completedAgreements || 0}</p>
            <p className="text-sm text-muted-foreground">{t('profile.closedSuccess')}</p>
          </div>
        </motion.div>

        {/* Menu */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden"
        >
          {/* Admin Menu - Only visible to Admin/Moderator */}
          {(isAdmin || isModerator) && (
            <button
              onClick={() => {
                if (hasAdminAccess && hasAdminSession(user?.id)) {
                  navigate("/admin");
                } else {
                  navigate("/admin/login");
                }
              }}
              className="w-full flex items-center justify-between p-4 border-b border-border hover:bg-secondary/50 transition-colors bg-gradient-to-r from-primary/5 to-transparent"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-5 h-5 text-primary" />
                <span className="text-foreground">ศูนย์ผู้ดูแล</span>
                <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full">
                  {isAdmin ? "แอดมิน" : "ม็อด"}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              {isDarkMode ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Sun className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="text-foreground">โหมดมืด</span>
            </div>
            <Switch
              checked={isDarkMode}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              aria-label={isDarkMode ? "ปิดโหมดมืด" : "เปิดโหมดมืด"}
            />
          </div>

          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const menuItem = item as typeof item & { highlight?: boolean };
            return (
              <button
                key={item.label}
                onClick={() => handleMenuClick(item)}
                className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${menuItem.highlight ? 'text-status-paid' : 'text-muted-foreground'}`} />
                  <span className={menuItem.highlight ? 'text-status-paid' : 'text-foreground'}>{item.label}</span>
                  {item.badge && (
                    <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            );
          })}
        </motion.div>

        {/* Logout / Login */}
        {user ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={handleLogout}
            className="w-full mt-6 flex items-center justify-center gap-2 p-4 text-status-overdue hover:bg-status-overdue/10 rounded-2xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>{t('profile.logout')}</span>
          </motion.button>
        ) : (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => navigate("/auth")}
            className="w-full mt-6 flex items-center justify-center gap-2 p-4 text-primary hover:bg-primary/10 rounded-2xl transition-colors"
          >
            <LogIn className="w-5 h-5" />
            <span>เข้าสู่ระบบ</span>
          </motion.button>
        )}
      </div>
      
      <NotificationSheet open={showNotifications} onOpenChange={setShowNotifications} />
    </div>
    </PageTransition>
  );
}
