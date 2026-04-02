import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Bell, 
  BellOff, 
  Shield, 
  Eye, 
  EyeOff, 
  Moon, 
  Sun, 
  ChevronRight,
  Check,
  FileText,
  Lock,
  Palette,
  Crown,
  Sparkles,
  Zap,
  Clock,
  Gift
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface SettingsState {
  notifications: {
    push: boolean;
    email: boolean;
    paymentReminders: boolean;
    agreementUpdates: boolean;
  };
  privacy: {
    showProfile: boolean;
    showActivity: boolean;
  };
  appearance: {
    darkMode: boolean;
  };
}

const defaultSettings: SettingsState = {
  notifications: {
    push: true,
    email: true,
    paymentReminders: true,
    agreementUpdates: true,
  },
  privacy: {
    showProfile: true,
    showActivity: false,
  },
  appearance: {
    darkMode: false,
  },
};

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { limits, isPremium, isLoading: subscriptionLoading, isTrial, trialDaysRemaining, hasUsedTrial, startTrial, isStartingTrial } = useSubscription();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(() => {
    const saved = localStorage.getItem("app-settings");
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem("app-settings", JSON.stringify(settings));
  }, [settings]);

  const updateNotification = (key: keyof SettingsState["notifications"], value: boolean) => {
    setSettings(prev => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
    toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const updatePrivacy = (key: keyof SettingsState["privacy"], value: boolean) => {
    setSettings(prev => ({
      ...prev,
      privacy: { ...prev.privacy, [key]: value },
    }));
    toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const toggleDarkMode = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    toast.success(newTheme === "dark" ? "เปิดโหมดมืดแล้ว" : "ปิดโหมดมืดแล้ว");
  };

  const isDarkMode = mounted && theme === "dark";

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 py-4"
        >
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <h1 className="text-xl font-heading font-semibold text-foreground">
            {t('profile.settings')}
          </h1>
        </motion.header>

        {/* Notifications Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">{t('profile.notifications')}</h2>
            </div>
          </div>
          
          <div className="divide-y divide-border">
            <div className="p-4">
              <PushNotificationToggle />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-foreground">แจ้งเตือนอีเมล</p>
                  <p className="text-xs text-muted-foreground">รับอีเมลเมื่อมีอัปเดต</p>
                </div>
              </div>
              <Switch
                checked={settings.notifications.email}
                onCheckedChange={(v) => updateNotification("email", v)}
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-foreground">แจ้งเตือนก่อนครบกำหนด</p>
                  <p className="text-xs text-muted-foreground">เตือนล่วงหน้า 1-3 วัน</p>
                </div>
              </div>
              <Switch
                checked={settings.notifications.paymentReminders}
                onCheckedChange={(v) => updateNotification("paymentReminders", v)}
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-foreground">อัปเดตข้อตกลง</p>
                  <p className="text-xs text-muted-foreground">แจ้งเมื่อมีการเปลี่ยนแปลง</p>
                </div>
              </div>
              <Switch
                checked={settings.notifications.agreementUpdates}
                onCheckedChange={(v) => updateNotification("agreementUpdates", v)}
              />
            </div>
          </div>
        </motion.section>

        {/* Privacy Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">{t('profile.privacy')}</h2>
            </div>
          </div>
          
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {settings.privacy.showProfile ? (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-foreground">แสดงโปรไฟล์</p>
                  <p className="text-xs text-muted-foreground">ให้คนอื่นค้นหาคุณได้</p>
                </div>
              </div>
              <Switch
                checked={settings.privacy.showProfile}
                onCheckedChange={(v) => updatePrivacy("showProfile", v)}
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {settings.privacy.showActivity ? (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-foreground">แสดงกิจกรรม</p>
                  <p className="text-xs text-muted-foreground">ข้อมูลหนี้ยังคงเป็นส่วนตัว</p>
                </div>
              </div>
              <Switch
                checked={settings.privacy.showActivity}
                onCheckedChange={(v) => updatePrivacy("showActivity", v)}
              />
            </div>
          </div>
        </motion.section>

        {/* Appearance Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Palette className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">ธีมและการแสดงผล</h2>
            </div>
          </div>
          
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {isDarkMode ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-foreground">โหมดมืด</p>
                  <p className="text-xs text-muted-foreground">ปรับสีพื้นหลังให้เข้มขึ้น</p>
                </div>
              </div>
              <Switch
                checked={isDarkMode}
                onCheckedChange={toggleDarkMode}
              />
            </div>
          </div>
        </motion.section>


        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden mb-6"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="font-medium text-foreground">ข้อมูลทางกฎหมาย</h2>
            </div>
          </div>
          
          <div className="divide-y divide-border">
            <Link
              to="/terms"
              className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">ข้อกำหนดการใช้งาน</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>

            <Link
              to="/privacy"
              className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">นโยบายความเป็นส่วนตัว</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>

            <Link
              to="/pdpa-consent"
              className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">การคุ้มครองข้อมูล PDPA</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          </div>
        </motion.section>

        {/* Info Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-primary/5 rounded-xl p-4 border border-primary/10"
        >
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">🔒 ความเป็นส่วนตัว: </span>
            ข้อมูลหนี้ของคุณจะแสดงเฉพาะระหว่างคู่สัญญาเท่านั้น ไม่มีใครอื่นสามารถเห็นได้
          </p>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
}
