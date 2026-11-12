import type { SagaBattleEvent, SagaBattleState } from "@/lib/trial/saga/types";

/**
 * 三国讨逆传的 Canvas 美术：城镇长街与回合战斗两张场景。
 *
 * 内部按 960×540 绘制（对外 16:9 自适应），全部用渐变与几何形状原创绘制，
 * 走吞食天地 2 那种厚重的古战场插画风：暖色天光、墨色山影、金边木牌，
 * 不做硬像素化，靠光影与层次撑住观感。
 */

export const VIEW_W = 960;
export const VIEW_H = 540;
const GROUND_Y = 436;
export const WORLD_W = 2080;

export type TownSpotId = "record" | "forge" | "bank" | "herb" | "supply" | "hall" | "gate";

export interface TownSpot {
  id: TownSpotId;
  label: string;
  hint: string;
  x: number;
  w: number;
  h: number;
}

export const TOWN_SPOTS: TownSpot[] = [
  { id: "record", label: "桃园碑", hint: "查看存档、武将与图鉴", x: 96, w: 132, h: 150 },
  { id: "forge", label: "铁匠铺", hint: "用金币打造武器与防具", x: 366, w: 214, h: 190 },
  { id: "bank", label: "钱庄", hint: "金币与 tcr 双向兑换", x: 650, w: 190, h: 182 },
  { id: "herb", label: "药铺", hint: "用金币购买伤药与良药", x: 920, w: 198, h: 178 },
  { id: "supply", label: "军需帐", hint: "用试炼券购买此行军需", x: 1190, w: 232, h: 186 },
  { id: "hall", label: "编成所", hint: "编队、阵型、装备与图鉴", x: 1492, w: 214, h: 192 },
  { id: "gate", label: "城门", hint: "出征下一处节点", x: 1776, w: 196, h: 236 },
];

export function townSpotNear(playerX: number): TownSpot | null {
  let best: TownSpot | null = null;
  let bestDist = 128;
  for (const spot of TOWN_SPOTS) {
    const center = spot.x + spot.w / 2;
    const dist = Math.abs(playerX - center);
    if (dist < bestDist) {
      best = spot;
      bestDist = dist;
    }
  }
  return best;
}

const uiFont = (size: number): string =>
  `600 ${size}px "Noto Serif SC", "Songti SC", "STSong", serif`;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paintBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, "#141d33");
  sky.addColorStop(0.34, "#2d3350");
  sky.addColorStop(0.62, "#7a4a4a");
  sky.addColorStop(0.8, "#d08a58");
  sky.addColorStop(1, "#e8b57a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const sun = ctx.createRadialGradient(760, 300, 10, 760, 300, 220);
  sun.addColorStop(0, "rgba(255,226,170,0.9)");
  sun.addColorStop(0.3, "rgba(255,190,120,0.35)");
  sun.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(520, 120, 440, 360);

  // 远山：三层墨色剪影
  const layers: { base: number; amp: number; color: string; phase: number }[] = [
    { base: 316, amp: 42, color: "#2a3345", phase: 0.4 },
    { base: 344, amp: 34, color: "#232c3c", phase: 1.7 },
    { base: 372, amp: 26, color: "#1c2431", phase: 3.1 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(-20, VIEW_H);
    for (let x = -20; x <= VIEW_W + 20; x += 24) {
      const y =
        layer.base -
        Math.abs(Math.sin((x / VIEW_W) * Math.PI * 3 + layer.phase)) * layer.amp -
        Math.sin(x / 140 + layer.phase) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W + 20, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  // 薄雾
  const mist = ctx.createLinearGradient(0, 300, 0, 420);
  mist.addColorStop(0, "rgba(226,196,160,0)");
  mist.addColorStop(1, "rgba(226,196,160,0.16)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, 300, VIEW_W, 140);

  // 飘动的云/尘
  ctx.fillStyle = "rgba(255,220,180,0.09)";
  for (let i = 0; i < 5; i++) {
    const x = ((time * (8 + i * 3) + i * 240) % (VIEW_W + 240)) - 120;
    const y = 120 + i * 34 + Math.sin(time + i) * 6;
    ctx.beginPath();
    ctx.ellipse(x, y, 80 + i * 16, 10 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGround(ctx: CanvasRenderingContext2D, camera: number): void {
  const ground = ctx.createLinearGradient(0, GROUND_Y - 26, 0, VIEW_H);
  ground.addColorStop(0, "#4a4433");
  ground.addColorStop(0.4, "#3a3729");
  ground.addColorStop(1, "#23231c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, GROUND_Y - 26, VIEW_W, VIEW_H - GROUND_Y + 26);

  // 石板路
  ctx.fillStyle = "#5c5341";
  ctx.fillRect(0, GROUND_Y + 6, VIEW_W, 76);
  ctx.strokeStyle = "rgba(24,22,18,0.5)";
  ctx.lineWidth = 1;
  const offset = camera % 96;
  for (let x = -offset - 96; x < VIEW_W + 96; x += 96) {
    ctx.strokeRect(x, GROUND_Y + 6, 96, 38);
    ctx.strokeRect(x + 48, GROUND_Y + 44, 96, 38);
  }
  ctx.fillStyle = "rgba(255,214,150,0.05)";
  ctx.fillRect(0, GROUND_Y + 6, VIEW_W, 3);
}

function paintTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, tint: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#2c2418";
  ctx.fillRect(-5, -54, 10, 58);
  ctx.strokeStyle = "#3a2d1c";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(-22, -62);
  ctx.moveTo(0, -48);
  ctx.lineTo(20, -66);
  ctx.stroke();
  const blobs: [number, number, number, string][] = [
    [-22, -74, 26, tint],
    [20, -80, 30, tint],
    [0, -102, 32, tint],
    [-6, -66, 22, tint],
  ];
  for (const [bx, by, r, color] of blobs) {
    const grad = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.4, 2, bx, by, r);
    grad.addColorStop(0, "rgba(126,150,74,0.95)");
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, "#25301f");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintLantern(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  ctx.strokeStyle = "#2a241c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 96);
  ctx.lineTo(x, y - 54);
  ctx.stroke();
  const glow = ctx.createRadialGradient(x, y - 46, 2, x, y - 46, 34 + Math.sin(time * 2 + x) * 3);
  glow.addColorStop(0, "rgba(255,190,110,0.55)");
  glow.addColorStop(1, "rgba(255,150,70,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 40, y - 86, 80, 80);
  ctx.fillStyle = "#b8452f";
  roundRect(ctx, x - 9, y - 54, 18, 24, 6);
  ctx.fill();
  ctx.fillStyle = "#ffd89a";
  ctx.fillRect(x - 4, y - 49, 8, 14);
  ctx.fillStyle = "#e8c07a";
  ctx.fillRect(x - 10, y - 58, 20, 3);
  ctx.fillRect(x - 10, y - 31, 20, 3);
}

function paintBuilding(ctx: CanvasRenderingContext2D, spot: TownSpot, time: number): void {
  const x = spot.x;
  const w = spot.w;
  const baseY = GROUND_Y + 8;
  const bodyH = spot.h - 54;
  const topY = baseY - bodyH;
  const center = x + w / 2;

  if (spot.id === "record") {
    // 桃园石碑
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(center, baseY + 4, 54, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5d5648";
    roundRect(ctx, center - 34, topY + 44, 68, bodyH - 40, 8);
    ctx.fill();
    ctx.fillStyle = "#7a7160";
    roundRect(ctx, center - 28, topY + 50, 56, bodyH - 52, 6);
    ctx.fill();
    ctx.fillStyle = "#2f2a22";
    ctx.font = uiFont(20);
    ctx.textAlign = "center";
    ctx.fillText("桃", center, topY + 92);
    ctx.fillText("园", center, topY + 118);
    ctx.fillText("碑", center, topY + 144);
    ctx.fillStyle = "#3e4d33";
    ctx.beginPath();
    ctx.arc(x + 18, topY + 52, 18, 0, Math.PI * 2);
    ctx.arc(x + w - 18, topY + 58, 15, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (spot.id === "supply") {
    // 军需帐：三角军帐 + 木箱
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(center, baseY + 4, w * 0.46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    const tent = ctx.createLinearGradient(x, topY, x, baseY);
    tent.addColorStop(0, "#8a7a55");
    tent.addColorStop(1, "#4d4534");
    ctx.fillStyle = tent;
    ctx.beginPath();
    ctx.moveTo(center, topY + 6);
    ctx.lineTo(x + w - 8, baseY);
    ctx.lineTo(x + 8, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(40,34,24,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(center, topY + 8);
    ctx.lineTo(center, baseY);
    ctx.stroke();
    ctx.fillStyle = "#2b2418";
    ctx.fillRect(center - 26, baseY - 52, 52, 52);
    ctx.fillStyle = "#a8352c";
    ctx.beginPath();
    ctx.moveTo(center + 4, topY + 22);
    ctx.lineTo(center + 52, topY + 32);
    ctx.lineTo(center + 52, topY + 92);
    ctx.lineTo(center + 4, topY + 82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f3d9a0";
    ctx.font = uiFont(30);
    ctx.textAlign = "center";
    ctx.fillText("軍", center + 28, topY + 66);
    ctx.fillStyle = "#6d5a3b";
    ctx.fillRect(x + 10, baseY - 26, 34, 26);
    ctx.fillRect(x + w - 44, baseY - 22, 30, 22);
    return;
  }

  if (spot.id === "gate") {
    // 城门楼
    ctx.fillStyle = "#2b2a24";
    ctx.fillRect(x - 40, baseY - 128, w + 80, 128);
    ctx.fillStyle = "#3c3a30";
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        ctx.fillRect(x - 36 + col * 34 + (row % 2) * 12, baseY - 124 + row * 25, 28, 19);
      }
    }
    ctx.fillStyle = "#1a1916";
    ctx.beginPath();
    ctx.moveTo(center - 52, baseY);
    ctx.lineTo(center - 52, baseY - 92);
    ctx.arc(center, baseY - 92, 52, Math.PI, 0);
    ctx.lineTo(center + 52, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6d2f26";
    ctx.fillRect(center - 44, baseY - 84, 88, 84);
    ctx.strokeStyle = "#c9a15a";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) ctx.strokeRect(center - 40 + i * 21, baseY - 78, 18, 78);
    // 城楼
    const roofY = baseY - 210;
    ctx.fillStyle = "#3b2c22";
    ctx.fillRect(center - 82, roofY + 42, 164, 34);
    ctx.fillStyle = "#5c3428";
    ctx.beginPath();
    ctx.moveTo(center - 100, roofY + 48);
    ctx.quadraticCurveTo(center, roofY - 8, center + 100, roofY + 48);
    ctx.quadraticCurveTo(center + 60, roofY + 58, center, roofY + 30);
    ctx.quadraticCurveTo(center - 60, roofY + 58, center - 100, roofY + 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e7c27a";
    ctx.font = uiFont(20);
    ctx.textAlign = "center";
    ctx.fillText("出 征", center, roofY + 50);
    // 旗
    for (const dir of [-1, 1]) {
      const fx = center + dir * 92;
      ctx.strokeStyle = "#2a231b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, roofY + 40);
      ctx.lineTo(fx, roofY - 34);
      ctx.stroke();
      const wave = Math.sin(time * 2 + dir) * 4;
      ctx.fillStyle = "#a8352c";
      ctx.beginPath();
      ctx.moveTo(fx, roofY - 34);
      ctx.lineTo(fx + dir * 34, roofY - 26 + wave);
      ctx.lineTo(fx, roofY - 4);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  // 普通店铺：墙、屋顶、匾额
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(center, baseY + 4, w * 0.5, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  const wall = ctx.createLinearGradient(x, topY, x, baseY);
  if (spot.id === "forge") {
    wall.addColorStop(0, "#6b4a33");
    wall.addColorStop(1, "#3f2c20");
  } else if (spot.id === "herb") {
    wall.addColorStop(0, "#8a7a5f");
    wall.addColorStop(1, "#5a4d3a");
  } else if (spot.id === "bank") {
    wall.addColorStop(0, "#665a3f");
    wall.addColorStop(1, "#3a3325");
  } else {
    wall.addColorStop(0, "#6f4a3c");
    wall.addColorStop(1, "#432c25");
  }
  ctx.fillStyle = wall;
  ctx.fillRect(x + 12, topY + 40, w - 24, bodyH - 40);

  // 木梁
  ctx.strokeStyle = "rgba(38,28,20,0.8)";
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 16, topY + 44, w - 32, bodyH - 48);
  ctx.beginPath();
  ctx.moveTo(center, topY + 44);
  ctx.lineTo(center, baseY);
  ctx.stroke();

  // 屋顶（飞檐）
  ctx.fillStyle = spot.id === "herb" ? "#324236" : spot.id === "bank" ? "#37301f" : "#3a2820";
  ctx.beginPath();
  ctx.moveTo(x - 18, topY + 50);
  ctx.quadraticCurveTo(center, topY - 26, x + w + 18, topY + 50);
  ctx.quadraticCurveTo(center + w * 0.28, topY + 30, center, topY + 62);
  ctx.quadraticCurveTo(center - w * 0.28, topY + 30, x - 18, topY + 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(180,140,80,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 6, topY + 46);
  ctx.quadraticCurveTo(center, topY - 14, x + w + 6, topY + 46);
  ctx.stroke();

  // 匾额
  ctx.fillStyle = "#2a1f16";
  roundRect(ctx, center - 52, topY + 58, 104, 30, 4);
  ctx.fill();
  ctx.strokeStyle = "#c9a15a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#ecd39a";
  ctx.font = uiFont(17);
  ctx.textAlign = "center";
  ctx.fillText(spot.label, center, topY + 79);

  // 门与窗
  ctx.fillStyle = "#241a13";
  ctx.fillRect(center - 30, baseY - 62, 60, 62);
  ctx.fillStyle = "rgba(255,190,110,0.18)";
  ctx.fillRect(center - 26, baseY - 58, 52, 44);
  ctx.fillStyle = "#201710";
  for (let i = 0; i < 4; i++) ctx.fillRect(center - 26 + i * 13, baseY - 58, 2, 44);

  if (spot.id === "forge") {
    const glow = ctx.createRadialGradient(center + 52, baseY - 34, 2, center + 52, baseY - 34, 46);
    glow.addColorStop(0, "rgba(255,150,60,0.85)");
    glow.addColorStop(1, "rgba(255,110,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(center + 8, baseY - 78, 88, 78);
    ctx.fillStyle = "#1d1610";
    ctx.fillRect(center + 36, baseY - 44, 34, 44);
    ctx.fillStyle = "#ffb15c";
    ctx.fillRect(center + 42, baseY - 36, 22, 20);
    ctx.fillStyle = "#2a231b";
    ctx.fillRect(center - w / 2 + 30, baseY - 22, 28, 8);
    ctx.fillRect(center - w / 2 + 40, baseY - 22, 8, 22);
  }
  if (spot.id === "herb") {
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = "#54432c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 34 + i * 12, topY + 50);
      ctx.lineTo(x + 34 + i * 12, topY + 74);
      ctx.stroke();
      ctx.fillStyle = "#8a5a2d";
      ctx.beginPath();
      ctx.ellipse(x + 34 + i * 12, topY + 80, 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (spot.id === "bank") {
    // 钱庄：门边挂一串铜钱，柜台上摆算盘
    for (let i = 0; i < 3; i++) {
      const cy = baseY - 88 + i * 24;
      ctx.fillStyle = "#c9a15a";
      ctx.beginPath();
      ctx.arc(center + 62, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1f16";
      ctx.fillRect(center + 58, cy - 4, 8, 8);
      ctx.strokeStyle = "#8a5a2d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(center + 62, cy - 9);
      ctx.lineTo(center + 62, cy - (i === 0 ? 26 : 15));
      ctx.stroke();
    }
    ctx.fillStyle = "#4a3520";
    ctx.fillRect(center - 74, baseY - 30, 42, 8);
    ctx.fillStyle = "#e7c27a";
    for (let i = 0; i < 5; i++) ctx.fillRect(center - 71 + i * 8, baseY - 36, 4, 6);
  }
  if (spot.id === "hall") {
    for (const dir of [-1, 1]) {
      const fx = center + dir * (w / 2 + 2);
      ctx.strokeStyle = "#2a231b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, topY + 40);
      ctx.lineTo(fx, topY - 10);
      ctx.stroke();
      ctx.fillStyle = "#7d2f2a";
      ctx.beginPath();
      ctx.moveTo(fx, topY - 10);
      ctx.lineTo(fx + dir * 18, topY - 4 + Math.sin(time * 2 + dir) * 2);
      ctx.lineTo(fx, topY + 14);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function paintPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  time: number,
  moving: boolean,
  facing: 1 | -1,
  color: string,
  accent: string,
): void {
  const bob = moving ? Math.abs(Math.sin(time * 9)) * 3 : Math.sin(time * 2) * 1.2;
  const step = moving ? Math.sin(time * 9) * 5 : 0;
  const baseY = GROUND_Y + 12;
  ctx.save();
  ctx.translate(x, baseY - bob);
  ctx.scale(facing, 1);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 4 + bob, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腿
  ctx.fillStyle = "#2c2a26";
  ctx.fillRect(-9 + step * 0.4, -20, 8, 22);
  ctx.fillRect(2 - step * 0.4, -20, 8, 22);

  // 战袍
  const robe = ctx.createLinearGradient(0, -62, 0, -16);
  robe.addColorStop(0, color);
  robe.addColorStop(1, "rgba(20,24,20,0.95)");
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-16, -20);
  ctx.lineTo(-13, -56);
  ctx.quadraticCurveTo(0, -66, 13, -56);
  ctx.lineTo(16, -20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, -52);
  ctx.lineTo(13, -52);
  ctx.stroke();

  // 护肩
  ctx.fillStyle = "#3a3630";
  ctx.beginPath();
  ctx.ellipse(-16, -52, 9, 6, -0.4, 0, Math.PI * 2);
  ctx.ellipse(16, -52, 9, 6, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // 头与兜鍪
  ctx.fillStyle = "#d8b48c";
  ctx.beginPath();
  ctx.arc(0, -72, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a443a";
  ctx.beginPath();
  ctx.arc(0, -76, 11, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-11, -77, 22, 5);
  ctx.fillStyle = accent;
  ctx.fillRect(-2, -92, 4, 10);
  ctx.beginPath();
  ctx.arc(0, -94, 4, 0, Math.PI * 2);
  ctx.fill();

  // 佩剑
  ctx.strokeStyle = "#d9d2c2";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, -48);
  ctx.lineTo(30, -18);
  ctx.stroke();
  ctx.strokeStyle = "#7a5b32";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(16, -54);
  ctx.lineTo(20, -44);
  ctx.stroke();
  ctx.restore();
}

export interface TownPaintOptions {
  time: number;
  playerX: number;
  facing: 1 | -1;
  moving: boolean;
  near: TownSpot | null;
  partyColor: string;
  partyAccent: string;
  chapter: number;
}

export function paintTown(ctx: CanvasRenderingContext2D, options: TownPaintOptions): void {
  const camera = Math.max(0, Math.min(WORLD_W - VIEW_W, options.playerX - VIEW_W / 2));
  paintBackdrop(ctx, options.time);
  paintGround(ctx, camera);

  ctx.save();
  ctx.translate(-camera, 0);

  paintTree(ctx, 40, GROUND_Y + 16, 1.15, "#31452a");
  paintTree(ctx, 608, GROUND_Y + 12, 0.9, "#34482b");
  paintTree(ctx, 1135, GROUND_Y + 16, 1.0, "#2f4227");
  paintTree(ctx, 2010, GROUND_Y + 10, 1.2, "#303f26");

  for (const spot of TOWN_SPOTS) paintBuilding(ctx, spot, options.time);
  paintLantern(ctx, 850, GROUND_Y + 25, options.time);
  paintLantern(ctx, 1445, GROUND_Y + 25, options.time + 1.3);
  paintLantern(ctx, 1718, GROUND_Y + 25, options.time + 2.6);

  // 闹市摊位
  ctx.fillStyle = "#3c2c1e";
  ctx.fillRect(270, GROUND_Y - 24, 66, 30);
  ctx.fillStyle = "#8a4b33";
  ctx.beginPath();
  ctx.moveTo(262, GROUND_Y - 24);
  ctx.lineTo(344, GROUND_Y - 24);
  ctx.lineTo(334, GROUND_Y - 48);
  ctx.lineTo(272, GROUND_Y - 48);
  ctx.closePath();
  ctx.fill();

  const nearby = options.near;
  if (nearby) {
    const cx = nearby.x + nearby.w / 2;
    const pulse = 0.5 + Math.sin(options.time * 3) * 0.5;
    const glow = ctx.createRadialGradient(cx, GROUND_Y + 22, 4, cx, GROUND_Y + 22, 60);
    glow.addColorStop(0, `rgba(255,214,140,${0.28 + pulse * 0.18})`);
    glow.addColorStop(1, "rgba(255,200,110,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 22, 68, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  paintPlayer(
    ctx,
    options.playerX,
    options.time,
    options.moving,
    options.facing,
    options.partyColor,
    options.partyAccent,
  );

  if (nearby) {
    ctx.textAlign = "center";
    ctx.font = uiFont(14);
    const label = `按 E / 回车进入${nearby.label}`;
    const width = ctx.measureText(label).width + 30;
    const bubbleY = GROUND_Y - 132;
    ctx.fillStyle = "rgba(18,16,13,0.82)";
    roundRect(ctx, options.playerX - width / 2, bubbleY, width, 28, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(214,178,116,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ecd39a";
    ctx.fillText(label, options.playerX, bubbleY + 19);
  }

  ctx.restore();

  // 顶部活动标题
  const banner = ctx.createLinearGradient(0, 0, 0, 52);
  banner.addColorStop(0, "rgba(12,14,20,0.72)");
  banner.addColorStop(1, "rgba(12,14,20,0)");
  ctx.fillStyle = banner;
  ctx.fillRect(0, 0, VIEW_W, 52);
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8d5ab";
  ctx.font = uiFont(18);
  ctx.fillText("三国讨逆传", 26, 32);
  ctx.fillStyle = "rgba(232,213,171,0.62)";
  ctx.font = uiFont(12);
  ctx.fillText(`第 ${options.chapter + 1} 处 · A/D 行走，靠近门口交互`, 140, 31);

  // 暗角
  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 240, VIEW_W / 2, VIEW_H / 2, 560);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export interface BattleAnimation {
  events: SagaBattleEvent[];
  startedAt: number;
  /** 每条事件占用的动画时长（毫秒）。 */
  stepMs: number;
}

export interface BattlePaintOptions {
  battle: SagaBattleState;
  time: number;
  target: number;
  animation?: BattleAnimation | null;
}

interface UnitSlot {
  x: number;
  y: number;
  scale: number;
}

function unitSlots(count: number, side: "player" | "enemy"): UnitSlot[] {
  const slots: UnitSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    if (side === "player") {
      slots.push({ x: 150 + col * 102 + row * 26, y: 320 + row * 92 + col * 6, scale: 1.05 });
    } else {
      slots.push({ x: 790 - col * 96 - row * 22, y: 300 + row * 90 + col * 6, scale: 1.05 });
    }
  }
  return slots;
}

function paintSquad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  accent: string,
  ratio: number,
  scale: number,
  facing: 1 | -1,
  downed: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  ctx.globalAlpha = downed ? 0.28 : 1;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 8, 38, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  const soldiers = Math.max(0, Math.ceil(ratio * 6));
  for (let i = 0; i < 6; i++) {
    const sx = -30 + (i % 3) * 22;
    const sy = -4 + Math.floor(i / 3) * 12;
    const alpha = i < soldiers ? 0.95 : 0.12;
    ctx.globalAlpha = (downed ? 0.28 : 1) * alpha;
    ctx.fillStyle = "#2a2b2e";
    ctx.fillRect(sx - 3, sy - 12, 6, 12);
    ctx.fillStyle = color;
    ctx.fillRect(sx - 5, sy - 18, 10, 8);
    ctx.fillStyle = accent;
    ctx.fillRect(sx - 5, sy - 20, 10, 2);
    ctx.fillStyle = "#c9a17a";
    ctx.fillRect(sx - 2, sy - 24, 4, 4);
  }

  // 主将
  ctx.globalAlpha = downed ? 0.32 : 1;
  ctx.fillStyle = "#231f1a";
  ctx.fillRect(-9, -40, 7, 30);
  ctx.fillRect(4, -40, 7, 30);
  const robe = ctx.createLinearGradient(0, -78, 0, -26);
  robe.addColorStop(0, color);
  robe.addColorStop(1, "#1d1a16");
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-18, -28);
  ctx.lineTo(-15, -70);
  ctx.quadraticCurveTo(0, -80, 15, -70);
  ctx.lineTo(18, -28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -66);
  ctx.lineTo(14, -66);
  ctx.stroke();
  ctx.fillStyle = "#3c3830";
  ctx.beginPath();
  ctx.ellipse(-18, -66, 9, 6, -0.4, 0, Math.PI * 2);
  ctx.ellipse(18, -66, 9, 6, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9b58c";
  ctx.beginPath();
  ctx.arc(0, -86, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4c463a";
  ctx.beginPath();
  ctx.arc(0, -90, 11, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-11, -91, 22, 4);
  ctx.fillStyle = accent;
  ctx.fillRect(-2, -104, 4, 10);
  ctx.strokeStyle = "#e2d8c4";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(20, -60);
  ctx.lineTo(36, -14);
  ctx.stroke();
  ctx.restore();
}

function findUnit(battle: SagaBattleState, name: string): { unit: typeof battle.party[number]; slot: UnitSlot; side: "player" | "enemy" } | null {
  const playerSlots = unitSlots(battle.party.length, "player");
  const enemySlots = unitSlots(battle.enemies.length, "enemy");
  const pIndex = battle.party.findIndex((unit) => unit.name === name);
  if (pIndex >= 0) return { unit: battle.party[pIndex], slot: playerSlots[pIndex], side: "player" };
  const eIndex = battle.enemies.findIndex((unit) => unit.name === name);
  if (eIndex >= 0) return { unit: battle.enemies[eIndex], slot: enemySlots[eIndex], side: "enemy" };
  return null;
}

export function paintBattle(ctx: CanvasRenderingContext2D, options: BattlePaintOptions): void {
  const { battle, time, target } = options;
  const anim = options.animation;
  const elapsed = anim ? time - anim.startedAt : 0;
  const eventIndex = anim ? Math.floor(elapsed / anim.stepMs) : -1;
  const currentEvent = anim && eventIndex >= 0 && eventIndex < anim.events.length ? anim.events[eventIndex] : null;
  const eventProgress = anim
    ? Math.min(1, Math.max(0, (elapsed - eventIndex * anim.stepMs) / anim.stepMs))
    : 0;

  paintBackdrop(ctx, time + 4);
  paintGround(ctx, 0);

  // 战场土坡与军旗
  const field = ctx.createLinearGradient(0, GROUND_Y - 40, 0, VIEW_H);
  field.addColorStop(0, "rgba(94,72,46,0.4)");
  field.addColorStop(1, "rgba(30,26,20,0.85)");
  ctx.fillStyle = field;
  ctx.fillRect(0, GROUND_Y - 40, VIEW_W, VIEW_H - GROUND_Y + 40);
  for (const [bx, color] of [
    [80, "#7d2f2a"],
    [330, "#7d2f2a"],
    [650, "#243a5e"],
    [880, "#243a5e"],
  ] as [number, string][]) {
    ctx.strokeStyle = "#241d15";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx, GROUND_Y + 4);
    ctx.lineTo(bx, GROUND_Y - 156);
    ctx.stroke();
    const wave = Math.sin(time * 2 + bx) * 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(bx, GROUND_Y - 156);
    ctx.lineTo(bx + 40, GROUND_Y - 146 + wave);
    ctx.lineTo(bx, GROUND_Y - 112);
    ctx.closePath();
    ctx.fill();
  }

  // 回合横幅
  ctx.textAlign = "center";
  ctx.font = uiFont(20);
  const bannerText = `第 ${battle.round} 回合`;
  const bannerW = ctx.measureText(bannerText).width + 52;
  ctx.fillStyle = "rgba(16,14,11,0.76)";
  roundRect(ctx, VIEW_W / 2 - bannerW / 2, 14, bannerW, 36, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(202,161,90,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#ecd39a";
  ctx.fillText(bannerText, VIEW_W / 2, 39);

  ctx.font = uiFont(13);
  ctx.fillStyle = "rgba(236,211,154,0.75)";
  ctx.textAlign = "left";
  ctx.fillText(battle.nodeName, 24, 32);
  if (battle.boss) {
    ctx.fillStyle = "#e78b6a";
    ctx.fillText("BOSS", VIEW_W - 70, 32);
  }

  const playerSlots = unitSlots(battle.party.length, "player");
  const enemySlots = unitSlots(battle.enemies.length, "enemy");

  const drawUnit = (
    unit: typeof battle.party[number],
    slot: UnitSlot,
    side: "player" | "enemy",
    index: number,
  ): void => {
    let offsetX = 0;
    const offsetY = 0;
    let flash = false;
    if (currentEvent) {
      const isActor = currentEvent.actor === unit.name;
      const isTarget = currentEvent.target === unit.name;
      if (isActor && (currentEvent.kind === "attack" || currentEvent.kind === "tactic")) {
        const lunge = Math.sin(Math.min(1, eventProgress * 1.6) * Math.PI) * (side === "player" ? 42 : -42);
        offsetX += lunge;
      }
      if (isTarget && eventProgress < 0.7) {
        offsetX += (side === "player" ? -1 : 1) * Math.sin(eventProgress * Math.PI * 3) * 3;
        flash = eventProgress < 0.45;
      }
    }
    ctx.save();
    ctx.translate(offsetX, offsetY);
    if (flash) {
      ctx.filter = "brightness(1.8) saturate(0.6)";
    }
    paintSquad(
      ctx,
      slot.x,
      slot.y,
      unit.color,
      unit.accent,
      Math.max(0, unit.troops / unit.maxTroops),
      unit.boss ? slot.scale * 1.2 : slot.scale,
      side === "player" ? 1 : -1,
      unit.downed,
    );
    ctx.filter = "none";
    ctx.restore();

    // 名称牌与兵力条
    const plateW = 106;
    const plateX = slot.x - plateW / 2;
    const plateY = slot.y - (unit.boss ? 152 : 132);
    ctx.fillStyle = "rgba(14,13,11,0.74)";
    roundRect(ctx, plateX, plateY, plateW, 34, 4);
    ctx.fill();
    ctx.strokeStyle = side === "player" ? "rgba(210,180,120,0.55)" : "rgba(190,110,90,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = unit.downed ? "#8a8378" : "#f0e2c4";
    ctx.font = uiFont(13);
    ctx.fillText(`${unit.name} Lv${unit.level}`, slot.x, plateY + 15);
    const barW = plateW - 16;
    const ratio = Math.max(0, Math.min(1, unit.troops / unit.maxTroops));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(slot.x - barW / 2, plateY + 21, barW, 5);
    ctx.fillStyle = side === "player" ? "#c9a15a" : "#b5533d";
    ctx.fillRect(slot.x - barW / 2, plateY + 21, barW * ratio, 5);
    ctx.fillStyle = "rgba(240,226,196,0.85)";
    ctx.font = uiFont(10);
    ctx.fillText(`${Math.max(0, Math.round(unit.troops))}/${unit.maxTroops}`, slot.x, plateY + 33);

    if (unit.guard) {
      ctx.fillStyle = "rgba(120,180,230,0.9)";
      ctx.font = uiFont(12);
      ctx.fillText("守", slot.x + 52, plateY + 14);
    }
    if (unit.buff > 0) {
      ctx.fillStyle = "#e7a15a";
      ctx.fillText("鼓", slot.x + 52, plateY + 30);
    }
    if (unit.confused > 0) {
      ctx.fillStyle = "#c9b2ff";
      ctx.fillText("乱", slot.x - 52, plateY + 14);
    }
    if (unit.downed) {
      ctx.fillStyle = "rgba(230,200,180,0.7)";
      ctx.font = uiFont(12);
      ctx.fillText("败", slot.x, slot.y - 44);
    }

    if (side === "enemy" && index === target && !unit.downed) {
      const pulse = 0.6 + Math.sin(time * 4) * 0.4;
      ctx.strokeStyle = `rgba(240,190,110,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(slot.x, slot.y + 6, 46, 13, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#f0c27a";
      ctx.beginPath();
      ctx.moveTo(slot.x, slot.y - 18);
      ctx.lineTo(slot.x - 7, slot.y - 28);
      ctx.lineTo(slot.x + 7, slot.y - 28);
      ctx.closePath();
      ctx.fill();
    }
  };

  battle.party.forEach((unit, index) => {
    drawUnit(unit, playerSlots[index], "player", index);
  });
  battle.enemies.forEach((unit, index) => {
    drawUnit(unit, enemySlots[index], "enemy", index);
  });

  // 战斗特效
  if (currentEvent) {
    const actor = findUnit(battle, currentEvent.actor);
    const victim = currentEvent.target ? findUnit(battle, currentEvent.target) : null;
    if (currentEvent.kind === "attack" && victim) {
      const progress = Math.min(1, eventProgress / 0.6);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = "#ffe9b8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(victim.slot.x, victim.slot.y - 46, 30 + progress * 26, -1.2, 0.9);
      ctx.stroke();
      ctx.restore();
    }
    if (currentEvent.kind === "tactic" && victim) {
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const radius = 10 + eventProgress * 46;
        ctx.fillStyle = `rgba(255,${120 + i * 4},60,${1 - eventProgress})`;
        ctx.beginPath();
        ctx.arc(
          victim.slot.x + Math.cos(angle) * radius,
          victim.slot.y - 30 + Math.sin(angle) * radius * 0.6,
          4 + (i % 3),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    if (currentEvent.kind === "heal" && victim) {
      ctx.fillStyle = `rgba(126,230,160,${1 - eventProgress})`;
      ctx.font = uiFont(22);
      ctx.textAlign = "center";
      ctx.fillText("＋", victim.slot.x, victim.slot.y - 66 - eventProgress * 26);
    }
    if (currentEvent.kind === "confuse" && victim) {
      ctx.fillStyle = `rgba(198,170,255,${1 - eventProgress})`;
      ctx.font = uiFont(20);
      ctx.textAlign = "center";
      ctx.fillText("？", victim.slot.x, victim.slot.y - 78 - eventProgress * 18);
    }
    if (currentEvent.kind === "recruit" && victim) {
      ctx.fillStyle = `rgba(240,210,130,${1 - eventProgress})`;
      ctx.font = uiFont(16);
      ctx.textAlign = "center";
      ctx.fillText("归顺", victim.slot.x, victim.slot.y - 70 - eventProgress * 20);
    }
    if (typeof currentEvent.amount === "number" && currentEvent.amount > 0 && victim) {
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, eventProgress - 0.5);
      ctx.fillStyle = currentEvent.kind === "heal" ? "#8ef0b0" : "#ffd9a0";
      ctx.font = uiFont(20);
      ctx.textAlign = "center";
      ctx.fillText(
        `${currentEvent.kind === "heal" ? "+" : "-"}${currentEvent.amount}`,
        victim.slot.x + 24,
        victim.slot.y - 92 - eventProgress * 24,
      );
      ctx.restore();
    }
    void actor;
  }

  // 顶部信息条
  ctx.textAlign = "left";
  ctx.font = uiFont(12);
  ctx.fillStyle = "rgba(236,213,171,0.6)";
  ctx.fillText("A/D 走位 · 点击城门或店门交互", 26, VIEW_H - 16);

  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 580);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.46)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
