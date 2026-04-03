import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AVAILABLE_COLOR_THEMES,
  type ColorTheme,
  useColorTheme,
} from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";

const THEME_PICKER_COPY = {
  th: {
    title: "ธีมสี",
    description: "เลือกโทนสีหลักของแอปและบันทึกไว้ข้ามการรีโหลดหน้า",
    unlocked: "Unlocked",
    preview: "Preview",
    lockedToast: "ปลดล็อกธีมเพิ่มเติมได้เมื่อเริ่มทดลองใช้หรือสนับสนุนทีมงาน",
    saveError: "บันทึก theme ไม่สำเร็จ",
    defaultNote:
      "ธีม `Default` ใช้ได้ทุกบัญชี ส่วนธีมเพิ่มเติมจะปลดล็อกเมื่อเริ่มทดลองใช้หรือสนับสนุนทีมงาน",
    resetButton: "กลับเป็นค่าเริ่มต้น",
  },
  en: {
    title: "Color theme",
    description: "Choose the app's primary color tone and keep it across page reloads.",
    unlocked: "Unlocked",
    preview: "Preview",
    lockedToast: "Unlock more themes by starting a trial or supporting the team.",
    saveError: "Failed to save theme",
    defaultNote:
      "The `Default` theme is available to every account. Extra themes unlock when you start a trial or support the team.",
    resetButton: "Reset to default",
  },
} as const;

export function ThemePicker() {
  const { user, refreshProfile } = useAuth();
  const { language } = useLanguage();
  const { isPremium, isTrial, quota } = useSubscription();
  const { colorTheme, applyColorTheme } = useColorTheme();
  const hasExpandedThemeAccess = isPremium || isTrial || (quota?.credits ?? 0) > 0;
  const copy = language === "th" ? THEME_PICKER_COPY.th : THEME_PICKER_COPY.en;

  const handleSelectTheme = async (themeId: ColorTheme) => {
    if (themeId !== "default" && !hasExpandedThemeAccess) {
      toast.info(copy.lockedToast);
      return;
    }

    if (!user) {
      applyColorTheme(themeId);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ theme_preference: themeId })
      .eq("user_id", user.id);

    if (error) {
      console.error("Error saving theme preference:", error);
      toast.error(copy.saveError);
      return;
    }

    applyColorTheme(themeId);
    await refreshProfile();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        </div>
        {!isPremium ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {hasExpandedThemeAccess ? copy.unlocked : copy.preview}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AVAILABLE_COLOR_THEMES.map((themeOption) => {
          const isActive = colorTheme === themeOption.id;

          return (
            <button
              key={themeOption.id}
              type="button"
              onClick={() => void handleSelectTheme(themeOption.id)}
              className={`rounded-2xl border p-3 text-left transition-all ${
                isActive
                  ? "border-primary bg-primary/5 shadow-card"
                  : "border-border bg-background hover:border-primary/40 hover:bg-secondary/40"
              } ${themeOption.id !== "default" && !hasExpandedThemeAccess ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {themeOption.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="h-6 w-6 rounded-full border border-black/5"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
                {isActive ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </div>

              <div className="mt-3">
                <p className="font-medium text-foreground">{themeOption.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{themeOption.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {!isPremium ? (
        <div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
          {copy.defaultNote}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSelectTheme("default")}
        >
          {copy.resetButton}
        </Button>
      </div>
    </div>
  );
}
