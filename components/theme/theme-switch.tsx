"use client";

import { Monitor, Moon, Sun, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useThemePreset,
  type ThemePreset,
} from "@/components/theme/theme-provider";
import { useEffect, useState } from "react";

const PRESETS: { id: ThemePreset; label: string }[] = [
  { id: "default", label: "默认（中性）" },
  { id: "anthropic", label: "Anthropic（暖奶油）" },
  { id: "cloudflare", label: "Cloudflare（橙）" },
];

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const { preset, setPreset } = useThemePreset();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by not rendering theme-dependent content until mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="切换主题" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="切换主题"
      >
        <Sun className="h-4 w-4 dark:hidden" />
        <Moon className="hidden h-4 w-4 dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>外观</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="h-4 w-4" /> 浅色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="h-4 w-4" /> 深色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="h-4 w-4" /> 跟随系统
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" /> 配色
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preset}
          onValueChange={(v) => setPreset(v as ThemePreset)}
        >
          {PRESETS.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              {p.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
