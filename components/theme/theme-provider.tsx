"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** light/dark/system theme via next-themes (attribute="class" → .dark on <html>). */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemePresetProvider>{children}</ThemePresetProvider>
    </NextThemesProvider>
  );
}

// ── Theme preset (color scheme) — orthogonal to light/dark ──
export type ThemePreset =
  | "default"
  | "anthropic"
  | "cloudflare"
  | "ocean"
  | "emerald"
  | "violet"
  | "rose";

const PRESET_KEY = "cfai-theme-preset";

interface PresetCtx {
  preset: ThemePreset;
  setPreset: (p: ThemePreset) => void;
}
const ThemePresetContext = React.createContext<PresetCtx | null>(null);

function ThemePresetProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [preset, setPresetState] = React.useState<ThemePreset>("default");

  // Load from localStorage only on client after mount
  React.useEffect(() => {
    const stored = window.localStorage.getItem(PRESET_KEY) as ThemePreset | null;
    if (stored) {
      setPresetState(stored);
    }
    setMounted(true);
  }, []);

  // DOM sync only (no cascading setState) — apply the preset attribute.
  React.useEffect(() => {
    if (!mounted) return;
    if (preset === "default") {
      document.documentElement.removeAttribute("data-theme-preset");
    } else {
      document.documentElement.setAttribute("data-theme-preset", preset);
    }
  }, [preset, mounted]);

  const setPreset = React.useCallback((p: ThemePreset) => {
    setPresetState(p);
    window.localStorage.setItem(PRESET_KEY, p);
  }, []);

  return (
    <ThemePresetContext.Provider value={{ preset, setPreset }}>
      {children}
    </ThemePresetContext.Provider>
  );
}

export function useThemePreset(): PresetCtx {
  const ctx = React.useContext(ThemePresetContext);
  if (!ctx) throw new Error("useThemePreset must be used within ThemeProvider");
  return ctx;
}
