import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { 
  Bell, 
  Shield, 
  Eye, 
  EyeOff, 
  Moon, 
  Sun, 
  ChevronRight,
  FileText,
  Lock
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { featureFlags } from "@/config/featureFlags";
import { useTheme } from "next-themes";
import { ThemePicker } from "@/components/ThemePicker";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageSection } from "@/components/ux";
import { PageTransition } from "@/components/ux/PageTransition";

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

function isSettingsState(value: unknown): value is SettingsState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SettingsState>;

  return Boolean(
    candidate.notifications &&
      candidate.privacy &&
      candidate.appearance &&
      typeof candidate.notifications.push === "boolean" &&
      typeof candidate.notifications.email === "boolean" &&
      typeof candidate.notifications.paymentReminders === "boolean" &&
      typeof candidate.notifications.agreementUpdates === "boolean" &&
      typeof candidate.privacy.showProfile === "boolean" &&
      typeof candidate.privacy.showActivity === "boolean" &&
      typeof candidate.appearance.darkMode === "boolean",
  );
}

function getInitialSettings(): SettingsState {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const saved = localStorage.getItem("app-settings");
    if (!saved) {
      return defaultSettings;
    }

    const parsed = JSON.parse(saved) as unknown;
    return isSettingsState(parsed) ? parsed : defaultSettings;
  } catch (error) {
    console.error("Failed to parse saved settings:", error);
    return defaultSettings;
  }
}

function sanitizeSettingsState(value: unknown): SettingsState | null {
  return isSettingsState(value) ? value : null;
}

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<SettingsState>(getInitialSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem("app-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!user?.id) {
      setSettingsLoaded(true);
      return;
    }

    let cancelled = false;

    const loadPersistedSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("notification_preferences, privacy_settings")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error || !data || cancelled) {
          return;
        }

        setSettings((previous) => ({
          ...previous,
          notifications: sanitizeSettingsState({
            notifications: data.notification_preferences,
            privacy: previous.privacy,
            appearance: previous.appearance,
          })?.notifications ?? previous.notifications,
          privacy: sanitizeSettingsState({
            notifications: previous.notifications,
            privacy: data.privacy_settings,
            appearance: previous.appearance,
          })?.privacy ?? previous.privacy,
        }));
      } catch (error) {
        console.error("Failed to load persisted settings:", error);
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
        }
      }
    };

    void loadPersistedSettings();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const persistSettings = async (nextSettings: SettingsState) => {
    if (!user?.id) {
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        notification_preferences: nextSettings.notifications,
        privacy_settings: nextSettings.privacy,
      })
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }
  };

  const updateNotification = (key: keyof SettingsState["notifications"], value: boolean) => {
    setSettings(prev => {
      const nextSettings = {
        ...prev,
        notifications: { ...prev.notifications, [key]: value },
      };

      void persistSettings(nextSettings).catch((error) => {
        console.error("Failed to persist notification settings:", error);
        toast.error("บันทึกการตั้งค่าไม่สำเร็จ");
      });

      return nextSettings;
    });
    toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const updatePrivacy = (key: keyof SettingsState["privacy"], value: boolean) => {
    setSettings(prev => {
      const nextSettings = {
        ...prev,
        privacy: { ...prev.privacy, [key]: value },
      };

      void persistSettings(nextSettings).catch((error) => {
        console.error("Failed to persist privacy settings:", error);
        toast.error("บันทึกการตั้งค่าไม่สำเร็จ");
      });

      return nextSettings;
    });
    toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const toggleDarkMode = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    toast.success(newTheme === "dark" ? "เปิดโหมดมืดแล้ว" : "ปิดโหมดมืดแล้ว");
  };

  const isDarkMode = mounted && theme === "dark";

  return (
    <PageTransition>
    <div className="min-h-screen pb-24">
      <div className="page-shell">
        <PageHeader
          title={t('profile.settings')}
          description="จัดการการแจ้งเตือน ความเป็นส่วนตัว การแสดงผล และสิทธิ์การใช้งานในหน้าเดียว"
          onBack={() => navigate(-1)}
        />

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <PageSection
            title="Notifications"
            description="การแจ้งเตือนบางรายการบันทึกบนอุปกรณ์นี้ ขณะที่ push notification ผูกกับสิทธิ์ของเบราว์เซอร์"
          >
            <div className="divide-y divide-border rounded-2xl border border-border/70">
            {featureFlags.pushNotificationsEnabled && (
              <div className="p-4">
                <PushNotificationToggle />
              </div>
            )}

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
                disabled={!settingsLoaded}
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
                disabled={!settingsLoaded}
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
                disabled={!settingsLoaded}
              />
            </div>
            </div>
          </PageSection>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6"
        >
          <PageSection
            title="Privacy"
            description="การตั้งค่าส่วนนี้บันทึกในอุปกรณ์ปัจจุบันและใช้ควบคุมวิธีแสดงข้อมูลใน UI"
          >
            <div className="divide-y divide-border rounded-2xl border border-border/70">
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
                disabled={!settingsLoaded}
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
                disabled={!settingsLoaded}
              />
            </div>
            </div>
          </PageSection>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mb-6"
        >
          <PageSection
            title="Appearance"
            description="โหมดมืดและธีมสีจะซิงก์ตามบัญชีเมื่อเป็นการตั้งค่าที่รองรับ"
          >
            <div className="divide-y divide-border rounded-2xl border border-border/70">
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

            <div className="p-4">
              <ThemePicker />
            </div>
            </div>
          </PageSection>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          <PageSection
            title="Legal"
            description="เอกสารสำคัญและนโยบายที่เกี่ยวข้องกับการใช้งานระบบ"
          >
            <div className="divide-y divide-border rounded-2xl border border-border/70">
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
          </PageSection>
        </motion.section>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="surface-panel"
        >
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">ความเป็นส่วนตัว: </span>
            ข้อมูลหนี้ของคุณจะแสดงเฉพาะระหว่างคู่สัญญาเท่านั้น ไม่มีใครอื่นสามารถเห็นได้
          </p>
        </motion.div>
      </div>

    </div>
    </PageTransition>
  );
}
