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
    "--primary": "219 91% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "214 100% 94%",
    "--accent-foreground": "219 91% 30%",
    "--ring": "219 91% 48%",
    "--sidebar-primary": "219 91% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "219 91% 48%",
    "--chat-bubble-me": "219 91% 48%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(219 91% 52%) 0%, hsl(219 91% 44%) 100%)",
  },
  ocean: {
    "--primary": "219 91% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "214 100% 94%",
    "--accent-foreground": "219 91% 30%",
    "--ring": "219 91% 48%",
    "--sidebar-primary": "219 91% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "219 91% 48%",
    "--chat-bubble-me": "219 91% 48%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(219 91% 52%) 0%, hsl(219 91% 44%) 100%)",
  },
  sunset: {
    "--primary": "219 91% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "214 100% 94%",
    "--accent-foreground": "219 91% 30%",
    "--ring": "219 91% 48%",
    "--sidebar-primary": "219 91% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "219 91% 48%",
    "--chat-bubble-me": "219 91% 48%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(219 91% 52%) 0%, hsl(219 91% 44%) 100%)",
  },
  forest: {
    "--primary": "219 91% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "214 100% 94%",
    "--accent-foreground": "219 91% 30%",
    "--ring": "219 91% 48%",
    "--sidebar-primary": "219 91% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "219 91% 48%",
    "--chat-bubble-me": "219 91% 48%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(219 91% 52%) 0%, hsl(219 91% 44%) 100%)",
  },
  midnight: {
    "--primary": "219 91% 48%",
    "--primary-foreground": "0 0% 100%",
    "--accent": "214 100% 94%",
    "--accent-foreground": "219 91% 30%",
    "--ring": "219 91% 48%",
    "--sidebar-primary": "219 91% 48%",
    "--sidebar-primary-foreground": "0 0% 100%",
    "--sidebar-ring": "219 91% 48%",
    "--chat-bubble-me": "219 91% 48%",
    "--chat-bubble-me-foreground": "0 0% 100%",
    "--gradient-primary": "linear-gradient(135deg, hsl(219 91% 52%) 0%, hsl(219 91% 44%) 100%)",
  },
};

export const AVAILABLE_COLOR_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "ฟ้าโลโก้ Bud Over Bills",
    swatches: ["#0b63ea", "#1d9bf0"],
  },
  {
    id: "ocean",
    label: "Sky",
    description: "ฟ้าสว่างบนพื้นขาว",
    swatches: ["#0b63ea", "#dbeafe"],
  },
  {
    id: "sunset",
    label: "Blue Mist",
    description: "ฟ้าอ่อนแบบนุ่ม",
    swatches: ["#1d9bf0", "#eff6ff"],
  },
  {
    id: "forest",
    label: "Clean Blue",
    description: "ขาวสะอาดและน้ำเงินชัด",
    swatches: ["#0b63ea", "#ffffff"],
  },
  {
    id: "midnight",
    label: "Navy",
    description: "น้ำเงินเข้มและขาว",
    swatches: ["#123c8c", "#ffffff"],
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
