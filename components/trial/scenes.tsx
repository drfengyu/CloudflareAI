"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Anvil,
  BedDouble,
  Beer,
  BookOpen,
  Dumbbell,
  FlaskConical,
  Gift,
  Landmark,
  LogOut,
  MessageCircle,
  MessageSquare,
  Package,
  Tent,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SAGA_CHAPTERS, SAGA_GENERAL_BY_ID } from "@/lib/trial/saga/data";
import { SAGA_NPCS, type SagaScene } from "@/lib/trial/saga/story";
import type { SagaGeneralState, SagaNode } from "@/lib/trial/saga/types";
import type { SagaQuest } from "@/lib/trial/saga/quests";
import {
  npcTraitsFor,
  paintTraitsPortrait,
  portraitTraitsFor,
  type PortraitGear,
} from "./portraits";

/**
 * 剧情与场景的 React 层：立绘、对话浮层、城中街道、营前与营帐。
 *
 * 所有画面仍然用 Canvas 现画：对话背景按 `SagaBackdrop` 分城头 / 营前 /
 * 帐内 / 酒馆 / 野地五种，城中街道另有俯视全景。城里铺子用 HTML 按钮叠在
 * 画布上，点进去就是各自的面板；这样键盘行走与画布循环完全不用改动。
 */

export function SagaPortrait({
  generalId,
  npcId,
  gear,
  width = 72,
  height = 90,
  className,
}: {
  generalId?: string | null;
  npcId?: string | null;
  gear?: PortraitGear;
  width?: number;
  height?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const wornWeapon = gear?.weapon;
  const wornArmor = gear?.armor;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(24, Math.round(width));
    const h = Math.max(30, Math.round(height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const def = generalId ? SAGA_GENERAL_BY_ID.get(generalId) : undefined;
    const traits = def ? portraitTraitsFor(def) : npcTraitsFor(npcId ?? "villager");
    paintTraitsPortrait(
      ctx,
      traits,
      def ? { weapon: wornWeapon, armor: wornArmor } : {},
      { x: 0, y: 0, w, h },
    );
  }, [generalId, npcId, wornWeapon, wornArmor, width, height]);

  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className={cn("shrink-0 rounded-md border border-border/60 bg-black/30", className)}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------- 场景画布

const storyFont = (size: number): string =>
  `600 ${size}px "Noto Serif SC", "Songti SC", "STSong", serif`;

function storySky(
  ctx: CanvasRenderingContext2D,
  backdrop: string,
  w: number,
  h: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (backdrop === "city") {
    sky.addColorStop(0, "#1a2340");
    sky.addColorStop(0.42, "#4b3f5a");
    sky.addColorStop(0.72, "#b06c4c");
    sky.addColorStop(1, "#3a2a22");
  } else if (backdrop === "camp") {
    sky.addColorStop(0, "#0b1220");
    sky.addColorStop(0.55, "#1c2740");
    sky.addColorStop(0.82, "#3b3347");
    sky.addColorStop(1, "#241d1b");
  } else if (backdrop === "field") {
    sky.addColorStop(0, "#2b3d52");
    sky.addColorStop(0.45, "#63705f");
    sky.addColorStop(0.78, "#a98f60");
    sky.addColorStop(1, "#4a4630");
  } else {
    sky.addColorStop(0, "#1e1712");
    sky.addColorStop(0.6, "#2c2116");
    sky.addColorStop(1, "#1a1410");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

function paintHills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: number,
  amp: number,
  color: string,
  phase: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 24) {
    const y =
      base -
      Math.abs(Math.sin((x / w) * Math.PI * 2.2 + phase)) * amp -
      Math.sin(x / 90 + phase) * 6;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function paintLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  scale = 1,
): void {
  const flicker = 0.72 + Math.sin(time * 3.1 + x) * 0.12;
  const glow = ctx.createRadialGradient(x, y, 1, x, y, 26 * scale);
  glow.addColorStop(0, `rgba(255,196,110,${0.42 * flicker})`);
  glow.addColorStop(1, "rgba(255,170,80,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 30 * scale, y - 30 * scale, 60 * scale, 60 * scale);
  ctx.strokeStyle = "rgba(40,30,20,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 26 * scale);
  ctx.lineTo(x, y - 12 * scale);
  ctx.stroke();
  ctx.fillStyle = "#b8523a";
  ctx.beginPath();
  ctx.ellipse(x, y, 6 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,214,140,${flicker})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintStoryBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: string,
  w: number,
  h: number,
  time: number,
): void {
  storySky(ctx, backdrop, w, h);

  if (backdrop === "camp") {
    // 星与月
    ctx.fillStyle = "rgba(226,232,244,0.7)";
    for (let i = 0; i < 42; i++) {
      const x = ((i * 137) % w) + 6;
      const y = ((i * 73) % Math.round(h * 0.5)) + 4;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    const moon = ctx.createRadialGradient(w * 0.79, h * 0.2, 4, w * 0.79, h * 0.2, 60);
    moon.addColorStop(0, "rgba(244,238,214,0.95)");
    moon.addColorStop(0.2, "rgba(232,226,204,0.5)");
    moon.addColorStop(1, "rgba(210,206,190,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(w * 0.79 - 70, h * 0.2 - 70, 140, 140);
    ctx.fillStyle = "#e9e2c8";
    ctx.beginPath();
    ctx.arc(w * 0.79, h * 0.2, 16, 0, Math.PI * 2);
    ctx.fill();
    paintHills(ctx, w, h, h * 0.72, h * 0.16, "#1b2436", 0.5);
    paintHills(ctx, w, h, h * 0.82, h * 0.12, "#131a27", 2.2);
    // 帐篷与旗帜
    const tents: [number, number, number][] = [
      [0.13, 0.86, 1],
      [0.32, 0.9, 0.8],
      [0.58, 0.84, 1.1],
      [0.78, 0.89, 0.75],
      [0.92, 0.86, 0.62],
    ];
    for (const [fx, fy, scale] of tents) {
      const tx = w * fx;
      const ty = h * fy;
      const tw = 66 * scale;
      const th = 58 * scale;
      const grad = ctx.createLinearGradient(tx, ty - th, tx, ty);
      grad.addColorStop(0, "#6b5a44");
      grad.addColorStop(1, "#3a3022");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(tx, ty - th);
      ctx.lineTo(tx + tw, ty);
      ctx.lineTo(tx - tw, ty);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(24,18,12,0.75)";
      ctx.beginPath();
      ctx.moveTo(tx, ty - th * 0.5);
      ctx.lineTo(tx + tw * 0.24, ty);
      ctx.lineTo(tx - tw * 0.24, ty);
      ctx.closePath();
      ctx.fill();
      // 旗
      ctx.strokeStyle = "#2b241b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx + tw, ty);
      ctx.lineTo(tx + tw, ty - th - 26 * scale);
      ctx.stroke();
      const wave = Math.sin(time * 2.2 + fx * 20) * 3;
      ctx.fillStyle = "#a8352c";
      ctx.beginPath();
      ctx.moveTo(tx + tw, ty - th - 26 * scale);
      ctx.lineTo(tx + tw + 26 * scale, ty - th - 21 * scale + wave);
      ctx.lineTo(tx + tw, ty - th - 6 * scale);
      ctx.closePath();
      ctx.fill();
    }
    // 篝火
    const fx = w * 0.46;
    const fy = h * 0.94;
    const fire = 0.6 + Math.sin(time * 8) * 0.2;
    const glow = ctx.createRadialGradient(fx, fy - 10, 3, fx, fy - 10, 90);
    glow.addColorStop(0, `rgba(255,170,80,${0.4 * fire})`);
    glow.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(fx - 100, fy - 110, 200, 130);
    ctx.fillStyle = "#ffca7a";
    ctx.beginPath();
    ctx.moveTo(fx, fy - 34 - Math.sin(time * 9) * 4);
    ctx.quadraticCurveTo(fx + 9, fy - 14, fx, fy);
    ctx.quadraticCurveTo(fx - 9, fy - 14, fx, fy - 34);
    ctx.fill();
    paintLantern(ctx, w * 0.24, h * 0.42, time, 0.9);
    paintLantern(ctx, w * 0.67, h * 0.46, time, 0.8);
  } else if (backdrop === "city") {
    paintHills(ctx, w, h, h * 0.62, h * 0.1, "#2a2a3c", 0.8);
    // 城墙
    const wallTop = h * 0.5;
    const wallBottom = h * 0.8;
    const wall = ctx.createLinearGradient(0, wallTop, 0, wallBottom);
    wall.addColorStop(0, "#4c463c");
    wall.addColorStop(1, "#2a2620");
    ctx.fillStyle = wall;
    ctx.fillRect(0, wallTop, w, wallBottom - wallTop);
    ctx.fillStyle = "#575046";
    for (let x = 0; x < w; x += 26) ctx.fillRect(x + 4, wallTop - 8, 16, 8);
    // 门楼
    ctx.fillStyle = "#3c362e";
    ctx.fillRect(w * 0.4, wallTop - h * 0.16, w * 0.2, h * 0.16 + 4);
    ctx.fillStyle = "#5a3a28";
    ctx.beginPath();
    ctx.moveTo(w * 0.37, wallTop - h * 0.14);
    ctx.quadraticCurveTo(w * 0.5, wallTop - h * 0.27, w * 0.63, wallTop - h * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8d0a0";
    ctx.font = storyFont(12);
    ctx.textAlign = "center";
    ctx.fillText("讨逆", w * 0.5, wallTop - h * 0.17);
    // 街道
    const street = ctx.createLinearGradient(0, wallBottom, 0, h);
    street.addColorStop(0, "#3b352a");
    street.addColorStop(1, "#221e17");
    ctx.fillStyle = street;
    ctx.fillRect(0, wallBottom, w, h - wallBottom);
    ctx.strokeStyle = "rgba(20,16,10,0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = wallBottom + i * 12 + 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // 屋檐剪影
    ctx.fillStyle = "#1a1712";
    for (const [fx, fw] of [
      [0.02, 0.16],
      [0.2, 0.12],
      [0.68, 0.14],
      [0.84, 0.14],
    ] as [number, number][]) {
      ctx.fillRect(w * fx, wallTop - h * 0.05, w * fw, h * 0.05);
      ctx.beginPath();
      ctx.moveTo(w * fx - 6, wallTop - h * 0.05);
      ctx.quadraticCurveTo(w * (fx + fw / 2), wallTop - h * 0.13, w * (fx + fw) + 6, wallTop - h * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    for (const [fx, fy] of [
      [0.16, 0.4],
      [0.34, 0.37],
      [0.66, 0.4],
      [0.86, 0.37],
    ] as [number, number][]) {
      paintLantern(ctx, w * fx, h * fy, time, 0.9);
    }
  } else if (backdrop === "tent") {
    // 帐内：帆布条纹、顶杆、军案、烛火
    ctx.fillStyle = "#2b2016";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 46) {
      ctx.fillStyle = x % 92 === 0 ? "rgba(255,220,170,0.03)" : "rgba(0,0,0,0.1)";
      ctx.fillRect(x, 0, 46, h);
    }
    const roof = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    roof.addColorStop(0, "rgba(0,0,0,0.45)");
    roof.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = roof;
    ctx.fillRect(0, 0, w, h * 0.5);
    ctx.strokeStyle = "#6b5538";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h * 0.9);
    ctx.stroke();
    ctx.strokeStyle = "rgba(220,190,140,0.18)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.1 + i * 14);
      ctx.lineTo(w * (i % 2 === 0 ? 0.05 : 0.95), h * 0.02 + i * 20);
      ctx.stroke();
    }
    // 军案
    const tableY = h * 0.78;
    ctx.fillStyle = "#4a3522";
    ctx.fillRect(w * 0.3, tableY, w * 0.4, h * 0.1);
    ctx.fillStyle = "#5c442c";
    ctx.fillRect(w * 0.3, tableY, w * 0.4, 5);
    // 地图
    ctx.save();
    ctx.translate(w * 0.5, tableY + 2);
    ctx.rotate(-0.02);
    ctx.fillStyle = "#d9c49a";
    ctx.fillRect(-w * 0.14, 0, w * 0.28, h * 0.075);
    ctx.strokeStyle = "rgba(70,50,30,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-w * 0.14, 0, w * 0.28, h * 0.075);
    ctx.beginPath();
    ctx.moveTo(-w * 0.12, h * 0.03);
    ctx.quadraticCurveTo(0, h * 0.01, w * 0.12, h * 0.045);
    ctx.stroke();
    ctx.fillStyle = "rgba(150,50,40,0.7)";
    for (const [mx, my] of [
      [-0.08, 0.03],
      [0.03, 0.055],
      [0.09, 0.02],
    ] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(w * mx, h * my, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 烛台
    for (const dx of [-0.17, 0.17] as const) {
      const cx = w * (0.5 + dx);
      const cy = tableY - 2;
      ctx.fillStyle = "#c9a15a";
      ctx.fillRect(cx - 2, cy - 14, 4, 14);
      const flame = 0.7 + Math.sin(time * 7 + dx * 30) * 0.25;
      const glow = ctx.createRadialGradient(cx, cy - 18, 1, cx, cy - 18, 26);
      glow.addColorStop(0, `rgba(255,200,120,${0.5 * flame})`);
      glow.addColorStop(1, "rgba(255,180,90,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 28, cy - 46, 56, 56);
      ctx.fillStyle = "#ffd79a";
      ctx.beginPath();
      ctx.ellipse(cx, cy - 18, 2.2, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 兵器架
    ctx.strokeStyle = "#6b5538";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.84, h * 0.42);
    ctx.lineTo(w * 0.84, h * 0.8);
    ctx.moveTo(w * 0.95, h * 0.42);
    ctx.lineTo(w * 0.95, h * 0.8);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const sx = w * (0.86 + i * 0.035);
      ctx.strokeStyle = "#4a3a26";
      ctx.beginPath();
      ctx.moveTo(sx, h * 0.4);
      ctx.lineTo(sx + 6, h * 0.78);
      ctx.stroke();
      ctx.fillStyle = "#cfc9ba";
      ctx.beginPath();
      ctx.moveTo(sx, h * 0.4);
      ctx.lineTo(sx - 3, h * 0.35);
      ctx.lineTo(sx + 3, h * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    paintLantern(ctx, w * 0.12, h * 0.3, time, 1.05);
    paintLantern(ctx, w * 0.72, h * 0.26, time, 0.85);
  } else if (backdrop === "tavern") {
    // 木墙与横梁
    ctx.fillStyle = "#2c2015";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 26) {
      ctx.fillStyle = y % 52 === 0 ? "rgba(255,220,170,0.035)" : "rgba(0,0,0,0.09)";
      ctx.fillRect(0, y, w, 26);
    }
    ctx.fillStyle = "#3f2d1c";
    for (const fx of [0.18, 0.52, 0.82]) ctx.fillRect(w * fx, 0, 14, h);
    // 窗
    const win = ctx.createLinearGradient(0, h * 0.16, 0, h * 0.4);
    win.addColorStop(0, "#16233a");
    win.addColorStop(1, "#2c3a4e");
    ctx.fillStyle = win;
    ctx.fillRect(w * 0.6, h * 0.16, w * 0.16, h * 0.24);
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.6, h * 0.16, w * 0.16, h * 0.24);
    ctx.beginPath();
    ctx.moveTo(w * 0.68, h * 0.16);
    ctx.lineTo(w * 0.68, h * 0.4);
    ctx.moveTo(w * 0.6, h * 0.28);
    ctx.lineTo(w * 0.76, h * 0.28);
    ctx.stroke();
    // 酒架与柜台
    ctx.fillStyle = "#4a3521";
    ctx.fillRect(w * 0.06, h * 0.5, w * 0.3, h * 0.34);
    ctx.fillStyle = "#5c442c";
    ctx.fillRect(w * 0.04, h * 0.47, w * 0.34, 7);
    for (let i = 0; i < 6; i++) {
      const jx = w * (0.09 + i * 0.045);
      const jy = h * 0.52;
      ctx.fillStyle = i % 2 === 0 ? "#8a6a48" : "#6f5236";
      ctx.beginPath();
      ctx.ellipse(jx, jy, 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(20,14,10,0.5)";
      ctx.fillRect(jx - 3, jy - 12, 6, 4);
    }
    // 酒桌
    for (const [fx, fy] of [
      [0.58, 0.76],
      [0.82, 0.82],
    ] as [number, number][]) {
      ctx.fillStyle = "#3f2d1c";
      ctx.beginPath();
      ctx.ellipse(w * fx, h * fy, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * fx - 4, h * fy, 8, h * 0.14);
      ctx.fillStyle = "#c9a15a";
      ctx.beginPath();
      ctx.ellipse(w * fx - 10, h * fy - 4, 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // 热气
      ctx.strokeStyle = "rgba(230,220,200,0.18)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(w * fx - 10, h * fy - 8);
      ctx.quadraticCurveTo(w * fx - 14, h * fy - 20, w * fx - 8 + Math.sin(time * 1.6 + fx * 20) * 4, h * fy - 30);
      ctx.stroke();
    }
    paintLantern(ctx, w * 0.3, h * 0.2, time, 1.1);
    paintLantern(ctx, w * 0.72, h * 0.24, time, 0.9);
    paintLantern(ctx, w * 0.92, h * 0.3, time, 0.8);
  } else {
    // 野地
    const sun = ctx.createRadialGradient(w * 0.76, h * 0.24, 6, w * 0.76, h * 0.24, 90);
    sun.addColorStop(0, "rgba(255,236,190,0.9)");
    sun.addColorStop(0.4, "rgba(255,214,150,0.3)");
    sun.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(w * 0.76 - 100, h * 0.24 - 100, 200, 200);
    paintHills(ctx, w, h, h * 0.66, h * 0.15, "#33413a", 0.4);
    paintHills(ctx, w, h, h * 0.78, h * 0.1, "#2a352b", 2.4);
    ctx.fillStyle = "#3c4632";
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.strokeStyle = "rgba(190,210,140,0.25)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      const gx = (i * 53) % w;
      const gy = h * 0.84 + ((i * 31) % Math.round(h * 0.14));
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - 2, gy - 6);
      ctx.moveTo(gx + 2, gy);
      ctx.lineTo(gx + 4, gy - 5);
      ctx.stroke();
    }
    // 旗与长枪
    for (const [fx, color] of [
      [0.2, "#7d2f2a"],
      [0.45, "#7d2f2a"],
      [0.7, "#243a5e"],
    ] as [number, string][]) {
      ctx.strokeStyle = "#241d15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * fx, h * 0.8);
      ctx.lineTo(w * fx, h * 0.3);
      ctx.stroke();
      const wave = Math.sin(time * 2 + fx * 20) * 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(w * fx, h * 0.3);
      ctx.lineTo(w * fx + 30, h * 0.34 + wave);
      ctx.lineTo(w * fx, h * 0.44);
      ctx.closePath();
      ctx.fill();
    }
  }

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.62);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

/** 对话 / 营前 / 帐内共用的背景画布；按比例自适应尺寸。 */
export function SceneCanvas({
  backdrop,
  height = 300,
  className,
}: {
  backdrop: "city" | "camp" | "tent" | "tavern" | "field";
  height?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 1920;
    canvas.height = Math.round(height * 2);
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      paintStoryBackdrop(ctx, backdrop, 960, height, (now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [backdrop, height]);
  return (
    <canvas
      ref={ref}
      style={{ aspectRatio: `960 / ${height}` }}
      className={cn("block w-full", className)}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------- 对话浮层

export function DialogueOverlay({
  scene,
  onClose,
  gearById,
}: {
  scene: SagaScene;
  onClose: () => void;
  gearById?: Record<string, PortraitGear>;
}) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState({ key: "", chars: 0 });
  const line = scene.lines[Math.min(index, scene.lines.length - 1)] ?? scene.lines[0];
  const full = line?.text ?? "";
  const last = index >= scene.lines.length - 1;
  const lineKey = `${scene.id}:${index}`;
  const chars = typed.key === lineKey ? typed.chars : 0;

  useEffect(() => {
    if (!full) return;
    const timer = window.setInterval(() => {
      setTyped((prev) => {
        const count = prev.key === lineKey ? prev.chars : 0;
        if (count >= full.length) {
          window.clearInterval(timer);
          return prev.key === lineKey ? prev : { key: lineKey, chars: full.length };
        }
        return { key: lineKey, chars: Math.min(full.length, count + 3) };
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [full, lineKey]);

  const advance = useCallback(() => {
    if (chars < full.length) {
      setTyped({ key: lineKey, chars: full.length });
      return;
    }
    if (last) {
      onClose();
      return;
    }
    setIndex((row) => row + 1);
  }, [chars, full.length, last, lineKey, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowRight") {
        event.preventDefault();
        advance();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, onClose]);

  if (!line) return null;
  const side = line.side ?? "hero";
  const gear = line.generalId ? gearById?.[line.generalId] : undefined;
  const reversed = side === "enemy";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={scene.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={advance}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-amber-900/50 bg-[#14110c] text-amber-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          <SceneCanvas backdrop={scene.backdrop} height={280} />
          <span className="absolute left-3 top-3 rounded bg-black/55 px-2 py-1 text-[11px] tracking-[0.18em] text-amber-100/90">
            {scene.title}
          </span>
          <button
            type="button"
            aria-label="关闭对话"
            onClick={onClose}
            className="absolute right-2 top-2 rounded bg-black/50 p-1.5 text-amber-100/80 transition hover:bg-black/75"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative -mt-10 px-2.5 pb-3 sm:px-4">
          <div className="rounded-lg border border-amber-900/45 bg-[#1b1610]/97 p-2.5 shadow-xl sm:p-3">
            <div className={cn("flex items-start gap-2.5 sm:gap-3", reversed && "flex-row-reverse")}>
              {side === "narrator" ? (
                <span className="flex h-[76px] w-[60px] shrink-0 items-center justify-center rounded-md border border-amber-900/40 bg-[#241b12] font-serif text-2xl text-amber-700/80">
                  记
                </span>
              ) : (
                <SagaPortrait
                  generalId={line.generalId}
                  npcId={line.npcId}
                  gear={gear}
                  width={60}
                  height={76}
                  className="border-amber-900/40"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-sm font-semibold">
                  <span
                    className={cn(
                      side === "enemy"
                        ? "text-red-300"
                        : side === "npc"
                          ? "text-emerald-200/90"
                          : side === "narrator"
                            ? "text-amber-100/60"
                            : "text-amber-200",
                    )}
                  >
                    {line.speaker}
                  </span>
                  {side === "narrator" ? <span className="text-[10px] tracking-[0.3em] text-amber-100/40">旁白</span> : null}
                </p>
                <p
                  className={cn(
                    "mt-1 min-h-[4.2em] whitespace-pre-wrap text-[13px] leading-relaxed text-amber-50/92 sm:text-sm",
                    side === "narrator" && "italic text-amber-50/70",
                  )}
                >
                  {full.slice(0, chars)}
                  {chars < full.length ? <span className="animate-pulse text-amber-300">▍</span> : null}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-100/45">
                  <span>
                    {index + 1} / {scene.lines.length} · 点击继续
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded border border-amber-900/45 px-2 py-0.5 transition hover:bg-amber-950/50"
                    >
                      跳过
                    </button>
                    <button
                      type="button"
                      onClick={advance}
                      className="rounded bg-amber-700/80 px-2.5 py-0.5 font-medium text-amber-50 transition hover:bg-amber-600/80"
                    >
                      {last && chars >= full.length ? "结束" : "继续"}
                    </button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 城中街道

export type TownSpotId =
  | "record"
  | "forge"
  | "bank"
  | "inn"
  | "herb"
  | "supply"
  | "hall"
  | "train"
  | "tent"
  | "tavern"
  | "coupon"
  | "gate";

interface TownSpot {
  id: TownSpotId;
  label: string;
  npcId?: string;
  x: number;
  y: number;
  icon: LucideIcon;
}

const TOWN_SPOTS: TownSpot[] = [
  { id: "record", label: "桃园碑", npcId: "recordkeeper", x: 16, y: 45, icon: BookOpen },
  { id: "hall", label: "编成所", npcId: "drillmaster", x: 38, y: 41, icon: Users },
  { id: "tavern", label: "酒馆", npcId: "tavernkeeper", x: 60, y: 43, icon: Beer },
  { id: "gate", label: "出城", x: 85, y: 27, icon: LogOut },
  { id: "forge", label: "铁匠铺", npcId: "blacksmith", x: 13, y: 68, icon: Anvil },
  { id: "herb", label: "药铺", npcId: "herbalist", x: 32, y: 71, icon: FlaskConical },
  { id: "supply", label: "军需帐", npcId: "quartermaster", x: 51, y: 69, icon: Package },
  { id: "inn", label: "客栈", npcId: "innkeeper", x: 70, y: 71, icon: BedDouble },
  { id: "bank", label: "钱庄", npcId: "banker", x: 26, y: 90, icon: Landmark },
  { id: "tent", label: "营帐", npcId: "tentkeeper", x: 47, y: 91, icon: Tent },
  { id: "train", label: "训练场", npcId: "trainer", x: 64, y: 91, icon: Dumbbell },
  { id: "coupon", label: "活动券", npcId: "couponkeeper", x: 82, y: 88, icon: Gift },
];

function paintTownBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  townName: string,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, "#1b2440");
  sky.addColorStop(0.55, "#51445c");
  sky.addColorStop(1, "#b57a55");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 远山与星
  ctx.fillStyle = "rgba(230,236,245,0.6)";
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(((i * 157) % w) + 4, ((i * 61) % Math.round(h * 0.3)) + 3, 1.3, 1.3);
  }
  paintHills(ctx, w, h, h * 0.36, h * 0.08, "#2a2c3d", 0.6);
  paintHills(ctx, w, h, h * 0.43, h * 0.06, "#232436", 2.1);
  // 城墙（远景横贯）
  const wallTop = h * 0.3;
  const wallBottom = h * 0.46;
  const wall = ctx.createLinearGradient(0, wallTop, 0, wallBottom);
  wall.addColorStop(0, "#4a443a");
  wall.addColorStop(1, "#2c2822");
  ctx.fillStyle = wall;
  ctx.fillRect(0, wallTop, w, wallBottom - wallTop);
  ctx.fillStyle = "#575046";
  for (let x = 0; x < w; x += 28) ctx.fillRect(x + 4, wallTop - 9, 18, 9);
  // 城门楼（出城按钮压在楼前）
  ctx.fillStyle = "#3c362e";
  ctx.fillRect(w * 0.79, wallTop - h * 0.1, w * 0.12, h * 0.1);
  ctx.fillStyle = "#5a3a28";
  ctx.beginPath();
  ctx.moveTo(w * 0.775, wallTop - h * 0.09);
  ctx.quadraticCurveTo(w * 0.85, wallTop - h * 0.19, w * 0.925, wallTop - h * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8d0a0";
  ctx.font = storyFont(14);
  ctx.textAlign = "center";
  ctx.fillText(townName, w * 0.85, wallTop - h * 0.115);
  // 灯笼串
  ctx.strokeStyle = "rgba(40,28,18,0.6)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.2);
  ctx.quadraticCurveTo(w * 0.5, h * 0.27, w, h * 0.2);
  ctx.stroke();
  for (const fx of [0.1, 0.27, 0.44, 0.61, 0.78, 0.93]) {
    paintLantern(ctx, w * fx, h * (0.22 + Math.sin(fx * Math.PI) * 0.04), time, 1.05);
  }
  // 广场
  const plaza = ctx.createLinearGradient(0, wallBottom, 0, h);
  plaza.addColorStop(0, "#5d5240");
  plaza.addColorStop(0.5, "#4a4031");
  plaza.addColorStop(1, "#2e281f");
  ctx.fillStyle = plaza;
  ctx.fillRect(0, wallBottom, w, h - wallBottom);
  ctx.strokeStyle = "rgba(24,20,14,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const y = wallBottom + ((i + 1) / 12) * (h - wallBottom);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = -6; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.5 + i * 80, wallBottom);
    ctx.lineTo(w * 0.5 + i * 150, h);
    ctx.stroke();
  }
  // 树与旗
  for (const [fx, scale] of [
    [0.045, 1],
    [0.955, 0.9],
  ] as [number, number][]) {
    const tx = w * fx;
    const ty = h * 0.62;
    ctx.fillStyle = "#3a2c1b";
    ctx.fillRect(tx - 3, ty, 6, h * 0.12);
    const crown = ctx.createRadialGradient(tx - 8, ty - 12, 4, tx, ty - 8, 42 * scale);
    crown.addColorStop(0, "#5c7a3c");
    crown.addColorStop(1, "#22331f");
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.arc(tx, ty - 12, 30 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const fx of [0.055, 0.945]) {
    ctx.strokeStyle = "#2b241b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * fx, h * 0.52);
    ctx.lineTo(w * fx, h * 0.34);
    ctx.stroke();
    const wave = Math.sin(time * 2 + fx * 30) * 3;
    ctx.fillStyle = "#a8352c";
    ctx.beginPath();
    ctx.moveTo(w * fx, h * 0.34);
    ctx.lineTo(w * fx + 26 * (fx < 0.5 ? 1 : -1), h * 0.37 + wave);
    ctx.lineTo(w * fx, h * 0.44);
    ctx.closePath();
    ctx.fill();
  }
  // 暮色压角
  const vignette = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.6);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

export function TownScene({
  chapterIndex,
  tickets,
  onPick,
  className,
}: {
  chapterIndex: number;
  tickets: number;
  onPick: (id: TownSpotId) => void;
  className?: string;
}) {
  const chapter = SAGA_CHAPTERS[Math.max(0, Math.min(SAGA_CHAPTERS.length - 1, chapterIndex))];
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 1920;
    canvas.height = 1080;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      paintTownBackdrop(ctx, 960, 540, (now - start) / 1000, chapter.town);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [chapter.town]);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <canvas ref={ref} className="block aspect-[16/9] w-full" aria-hidden />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
        <span className="rounded-lg border border-amber-900/40 bg-black/55 px-2.5 py-1 text-xs text-amber-100/90 backdrop-blur">
          {chapter.town} · 城中整备
        </span>
        <span className="rounded-lg border border-amber-900/40 bg-black/55 px-2.5 py-1 text-xs tabular-nums text-amber-100/80 backdrop-blur">
          {tickets} 张活动券
        </span>
      </div>

      <div className="absolute inset-0 z-10 hidden sm:block">
        {TOWN_SPOTS.map((spot) => {
          const Icon = spot.icon;
          const gate = spot.id === "gate";
          const npc = spot.npcId ? SAGA_NPCS[spot.npcId] : null;
          return (
            <button
              key={spot.id}
              type="button"
              onClick={() => onPick(spot.id)}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              className="group absolute -translate-x-1/2 -translate-y-1/2 focus-visible:outline-none"
            >
              <span className="relative block">
                <span
                  className="absolute -top-4 left-1/2 h-5 w-[86px] -translate-x-1/2 bg-[#6d3927] shadow-sm"
                  style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
                />
                <span
                  className={cn(
                    "flex h-14 w-[86px] flex-col items-center justify-center gap-0.5 rounded-md border-2 shadow-lg transition-transform duration-150 group-hover:-translate-y-1",
                    gate
                      ? "border-[#2c2620] bg-[#4a4036] text-amber-100 group-hover:border-amber-400/80"
                      : "border-[#3a2a1c] bg-[#e2cda2] text-[#33261a] group-hover:border-amber-500",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px] font-semibold leading-none">{spot.label}</span>
                  <span className="flex gap-1">
                    <span className={cn("h-2.5 w-1.5 rounded-sm", gate ? "bg-[#2a2118]" : "bg-[#7a5a38]")} />
                    <span
                      className={cn(
                        "h-2.5 w-1.5 rounded-sm",
                        gate ? "bg-[#2a2118]" : "bg-[#7a5a38]",
                      )}
                    />
                  </span>
                </span>
                <span className="absolute -right-1 top-3 h-3 w-1.5 rounded-sm bg-amber-400/80 shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
              </span>
              <span className="mt-1.5 block rounded bg-black/55 px-1.5 py-0.5 text-center text-[10px] text-amber-100/80 opacity-0 transition group-hover:opacity-100">
                {npc ? npc.name : "离开城池"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative z-10 border-t border-border/60 bg-[#15120d] p-2.5 sm:hidden">
        <p className="mb-2 text-xs text-amber-100/60">点一处铺子进去；出城继续行军。</p>
        <div className="grid grid-cols-2 gap-2">
          {TOWN_SPOTS.map((spot) => {
            const Icon = spot.icon;
            const npc = spot.npcId ? SAGA_NPCS[spot.npcId] : null;
            return (
              <button
                key={spot.id}
                type="button"
                onClick={() => onPick(spot.id)}
                className="flex items-center gap-2 rounded-lg border border-amber-900/35 bg-[#221b12] px-2.5 py-2 text-left text-xs text-amber-50 transition active:bg-[#2c2318]"
              >
                <Icon className="h-4 w-4 shrink-0 text-amber-300" />
                <span className="min-w-0">
                  <span className="block font-medium">{spot.label}</span>
                  <span className="block truncate text-[10px] text-amber-100/50">{npc ? npc.name : "离开城池"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-amber-900/40 bg-black/50 px-3 py-1 text-[11px] text-amber-100/60 backdrop-blur sm:block">
        点铺子进去办事 · 从城门出城接着行军
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 铺子 NPC

export function NpcIntro({ npcId }: { npcId: string }) {
  const npc = SAGA_NPCS[npcId];
  const [chat, setChat] = useState(0);
  if (!npc) return null;
  const text = chat === 0 ? npc.greeting : npc.lines[(chat - 1) % npc.lines.length];
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-amber-900/25 bg-amber-950/10 p-2.5">
      <SagaPortrait npcId={npc.id} width={44} height={56} className="border-amber-900/30" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="text-sm font-medium">
          {npc.name}
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{npc.title}</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">{text}</p>
      </div>
      <button
        type="button"
        onClick={() => setChat((value) => value + 1)}
        className="flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-[11px] transition hover:bg-muted"
      >
        <MessageCircle className="h-3 w-3" />
        聊两句
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- 军令与营帐

export function QuestBoard({ quests, compact = false }: { quests: SagaQuest[]; compact?: boolean }) {
  if (quests.length === 0) {
    return <p className="text-xs text-muted-foreground">出城之后才有军令。</p>;
  }
  const rows = compact ? quests.filter((quest) => !quest.done).slice(0, 3) : quests;
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">这一趟的军令都办完了，收兵回城便可。</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((quest) => {
        const ratio = quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 1;
        return (
          <div
            key={quest.id}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs",
              quest.done ? "border-emerald-700/40 bg-emerald-950/10" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className={cn(
                    "rounded px-1 py-0.5 text-[10px]",
                    quest.scope === "main"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                      : "bg-sky-500/10 text-sky-600 dark:text-sky-300",
                  )}
                >
                  {quest.scope === "main" ? "主线" : "支线"}
                </span>
                {quest.title}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {quest.done ? "已成" : `${quest.progress}/${quest.target}`}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{quest.desc}</p>
            <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
              <div
                className={cn("h-full", quest.done ? "bg-emerald-500" : "bg-amber-500/80")}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PartyStrip({ members }: { members: SagaGeneralState[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {members.map((member) => {
        const def = SAGA_GENERAL_BY_ID.get(member.id);
        return (
          <div key={member.id} className="rounded-lg border border-border p-1.5 text-center">
            <SagaPortrait
              generalId={member.id}
              gear={{ weapon: member.weapon, armor: member.armor }}
              width={56}
              height={70}
              className="mx-auto"
            />
            <p className="mt-1 truncate text-[11px] font-medium">{def?.name ?? member.id}</p>
            <p className="text-[10px] text-muted-foreground">Lv{member.level}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CampBanner({
  node,
  onTalk,
}: {
  node: SagaNode;
  onTalk: () => void;
}) {
  const enemies = node.enemies.slice(0, 4);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="relative">
        <SceneCanvas backdrop="camp" height={220} />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2">
          <div className="flex items-end gap-1.5">
            {enemies.map((enemy) => (
              <div key={enemy.id} className="w-[46px] text-center">
                <SagaPortrait generalId={enemy.id} width={46} height={58} />
                <p className="mt-0.5 truncate text-[10px] text-amber-50/80">{enemy.name}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onTalk}
            className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400/40 bg-black/55 px-2 py-1 text-[11px] text-amber-100 backdrop-blur transition hover:bg-black/75"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            阵前喊话
          </button>
        </div>
        <span className="absolute left-2.5 top-2.5 rounded bg-black/55 px-2 py-0.5 text-[11px] text-amber-100/90">
          {node.name}
        </span>
      </div>
    </div>
  );
}
