import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { useAuth } from "@/contexts/AuthContext";

interface ThemeProviderProps {
  children: ReactNode;
}

const COLOR_THEME_STORAGE_KEY = "app-color-theme";

export type ColorTheme = "default" | "ocean" | "sunset" | "forest" | "midnight";

type ThemeDefinition = {
  id: ColorTheme;
  label: string;
  description: string;
  swatches: [string, string];
};

type ThemeTokenMap = Record<string, string>;

const THEME_CSS_VARS: Record<ColorTheme, ThemeTokenMap> = {
  default: {
    "--primary": "35 85% 55%",
    "--primary-foreground": "40 33% 99%",
    "--accent": "150 25% 88%",
    "--accent-foreground": "150 30% 25%",
    "--ring": "35 85% 55%",
    "--sidebar-primary": "35 85% 55%",
    "--sidebar-primary-foreground": "40 33% 99%",
    "--sidebar-ring": "35 85% 55%",
    "--chat-bubble-me": "35 85% 55%",
    "--chat-bubble-me-foreground": "40 33% 99%",
    "--gradient-primary": "linear-gradient(135deg, hsl(35 85% 55%) 0%, hsl(30 80% 50%) 100%)",
  },
  ocean: {
    "--primary": "199 89% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "187 85% 90%",
    "--accent-foreground": "199 70% 24%",
    "--ring": "199 89% 48%",
    "--sidebar-primary": "199 89% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "199 89% 48%",
    "--chat-bubble-me": "199 89% 48%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(199 89% 48%) 0%, hsl(187 85% 53%) 100%)",
  },
  sunset: {
    "--primary": "24 95% 53%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "38 92% 90%",
    "--accent-foreground": "24 72% 26%",
    "--ring": "24 95% 53%",
    "--sidebar-primary": "24 95% 53%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "24 95% 53%",
    "--chat-bubble-me": "24 95% 53%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(24 95% 53%) 0%, hsl(38 92% 50%) 100%)",
  },
  forest: {
    "--primary": "142 69% 42%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "84 70% 88%",
    "--accent-foreground": "142 50% 20%",
    "--ring": "142 69% 42%",
    "--sidebar-primary": "142 69% 42%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "142 69% 42%",
    "--chat-bubble-me": "142 69% 42%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(142 69% 42%) 0%, hsl(84 70% 48%) 100%)",
  },
  midnight: {
    "--primary": "263 70% 50%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "269 64% 88%",
    "--accent-foreground": "263 55% 24%",
    "--ring": "263 70% 50%",
    "--sidebar-primary": "263 70% 50%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "263 70% 50%",
    "--chat-bubble-me": "263 70% 50%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(263 70% 50%) 0%, hsl(269 64% 66%) 100%)",
  },
};

export const AVAILABLE_COLOR_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "โทนอุ่นเดิมของแอป",
    swatches: ["#f59e0b", "#d97706"],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "น้ำเงินสดและฟ้าน้ำทะเล",
    swatches: ["#0ea5e9", "#22d3ee"],
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "ส้มทองอุ่นแบบยามเย็น",
    swatches: ["#f97316", "#f59e0b"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "เขียวธรรมชาติคอนทราสต์นุ่ม",
    swatches: ["#16a34a", "#84cc16"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "ม่วงเข้มแบบกลางคืน",
    swatches: ["#7c3aed", "#a78bfa"],
  },
];

interface ColorThemeContextValue {
  colorTheme: ColorTheme;
  applyColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | undefined>(undefined);

function isColorTheme(value: string | null | undefined): value is ColorTheme {
  return value === "default" || value === "ocean" || value === "sunset" || value === "forest" || value === "midnight";
}

function applyColorThemeVariables(theme: ColorTheme) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const themeVariables = THEME_CSS_VARS[theme];

  Object.entries(themeVariables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.dataset.colorTheme = theme;
}

function ColorThemeBridge({ children }: ThemeProviderProps) {
  const { profile } = useAuth();
  const [colorTheme, setColorTheme] = useState<ColorTheme>("default");

  const applyColorTheme = useCallback((theme: ColorTheme) => {
    setColorTheme(theme);
    applyColorThemeVariables(theme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  }, []);

  useLayoutEffect(() => {
    const savedTheme = localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    applyColorTheme(isColorTheme(savedTheme) ? savedTheme : "default");
  }, [applyColorTheme]);

  useLayoutEffect(() => {
    if (!isColorTheme(profile?.theme_preference)) {
      return;
    }

    applyColorTheme(profile.theme_preference);
  }, [applyColorTheme, profile?.theme_preference]);

  const value = useMemo(
    () => ({
      colorTheme,
      applyColorTheme,
    }),
    [applyColorTheme, colorTheme],
  );

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange={false}
    >
      <ColorThemeBridge>{children}</ColorThemeBridge>
    </NextThemesProvider>
  );
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);

  if (!context) {
    throw new Error("useColorTheme must be used within ThemeProvider");
  }

  return context;
}
