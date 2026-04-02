import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  AVAILABLE_COLOR_THEMES,
  type ColorTheme,
  useColorTheme,
} from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";

export function ThemePicker() {
  const { user, refreshProfile } = useAuth();
  const { isPremium, isTrial, quota } = useSubscription();
  const { colorTheme, applyColorTheme } = useColorTheme();
  const hasExpandedThemeAccess = isPremium || isTrial || (quota?.credits ?? 0) > 0;

  const handleSelectTheme = async (themeId: ColorTheme) => {
    if (themeId !== "default" && !hasExpandedThemeAccess) {
      toast.info("ปลดล็อกธีมเพิ่มเติมได้เมื่อเริ่มทดลองใช้หรือสนับสนุนทีมงาน");
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
      toast.error("บันทึก theme ไม่สำเร็จ");
      return;
    }

    applyColorTheme(themeId);
    await refreshProfile();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">ธีมสี</p>
          <p className="text-xs text-muted-foreground">
            เลือกโทนสีหลักของแอปและบันทึกไว้ข้ามการรีโหลดหน้า
          </p>
        </div>
        {!isPremium ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {hasExpandedThemeAccess ? "Unlocked" : "Preview"}
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
          ธีม `Default` ใช้ได้ทุกบัญชี ส่วนธีมเพิ่มเติมจะปลดล็อกเมื่อเริ่มทดลองใช้หรือสนับสนุนทีมงาน
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSelectTheme("default")}
        >
          กลับเป็นค่าเริ่มต้น
        </Button>
      </div>
    </div>
  );
}
