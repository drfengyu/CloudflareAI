import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * 红白机风格的 16×16 像素灵宠。
 *
 * 每种养成线一套四色板，4 阶起提亮、7 阶起镶金边，肉眼就能看出阶级。
 * 用 SVG 方块画，放大后仍是硬边像素，不依赖任何图片资源。
 */

const SPRITES: Record<string, string[]> = {
  ember: [
    "................",
    "A..A........A..A",
    "AA.A........A.AA",
    "AAA.A......A.AAA",
    ".AAAAAAAAAAAAAA.",
    ".ABBBBBBBBBBBBA.",
    ".ABCCBBBBBBCCBA.",
    ".ABDBBBBBBBDBBA.",
    ".ABBEEBBBBEEBBA.",
    ".ABBBBBBBBBBBBA.",
    "..ABBBBBBBBBBA..",
    "..AABBBBBBBBAA..",
    "...AABBBBBBAA...",
    "...AA.AA.AA.A...",
    "..AA..AA.AA..AA.",
    "................",
  ],
  tide: [
    "................",
    ".......AA.......",
    "......A..A......",
    "....AAAAAAAA....",
    "..AABBBBBBBBAA..",
    ".ABBBBBBBBBBBBA.",
    ".ABBCCBBBBCCBBA.",
    ".ABDBBBBBBBDBBA.",
    ".ABBEEBBBBEEBBA.",
    ".ABBBBBBBBBBBBA.",
    "..ABBBBBBBBBBA..",
    "...AAAAAAAAAA...",
    "....AA.AA.AA....",
    ".....A..A..A....",
    "................",
    "................",
  ],
  verdant: [
    "..A..........A..",
    "..A...A..A...A..",
    "..AA.AA..AA.AA..",
    "...AAAAAAAAAA...",
    "..ABBBBBBBBBBA..",
    "..ABBCCBBCCBBA..",
    "..ABDBBBBBDBBA..",
    "..ABBEEBBEEBBA..",
    "..ABBBBBBBBBBA..",
    "...ABBBBBBBBA...",
    "....AAAAAAAA....",
    "....AA....AA....",
    "....AA....AA....",
    ".....A....A.....",
    "................",
    "................",
  ],
};

type Palette = { dark: string; mid: string; light: string; lightest: string };

const PALETTES: Record<string, Palette> = {
  ember: { dark: "#3b1a0a", mid: "#b34a1f", light: "#f0a33c", lightest: "#ffe6a3" },
  tide: { dark: "#0b2545", mid: "#1f5f8b", light: "#4fb3d9", lightest: "#d6f4ff" },
  verdant: { dark: "#12351c", mid: "#2f7a3e", light: "#7ac74f", lightest: "#e4ffc9" },
};

const FALLBACK_PALETTE = PALETTES.verdant;
const GOLD = "#ffd166";

function colorFor(lineKey: string, tier: number, char: string): string | null {
  const palette = PALETTES[lineKey] ?? FALLBACK_PALETTE;
  if (char === "A") return palette.dark;
  if (char === "B") return tier >= 7 ? palette.light : palette.mid;
  if (char === "C") return tier >= 7 ? GOLD : palette.light;
  if (char === "D") return palette.dark;
  if (char === "E") return palette.lightest;
  return null;
}

interface PixelPetProps {
  lineKey: string;
  tier: number;
  size?: number;
  /** 未解锁时画成剪影。 */
  silhouette?: boolean;
  className?: string;
}

export function PixelPet({ lineKey, tier, size = 64, silhouette = false, className }: PixelPetProps) {
  const rows = SPRITES[lineKey] ?? SPRITES.verdant;
  const cells: ReactElement[] = [];
  rows.forEach((row, y) => {
    const padded = row.padEnd(16, ".").slice(0, 16);
    for (let x = 0; x < 16; x += 1) {
      const char = padded[x];
      if (char === ".") continue;
      const fill = silhouette ? "#0f380f" : colorFor(lineKey, tier, char);
      if (!fill) continue;
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1}
          height={1}
          fill={fill}
        />,
      );
    }
  });

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn("shrink-0 select-none", className)}
      style={{ imageRendering: "pixelated" }}
      aria-hidden
    >
      {cells}
    </svg>
  );
}
