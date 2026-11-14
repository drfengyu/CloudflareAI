import type {
  SagaBattleEvent,
  SagaBattleState,
  SagaField,
  SagaFieldCamp,
  SagaFieldPoi,
} from "@/lib/trial/saga/types";
import {
  SAGA_TILE_FOREST,
  SAGA_TILE_GRASS,
  SAGA_TILE_MOUNTAIN,
  SAGA_TILE_ROAD,
  SAGA_TILE_WALL,
  SAGA_TILE_WATER,
  SAGA_TILE_YARD,
} from "@/lib/trial/saga/types";
import type { FieldHotspot } from "@/lib/trial/saga/map";

/**
 * 三国讨逆传的 Canvas 美术：俯视行军大地图与回合战斗两张场景。
 *
 * 内部按 960×540 逻辑坐标绘制，画布位图再按显示尺寸 × devicePixelRatio 放大
 * （上限 2×），所以大屏和高分屏上不会糊；全部用渐变与几何形状原创绘制：
 * 大地图走吞食天地那种格网俯视风（镜头跟随主角四向行走，山/水/林/官道/城池
 * 都是程序化画出来的，没有图片资源）；战斗沿用厚重的古战场插画风。
 */

export const VIEW_W = 960;
export const VIEW_H = 540;
const GROUND_Y = 436;

/**
 * 绘制视野：宽恒为 960，高按画布实际比例给。
 *
 * 大地图是俯视镜头，视野变高就是真的多看一截地图；战斗场景的坐标是按 540 高排好的，
 * 所以它按 `k = h / 540` 整体纵向缩放（`groundY` 跟着走），人物本身不放大，
 * 于是竖屏下多出来的高度变成「更多的天与更多的地」，而不是把角色拉成细长条。
 */
export interface SagaView {
  w: number;
  h: number;
  k: number;
  groundY: number;
}

export const DEFAULT_VIEW: SagaView = { w: VIEW_W, h: VIEW_H, k: 1, groundY: GROUND_Y };

export function makeSagaView(height: number): SagaView {
  const h = Math.max(420, Math.min(1200, Math.round(Number(height) || VIEW_H)));
  const k = h / VIEW_H;
  return { w: VIEW_W, h, k, groundY: GROUND_Y * k };
}

export type FieldFacilityId =
  | "record"
  | "forge"
  | "bank"
  | "inn"
  | "herb"
  | "supply"
  | "hall"
  | "train"
  | "tavern"
  | "tent"
  | "coupon"
  | "gate";

/** 城里能办的几件事 + 出营：大地图上收进「城中整备」面板的页签。 */
export const FIELD_FACILITIES: { id: FieldFacilityId; label: string; hint: string }[] = [
  { id: "record", label: "桃园碑", hint: "查看存档、武将与图鉴" },
  { id: "hall", label: "编成所", hint: "编队、阵型、装备与图鉴" },
  { id: "train", label: "训练场", hint: "花活动券逐级提升武将等级" },
  { id: "forge", label: "铁匠铺", hint: "用活动券强化武器与防具" },
  { id: "herb", label: "药铺", hint: "用活动券购买伤药与良药" },
  { id: "supply", label: "军需帐", hint: "用活动券购买此行军需" },
  { id: "inn", label: "客栈", hint: "花活动券歇脚，补满上阵武将兵力" },
  { id: "bank", label: "钱庄", hint: "用金币存 tcr，自动结算时到账" },
  { id: "tavern", label: "酒馆", hint: "听一段本地旧事" },
  { id: "tent", label: "营帐", hint: "看军令、召集众将议事" },
  { id: "coupon", label: "活动券", hint: "兑换活动券或买珍宝礼包" },
];


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

/**
 * 每章一套天候：天空、远山、薄雾、地面与官道各取一组色，
 * 大地图再罩一层很淡的环境色。八章循环使用，章节再多也不会缺色。
 */
interface SkyMood {
  sky: [number, string][];
  sun: [string, string, string];
  hills: [string, string, string];
  mist: string;
  dust: string;
  ground: [string, string, string];
  road: string;
  roadEdge: string;
  roadGlow: string;
  /** 震屏时露出的画布底色，取天空最深的一档。 */
  base: string;
  fieldTint: string;
}

const SKY_MOODS: SkyMood[] = [
  {
    // 0 桃园起兵：黄昏暖调
    sky: [[0, "#141d33"], [0.34, "#2d3350"], [0.62, "#7a4a4a"], [0.8, "#d08a58"], [1, "#e8b57a"]],
    sun: ["rgba(255,226,170,0.9)", "rgba(255,190,120,0.35)", "rgba(255,170,90,0)"],
    hills: ["#2a3345", "#232c3c", "#1c2431"],
    mist: "rgba(226,196,160,0.16)",
    dust: "rgba(255,220,180,0.09)",
    ground: ["#4a4433", "#3a3729", "#23231c"],
    road: "#5c5341",
    roadEdge: "rgba(24,22,18,0.5)",
    roadGlow: "rgba(255,214,150,0.05)",
    base: "#141d33",
    fieldTint: "rgba(255,196,120,0.05)",
  },
  {
    // 1 汜水关：铁灰寒日
    sky: [[0, "#0e1620"], [0.34, "#25303b"], [0.62, "#4d5a63"], [0.8, "#97a0a0"], [1, "#cdc7b2"]],
    sun: ["rgba(232,240,240,0.75)", "rgba(200,215,220,0.25)", "rgba(190,210,220,0)"],
    hills: ["#232c33", "#1b2329", "#141a1f"],
    mist: "rgba(200,215,220,0.14)",
    dust: "rgba(220,230,235,0.07)",
    ground: ["#3f4038", "#2f3029", "#1f201b"],
    road: "#4c4d44",
    roadEdge: "rgba(18,20,18,0.55)",
    roadGlow: "rgba(210,220,210,0.05)",
    base: "#0e1620",
    fieldTint: "rgba(120,145,165,0.1)",
  },
  {
    // 2 徐州风云：秋林金
    sky: [[0, "#1a2233"], [0.34, "#3a3f4a"], [0.62, "#8a6a48"], [0.8, "#c99155"], [1, "#e0b070"]],
    sun: ["rgba(255,224,160,0.85)", "rgba(240,190,110,0.3)", "rgba(230,180,100,0)"],
    hills: ["#2a3030", "#222827", "#1a1f1e"],
    mist: "rgba(230,200,150,0.16)",
    dust: "rgba(255,220,160,0.08)",
    ground: ["#4b412e", "#3a3327", "#252219"],
    road: "#5d5138",
    roadEdge: "rgba(24,20,14,0.5)",
    roadGlow: "rgba(255,214,150,0.05)",
    base: "#1a2233",
    fieldTint: "rgba(210,160,80,0.08)",
  },
  {
    // 3 白门楼：雨泽青灰
    sky: [[0, "#0d1520"], [0.34, "#1d2b36"], [0.62, "#33484f"], [0.8, "#5b7370"], [1, "#8aa095"]],
    sun: ["rgba(200,235,230,0.55)", "rgba(150,200,195,0.2)", "rgba(140,190,185,0)"],
    hills: ["#1c2a2c", "#162121", "#111a1a"],
    mist: "rgba(190,220,215,0.18)",
    dust: "rgba(210,235,230,0.07)",
    ground: ["#343a33", "#272d28", "#191e1a"],
    road: "#46514a",
    roadEdge: "rgba(14,20,18,0.55)",
    roadGlow: "rgba(190,225,215,0.06)",
    base: "#0d1520",
    fieldTint: "rgba(70,130,120,0.13)",
  },
  {
    // 4 官渡之战：烽烟赤霞
    sky: [[0, "#1a1420"], [0.34, "#3a2130"], [0.62, "#75343a"], [0.8, "#b05e42"], [1, "#d99a5c"]],
    sun: ["rgba(255,190,130,0.85)", "rgba(230,110,70,0.3)", "rgba(210,90,60,0)"],
    hills: ["#2d2228", "#241a20", "#1b1318"],
    mist: "rgba(220,150,120,0.15)",
    dust: "rgba(255,180,130,0.09)",
    ground: ["#47382b", "#352a21", "#211a15"],
    road: "#57452f",
    roadEdge: "rgba(22,16,12,0.55)",
    roadGlow: "rgba(255,180,110,0.05)",
    base: "#1a1420",
    fieldTint: "rgba(200,100,60,0.1)",
  },
  {
    // 5 赤壁之战：火夜赤红
    sky: [[0, "#080d18"], [0.34, "#151a2b"], [0.62, "#3a1f2b"], [0.8, "#8a3a2c"], [1, "#d4713a"]],
    sun: ["rgba(255,150,80,0.9)", "rgba(230,80,40,0.32)", "rgba(210,60,30,0)"],
    hills: ["#171526", "#121020", "#0d0b16"],
    mist: "rgba(220,110,70,0.14)",
    dust: "rgba(255,150,90,0.1)",
    ground: ["#2c2420", "#211b18", "#141110"],
    road: "#3d322a",
    roadEdge: "rgba(10,8,8,0.6)",
    roadGlow: "rgba(255,140,80,0.06)",
    base: "#080d18",
    fieldTint: "rgba(220,90,50,0.13)",
  },
  {
    // 6 入蜀之路：苍翠山岚
    sky: [[0, "#0e1a1c"], [0.34, "#1c3034"], [0.62, "#33515a"], [0.8, "#5f7f7c"], [1, "#9bb3a3"]],
    sun: ["rgba(210,245,220,0.7)", "rgba(150,210,180,0.24)", "rgba(140,200,170,0)"],
    hills: ["#1b2f2c", "#152623", "#0f1d1b"],
    mist: "rgba(190,225,205,0.17)",
    dust: "rgba(200,240,215,0.07)",
    ground: ["#3a4634", "#2b3629", "#1a211a"],
    road: "#4f5743",
    roadEdge: "rgba(12,18,12,0.55)",
    roadGlow: "rgba(200,235,200,0.05)",
    base: "#0e1a1c",
    fieldTint: "rgba(80,150,120,0.12)",
  },
  {
    // 7 五丈原：秋风素金
    sky: [[0, "#161a22"], [0.34, "#2c3038"], [0.62, "#5a5148"], [0.8, "#94805e"], [1, "#c4a878"]],
    sun: ["rgba(250,226,180,0.7)", "rgba(220,190,140,0.24)", "rgba(210,180,130,0)"],
    hills: ["#2a2a2c", "#212124", "#18181a"],
    mist: "rgba(215,205,185,0.16)",
    dust: "rgba(230,215,190,0.07)",
    ground: ["#453d2f", "#342f26", "#201d17"],
    road: "#554b38",
    roadEdge: "rgba(20,18,14,0.55)",
    roadGlow: "rgba(230,210,170,0.05)",
    base: "#161a22",
    fieldTint: "rgba(190,170,120,0.1)",
  },
];

function skyMoodFor(chapterIndex: number): SkyMood {
  const index = ((Math.round(chapterIndex) % SKY_MOODS.length) + SKY_MOODS.length) % SKY_MOODS.length;
  return SKY_MOODS[index];
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

let reducedMotionQuery: MediaQueryList | null | undefined;
/** 系统开启「减少动态效果」时关掉震屏与弹跳，只留颜色与数字反馈。 */
function prefersReducedMotion(): boolean {
  if (reducedMotionQuery === undefined) {
    reducedMotionQuery =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
  }
  return reducedMotionQuery?.matches ?? false;
}

/** 深底章节给队列描一层暖色轮廓光，免得暗景里武将糊成一团。 */
function isDarkMood(mood: SkyMood): boolean {
  const r = parseInt(mood.base.slice(1, 3), 16);
  const g = parseInt(mood.base.slice(3, 5), 16);
  const b = parseInt(mood.base.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 28;
}

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  time: number,
  view: SagaView,
  mood: SkyMood,
): void {
  const k = view.k;
  const sky = ctx.createLinearGradient(0, 0, 0, view.h);
  for (const [stop, color] of mood.sky) sky.addColorStop(stop, color);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.w, view.h);

  const sun = ctx.createRadialGradient(760, 300 * k, 10, 760, 300 * k, 220);
  sun.addColorStop(0, mood.sun[0]);
  sun.addColorStop(0.3, mood.sun[1]);
  sun.addColorStop(1, mood.sun[2]);
  ctx.fillStyle = sun;
  ctx.fillRect(520, 120 * k, 440, 360 * k);

  // 远山：三层墨色剪影
  const layers: { base: number; amp: number; color: string; phase: number }[] = [
    { base: 316, amp: 42, color: mood.hills[0], phase: 0.4 },
    { base: 344, amp: 34, color: mood.hills[1], phase: 1.7 },
    { base: 372, amp: 26, color: mood.hills[2], phase: 3.1 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(-20, view.h);
    for (let x = -20; x <= view.w + 20; x += 24) {
      const y =
        (layer.base -
          Math.abs(Math.sin((x / VIEW_W) * Math.PI * 3 + layer.phase)) * layer.amp -
          Math.sin(x / 140 + layer.phase) * 8) *
        k;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(view.w + 20, view.h);
    ctx.closePath();
    ctx.fill();
  }

  // 薄雾
  const mist = ctx.createLinearGradient(0, 300 * k, 0, 420 * k);
  mist.addColorStop(0, "rgba(226,196,160,0)");
  mist.addColorStop(1, mood.mist);
  ctx.fillStyle = mist;
  ctx.fillRect(0, 300 * k, view.w, 140 * k);

  // 飘动的云/尘
  ctx.fillStyle = mood.dust;
  for (let i = 0; i < 5; i++) {
    const x = ((time * (8 + i * 3) + i * 240) % (view.w + 240)) - 120;
    const y = (120 + i * 34 + Math.sin(time + i) * 6) * k;
    ctx.beginPath();
    ctx.ellipse(x, y, 80 + i * 16, 10 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGround(
  ctx: CanvasRenderingContext2D,
  camera: number,
  view: SagaView,
  mood: SkyMood,
): void {
  const gy = view.groundY;
  const ground = ctx.createLinearGradient(0, gy - 26, 0, view.h);
  ground.addColorStop(0, mood.ground[0]);
  ground.addColorStop(0.4, mood.ground[1]);
  ground.addColorStop(1, mood.ground[2]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, gy - 26, view.w, view.h - gy + 26);

  // 石板路
  ctx.fillStyle = mood.road;
  ctx.fillRect(0, gy + 6, view.w, 76);
  ctx.strokeStyle = mood.roadEdge;
  ctx.lineWidth = 1;
  const offset = camera % 96;
  for (let x = -offset - 96; x < view.w + 96; x += 96) {
    ctx.strokeRect(x, gy + 6, 96, 38);
    ctx.strokeRect(x + 48, gy + 44, 96, 38);
  }
  ctx.fillStyle = mood.roadGlow;
  ctx.fillRect(0, gy + 6, view.w, 3);
}

export type FieldFacing = "up" | "down" | "left" | "right";

export interface FieldPaintOptions {
  field: SagaField;
  time: number;
  /** 逻辑视野；省略则按 960×540（16:9）画。 */
  view?: SagaView;
  /** 主角世界坐标（脚底）。 */
  x: number;
  y: number;
  facing: FieldFacing;
  moving: boolean;
  /** 已攻克的营地节点下标。 */
  cleared: number[];
  /** 还能打的营地节点下标（其余按「主帅未出」锁住）。 */
  open: number[];
  hotspot: FieldHotspot | null;
  prompt: string | null;
  partyColor: string;
  partyAccent: string;
  chapterIndex: number;
  chapterName: string;
  townName: string;
  gold: number;
  power: number;
}

/** 每格一个稳定的伪随机数：同一张图每次画出来都一样。 */
function tileHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const GRASS_TINT: Record<string, [string, string]> = {
  plain: ["#4e6b39", "#3c5730"],
  forest: ["#42603a", "#2f4a2c"],
  mountain: ["#5a6340", "#465134"],
  river: ["#4a6a41", "#385535"],
};

function paintGrass(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
  tint: [string, string],
): void {
  ctx.fillStyle = r < 0.5 ? tint[0] : tint[1];
  ctx.fillRect(sx, sy, tile, tile);
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.fillRect(sx, sy, tile, 2);
  if (r > 0.72) {
    ctx.strokeStyle = "rgba(196,220,150,0.22)";
    ctx.lineWidth = 1;
    const bx = sx + 4 + r * (tile - 10);
    const by = sy + 6 + ((r * 97) % 1) * (tile - 12);
    ctx.beginPath();
    ctx.moveTo(bx, by + 5);
    ctx.lineTo(bx - 2, by - 2);
    ctx.moveTo(bx + 3, by + 5);
    ctx.lineTo(bx + 5, by - 1);
    ctx.stroke();
  }
}

function paintRoad(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  ctx.fillStyle = "#7c6547";
  ctx.fillRect(sx, sy, tile, tile);
  ctx.fillStyle = "rgba(255,236,196,0.07)";
  ctx.fillRect(sx, sy, tile, 3);
  ctx.fillStyle = "rgba(40,32,22,0.16)";
  ctx.fillRect(sx, sy + tile * 0.34 + r * 8, tile, 2);
  if (r > 0.6) {
    ctx.fillStyle = "rgba(58,46,32,0.5)";
    ctx.fillRect(sx + r * (tile - 8), sy + ((r * 53) % 1) * (tile - 8), 5, 4);
  }
}

/** 相邻水面画沙岸，滩涂不遇敌这件事在画面上看得见。 */
function paintShore(
  ctx: CanvasRenderingContext2D,
  field: SagaField,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  const wet = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= field.cols || y >= field.rows) return false;
    return field.terrain[y * field.cols + x] === SAGA_TILE_WATER;
  };
  const n = wet(tx, ty - 1);
  const s = wet(tx, ty + 1);
  const w = wet(tx - 1, ty);
  const e = wet(tx + 1, ty);
  const nw = wet(tx - 1, ty - 1);
  const ne = wet(tx + 1, ty - 1);
  const sw = wet(tx - 1, ty + 1);
  const se = wet(tx + 1, ty + 1);
  if (!n && !s && !w && !e && !nw && !ne && !sw && !se) return;
  const band = Math.max(5, Math.round(tile * (0.28 + r * 0.1)));
  const corner = Math.round(band * 0.85);
  ctx.fillStyle = "#c8b585";
  if (n) ctx.fillRect(sx, sy, tile, band);
  if (s) ctx.fillRect(sx, sy + tile - band, tile, band);
  if (w) ctx.fillRect(sx, sy, band, tile);
  if (e) ctx.fillRect(sx + tile - band, sy, band, tile);
  if (nw) ctx.fillRect(sx, sy, corner, corner);
  if (ne) ctx.fillRect(sx + tile - corner, sy, corner, corner);
  if (sw) ctx.fillRect(sx, sy + tile - corner, corner, corner);
  if (se) ctx.fillRect(sx + tile - corner, sy + tile - corner, corner, corner);
  ctx.fillStyle = "rgba(244,236,208,0.45)";
  if (n) ctx.fillRect(sx, sy, tile, 2);
  if (s) ctx.fillRect(sx, sy + tile - 2, tile, 2);
  if (w) ctx.fillRect(sx, sy, 2, tile);
  if (e) ctx.fillRect(sx + tile - 2, sy, 2, tile);
  if (r > 0.4) {
    ctx.fillStyle = "rgba(118,100,68,0.35)";
    const px = sx + 4 + r * (tile - 12);
    const py = sy + 4 + ((r * 71) % 1) * (tile - 12);
    ctx.fillRect(px, py, 2, 2);
    ctx.fillRect(px + 4, py + 5, 1.5, 1.5);
  }
}

function paintYard(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  ctx.fillStyle = "#6a5a44";
  ctx.fillRect(sx, sy, tile, tile);
  ctx.strokeStyle = "rgba(38,30,20,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, tile - 1, tile - 1);
  if (r > 0.5) {
    ctx.fillStyle = "rgba(226,196,150,0.08)";
    ctx.fillRect(sx + 4, sy + 4, tile - 8, tile - 8);
  }
}

function paintWater(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
  time: number,
): void {
  const grad = ctx.createLinearGradient(sx, sy, sx, sy + tile);
  grad.addColorStop(0, "#2a5570");
  grad.addColorStop(1, "#1d3f58");
  ctx.fillStyle = grad;
  ctx.fillRect(sx, sy, tile, tile);
  ctx.strokeStyle = "rgba(176,222,238,0.26)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    const phase = time * 1.1 + r * 6 + i * 2.1;
    const wy = sy + 8 + i * 12 + Math.sin(phase) * 2;
    ctx.beginPath();
    ctx.moveTo(sx + 3, wy);
    ctx.quadraticCurveTo(sx + tile / 2, wy - 3 - Math.sin(phase) * 2, sx + tile - 3, wy);
    ctx.stroke();
  }
}

function paintWall(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  // 俯视城墙：主体 + 顶部走道 + 女墙齿口
  ctx.fillStyle = "#3a3630";
  ctx.fillRect(sx, sy, tile, tile);
  const grad = ctx.createLinearGradient(sx, sy, sx, sy + tile);
  grad.addColorStop(0, "#726c60");
  grad.addColorStop(0.55, "#565047");
  grad.addColorStop(1, "#403a33");
  ctx.fillStyle = grad;
  ctx.fillRect(sx, sy, tile, tile - 4);
  ctx.fillStyle = "rgba(20,18,14,0.5)";
  for (let i = 0; i < 3; i++) {
    if ((i + Math.floor(r * 3)) % 2 === 0) continue;
    ctx.fillRect(sx + i * (tile / 3), sy, tile / 3, 3);
  }
  ctx.strokeStyle = "rgba(26,22,18,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy + tile * 0.5);
  ctx.lineTo(sx + tile, sy + tile * 0.5);
  ctx.stroke();
}

function paintMountain(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(sx + tile / 2, sy + tile - 4, tile * 0.42, tile * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  const peak = sy + 2 + r * 4;
  const grad = ctx.createLinearGradient(sx, peak, sx + tile, sy + tile);
  grad.addColorStop(0, "#6e6a5c");
  grad.addColorStop(0.5, "#4b4a41");
  grad.addColorStop(1, "#2c2c26");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(sx + tile * 0.5, peak);
  ctx.lineTo(sx + tile - 1, sy + tile - 3);
  ctx.lineTo(sx + 1, sy + tile - 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(236,232,220,0.5)";
  ctx.beginPath();
  ctx.moveTo(sx + tile * 0.5, peak);
  ctx.lineTo(sx + tile * 0.63, peak + tile * 0.3);
  ctx.lineTo(sx + tile * 0.4, peak + tile * 0.26);
  ctx.closePath();
  ctx.fill();
}

function paintFieldTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
  time: number,
): void {
  const cx = sx + tile / 2;
  const cy = sy + tile * 0.55;
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(cx, sy + tile - 3, tile * 0.34, tile * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2c1b";
  ctx.fillRect(cx - 2, cy - 2, 4, tile * 0.4);
  const sway = Math.sin(time * 0.9 + r * 9) * 1.4;
  const blobs: [number, number, number][] = [
    [-6 + sway, -4, 10],
    [7 + sway, -2, 9],
    [sway, -12, 11],
  ];
  for (const [dx, dy, radius] of blobs) {
    const grad = ctx.createRadialGradient(cx + dx - 3, cy + dy - 3, 1, cx + dx, cy + dy, radius);
    grad.addColorStop(0, r > 0.5 ? "#7ea24f" : "#6f9648");
    grad.addColorStop(1, "#243b21");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 营寨：木栅 + 帐篷 + 帅旗；已破的塌成灰堆，未开的锁着红印。 */
function paintCamp(
  ctx: CanvasRenderingContext2D,
  camp: SagaFieldCamp,
  time: number,
  state: "cleared" | "open" | "locked",
): void {
  const cx = camp.x;
  const cy = camp.y;
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  const cleared = state === "cleared";
  const locked = state === "locked";

  // 木栅
  ctx.strokeStyle = cleared ? "#4a4640" : "#6b5636";
  ctx.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    const px = cx + i * 11;
    const h = cleared ? 10 : 18;
    ctx.beginPath();
    ctx.moveTo(px, cy + 12);
    ctx.lineTo(px, cy + 12 - h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy + 2 - (cleared ? 6 : 0));
  ctx.lineTo(cx + 24, cy + 2 - (cleared ? 6 : 0));
  ctx.stroke();

  if (cleared) {
    ctx.fillStyle = "#3b3732";
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(210,120,60,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy - 6, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 帐篷
  const tent = ctx.createLinearGradient(cx, cy - 34, cx, cy + 6);
  tent.addColorStop(0, locked ? "#6a5b6b" : "#94805a");
  tent.addColorStop(1, locked ? "#3a3340" : "#4f4634");
  ctx.fillStyle = tent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 34);
  ctx.lineTo(cx + 22, cy + 4);
  ctx.lineTo(cx - 22, cy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#241f18";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx + 8, cy + 4);
  ctx.lineTo(cx - 8, cy + 4);
  ctx.closePath();
  ctx.fill();

  // 帅旗
  ctx.strokeStyle = "#2b241b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 26, cy + 6);
  ctx.lineTo(cx + 26, cy - 30);
  ctx.stroke();
  const wave = Math.sin(time * 2.4 + camp.tx) * 2.5;
  ctx.fillStyle = locked ? "#7b3b4b" : "#a8352c";
  ctx.beginPath();
  ctx.moveTo(cx + 26, cy - 30);
  ctx.lineTo(cx + 46, cy - 25 + wave);
  ctx.lineTo(cx + 26, cy - 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f3d9a0";
  ctx.font = uiFont(13);
  ctx.textAlign = "center";
  ctx.fillText(locked ? "帅" : "敌", cx + 34, cy - 17);

  if (!locked) {
    const pulse = 0.5 + Math.sin(time * 3 + camp.node) * 0.5;
    ctx.strokeStyle = `rgba(255,206,120,${0.3 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 30, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(220,120,140,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 30, 0, Math.PI * 2);
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 乡野点位：村庄的茅屋、祠堂的牌坊、渡口的木船。 */
function paintPoi(
  ctx: CanvasRenderingContext2D,
  poi: SagaFieldPoi,
  time: number,
): void {
  const cx = poi.x;
  const cy = poi.y;
  const sway = Math.sin(time * 1.6 + poi.tx) * 1.5;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (poi.kind === "village") {
    // 两间茅屋 + 篱笆
    for (const [dx, scale] of [
      [-13, 1],
      [12, 0.82],
    ] as [number, number][]) {
      const hx = cx + dx;
      const base = cy + 10;
      ctx.fillStyle = "#6b563c";
      ctx.fillRect(hx - 9 * scale, base - 12 * scale, 18 * scale, 12 * scale);
      ctx.fillStyle = "#4a3a28";
      ctx.fillRect(hx - 3 * scale, base - 7 * scale, 6 * scale, 7 * scale);
      ctx.fillStyle = "#8a7448";
      ctx.beginPath();
      ctx.moveTo(hx - 13 * scale, base - 12 * scale);
      ctx.quadraticCurveTo(hx, base - 27 * scale, hx + 13 * scale, base - 12 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(30,24,16,0.4)";
      ctx.fillRect(hx - 12 * scale, base - 12 * scale, 24 * scale, 2);
    }
    // 炊烟
    ctx.strokeStyle = "rgba(220,216,204,0.28)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 12);
    ctx.quadraticCurveTo(cx - 13 + sway, cy - 24, cx - 7 + sway, cy - 34);
    ctx.stroke();
    // 篱笆
    ctx.strokeStyle = "#5a4a34";
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      const px = cx + 24 + i * 5;
      ctx.beginPath();
      ctx.moveTo(px, cy + 12);
      ctx.lineTo(px, cy + 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#e8d5ab";
    ctx.font = uiFont(11);
    ctx.textAlign = "center";
    ctx.fillText(poi.name, cx, cy - 40);
    return;
  }

  if (poi.kind === "shrine") {
    // 牌坊
    ctx.strokeStyle = "#6d3a2c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy + 12);
    ctx.lineTo(cx - 22, cy - 20);
    ctx.moveTo(cx + 22, cy + 12);
    ctx.lineTo(cx + 22, cy - 20);
    ctx.stroke();
    ctx.fillStyle = "#7b4232";
    ctx.fillRect(cx - 30, cy - 26, 60, 6);
    ctx.fillStyle = "#5d3226";
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy - 26);
    ctx.quadraticCurveTo(cx, cy - 40, cx + 34, cy - 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e3c98f";
    ctx.fillRect(cx - 10, cy - 20, 20, 10);
    // 香炉与香烟
    ctx.fillStyle = "#3c3630";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(226,220,205,0.4)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 1);
    ctx.quadraticCurveTo(cx + sway * 2, cy - 14, cx + sway, cy - 24);
    ctx.stroke();
    // 灯笼
    for (const dx of [-26, 26] as const) {
      const glow = 0.5 + Math.sin(time * 2.4 + dx) * 0.2;
      ctx.fillStyle = `rgba(240,170,90,${glow})`;
      ctx.beginPath();
      ctx.arc(cx + dx, cy - 12, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8d5ab";
    ctx.font = uiFont(11);
    ctx.textAlign = "center";
    ctx.fillText(poi.name, cx, cy - 46);
    return;
  }

  // 渡口：木栈桥 + 小船
  ctx.fillStyle = "#6a563c";
  ctx.fillRect(cx - 34, cy + 2, 34, 7);
  ctx.fillStyle = "rgba(30,24,16,0.35)";
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - 32 + i * 8, cy + 2, 1.4, 7);
  const bob = Math.sin(time * 2.1) * 1.4;
  ctx.fillStyle = "#3a2e20";
  ctx.beginPath();
  ctx.ellipse(cx + 14, cy + 12 + bob, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a5c38";
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy + 10 + bob);
  ctx.quadraticCurveTo(cx + 14, cy + 20 + bob, cx + 30, cy + 10 + bob);
  ctx.quadraticCurveTo(cx + 14, cy + 14 + bob, cx - 2, cy + 10 + bob);
  ctx.fill();
  ctx.strokeStyle = "#4a3a24";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 12, cy + 10 + bob);
  ctx.lineTo(cx + 12, cy - 12 + bob);
  ctx.stroke();
  ctx.fillStyle = "rgba(226,214,184,0.85)";
  ctx.beginPath();
  ctx.moveTo(cx + 12, cy - 12 + bob);
  ctx.quadraticCurveTo(cx + 22, cy - 6 + bob, cx + 12, cy - 1 + bob);
  ctx.closePath();
  ctx.fill();
  // 水波
  ctx.strokeStyle = "rgba(176,222,238,0.35)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const wy = cy + 16 + i * 5 + Math.sin(time * 1.4 + i) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 20, wy);
    ctx.quadraticCurveTo(cx + 2, wy - 3, cx + 26, wy);
    ctx.stroke();
  }
  ctx.fillStyle = "#e8d5ab";
  ctx.font = uiFont(11);
  ctx.textAlign = "center";
  ctx.fillText(poi.name, cx, cy - 30);
}

function paintCityGate(
  ctx: CanvasRenderingContext2D,
  field: SagaField,
  time: number,
  townName: string,
): void {
  const tile = field.tile;
  const gx = (field.city.gateTx + 0.5) * tile;
  const gy = (field.city.gateTy + 0.5) * tile;
  // 门楼压在城门格上方
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(gx - 20, gy - 6, 40, 30);
  const wallTop = (field.city.ty) * tile;
  ctx.fillStyle = "#4a443b";
  ctx.fillRect(gx - 26, wallTop - 34, 52, 40);
  ctx.fillStyle = "#6b4a34";
  ctx.beginPath();
  ctx.moveTo(gx - 34, wallTop - 30);
  ctx.quadraticCurveTo(gx, wallTop - 56, gx + 34, wallTop - 30);
  ctx.quadraticCurveTo(gx, wallTop - 18, gx - 34, wallTop - 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ecd39a";
  ctx.font = uiFont(12);
  ctx.textAlign = "center";
  ctx.fillText(townName.slice(0, 4), gx, wallTop - 22);
  const glow = ctx.createRadialGradient(gx, gy + 6, 2, gx, gy + 6, 40 + Math.sin(time * 2) * 3);
  glow.addColorStop(0, "rgba(255,214,140,0.3)");
  glow.addColorStop(1, "rgba(255,180,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(gx - 44, gy - 34, 88, 80);
}

/** 主角小人：大地图和城中街景共用，坐标是脚底。 */
export interface HeroSpriteOptions {
  time: number;
  facing: FieldFacing;
  moving: boolean;
  partyColor: string;
  partyAccent: string;
}

export function paintHeroSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: HeroSpriteOptions,
): void {
  const { time, facing, moving, partyColor, partyAccent } = options;
  const bob = moving ? Math.abs(Math.sin(time * 10)) * 2 : Math.sin(time * 2) * 0.8;
  const step = moving ? Math.sin(time * 10) * 3 : 0;
  ctx.save();
  ctx.translate(x, y - bob);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 6 + bob, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腿
  ctx.fillStyle = "#2b2822";
  ctx.fillRect(-6 + step, -8, 5, 9);
  ctx.fillRect(2 - step, -8, 5, 9);

  // 战袍（俯视略宽的肩背）
  const robe = ctx.createLinearGradient(0, -30, 0, -6);
  robe.addColorStop(0, partyColor);
  robe.addColorStop(1, "#1f2119");
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-10, -6);
  ctx.lineTo(-9, -24);
  ctx.quadraticCurveTo(0, -30, 9, -24);
  ctx.lineTo(10, -6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = partyAccent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-9, -20);
  ctx.lineTo(9, -20);
  ctx.stroke();

  // 肩甲
  ctx.fillStyle = "#3b372f";
  ctx.beginPath();
  ctx.ellipse(-10, -21, 5, 3.5, -0.3, 0, Math.PI * 2);
  ctx.ellipse(10, -21, 5, 3.5, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // 头与兜鍪
  ctx.fillStyle = "#d8b48c";
  ctx.beginPath();
  ctx.arc(0, -34, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a443a";
  ctx.beginPath();
  ctx.arc(0, -36, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-8, -37, 16, 3);
  ctx.fillStyle = partyAccent;
  ctx.fillRect(-1.5, -46, 3, 8);
  ctx.beginPath();
  ctx.arc(0, -47, 3, 0, Math.PI * 2);
  ctx.fill();

  if (facing === "down") {
    ctx.fillStyle = "#2a231c";
    ctx.fillRect(-3, -34, 2, 2);
    ctx.fillRect(2, -34, 2, 2);
  } else if (facing === "up") {
    ctx.fillStyle = "#3a352c";
    ctx.beginPath();
    ctx.arc(0, -33, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const dir = facing === "left" ? -1 : 1;
    ctx.fillStyle = "#2a231c";
    ctx.fillRect(dir * 2 - 1, -34, 2, 2);
  }

  // 长枪
  const dir = facing === "left" ? -1 : facing === "right" ? 1 : 1;
  ctx.strokeStyle = "#cfc6ae";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dir * 9, -26);
  ctx.lineTo(dir * 16, 2);
  ctx.stroke();
  ctx.fillStyle = "#e6ddc6";
  ctx.beginPath();
  ctx.moveTo(dir * 9, -26);
  ctx.lineTo(dir * 6, -32);
  ctx.lineTo(dir * 12, -30);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintFieldHero(
  ctx: CanvasRenderingContext2D,
  options: FieldPaintOptions,
  camX: number,
  camY: number,
): void {
  paintHeroSprite(ctx, options.x - camX, options.y - camY, options);
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  field: SagaField,
  options: FieldPaintOptions,
): void {
  const w = 156;
  const h = Math.round((w * field.rows) / field.cols);
  const view = options.view ?? DEFAULT_VIEW;
  const x = view.w - w - 18;
  const y = view.h - h - 18;
  ctx.fillStyle = "rgba(12,14,12,0.72)";
  roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(202,161,90,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const sx = w / field.cols;
  const sy = h / field.rows;
  for (let ty = 0; ty < field.rows; ty++) {
    for (let tx = 0; tx < field.cols; tx++) {
      const kind = field.terrain[ty * field.cols + tx] ?? SAGA_TILE_GRASS;
      ctx.fillStyle =
        kind === SAGA_TILE_WATER
          ? "#2b5570"
          : kind === SAGA_TILE_MOUNTAIN
            ? "#4a4a44"
            : kind === SAGA_TILE_WALL
              ? "#8a8478"
              : kind === SAGA_TILE_YARD
                ? "#6a5a44"
                : kind === SAGA_TILE_FOREST
                  ? "#2f4a2c"
                  : kind === SAGA_TILE_ROAD
                    ? "#7c6547"
                    : "#465f34";
      ctx.fillRect(x + tx * sx, y + ty * sy, sx + 0.6, sy + 0.6);
    }
  }
  ctx.fillStyle = "#e8d5ab";
  ctx.fillRect(x + field.city.gateTx * sx - 1, y + field.city.gateTy * sy - 1, 4, 4);
  for (const camp of field.camps) {
    const state = options.cleared.includes(camp.node)
      ? "#8a8578"
      : options.open.includes(camp.node)
        ? "#f0c27a"
        : "#c65a6a";
    ctx.fillStyle = state;
    ctx.fillRect(x + camp.tx * sx - 1.5, y + camp.ty * sy - 1.5, 4, 4);
  }
  for (const poi of field.pois) {
    ctx.fillStyle = "#9ad7c0";
    ctx.beginPath();
    ctx.arc(x + poi.tx * sx, y + poi.ty * sy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // 视野框：缩到小地图里标出画布当前看到的范围，跑图时不会迷路。
  const camW = Math.min(field.worldW, view.w);
  const camH = Math.min(field.worldH, view.h);
  const camX = Math.max(0, Math.min(field.worldW - camW, options.x - view.w / 2));
  const camY = Math.max(0, Math.min(field.worldH - camH, options.y - view.h / 2));
  ctx.strokeStyle = "rgba(236,226,196,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x + (camX / field.worldW) * w + 0.5,
    y + (camY / field.worldH) * h + 0.5,
    (camW / field.worldW) * w,
    (camH / field.worldH) * h,
  );
  ctx.fillStyle = "#7fe0a0";
  ctx.beginPath();
  ctx.arc(
    x + (options.x / field.worldW) * w,
    y + (options.y / field.worldH) * h,
    2.4,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

export function paintField(ctx: CanvasRenderingContext2D, options: FieldPaintOptions): void {
  const { field, time } = options;
  const view = options.view ?? DEFAULT_VIEW;
  const tile = field.tile;
  const camX = Math.max(0, Math.min(field.worldW - view.w, options.x - view.w / 2));
  const camY = Math.max(0, Math.min(field.worldH - view.h, options.y - view.h / 2));
  const tint = GRASS_TINT[field.flavor] ?? GRASS_TINT.plain;

  ctx.fillStyle = "#2c3a24";
  ctx.fillRect(0, 0, view.w, view.h);

  const fromTx = Math.floor(camX / tile);
  const toTx = Math.min(field.cols - 1, Math.ceil((camX + view.w) / tile));
  const fromTy = Math.floor(camY / tile);
  const toTy = Math.min(field.rows - 1, Math.ceil((camY + view.h) / tile));

  // 地面层
  for (let ty = fromTy; ty <= toTy; ty++) {
    for (let tx = fromTx; tx <= toTx; tx++) {
      const kind = field.terrain[ty * field.cols + tx] ?? SAGA_TILE_GRASS;
      const sx = Math.round(tx * tile - camX);
      const sy = Math.round(ty * tile - camY);
      const r = tileHash(tx, ty);
      if (kind === SAGA_TILE_WATER) {
        paintWater(ctx, sx, sy, tile, r, time);
        continue;
      }
      if (kind === SAGA_TILE_WALL) {
        paintWall(ctx, sx, sy, tile, r);
        continue;
      }
      if (kind === SAGA_TILE_YARD) {
        paintYard(ctx, sx, sy, tile, r);
        continue;
      }
      if (kind === SAGA_TILE_ROAD) {
        paintRoad(ctx, sx, sy, tile, r);
        continue;
      }
      paintGrass(ctx, sx, sy, tile, r, tint);
      if (kind === SAGA_TILE_GRASS) paintShore(ctx, field, tx, ty, sx, sy, tile, r);
    }
  }

  // 地物层（按 y 排序，遮挡关系看起来对味）
  type Sprite = { y: number; draw: () => void };
  const sprites: Sprite[] = [];
  for (let ty = fromTy; ty <= toTy; ty++) {
    for (let tx = fromTx; tx <= toTx; tx++) {
      const kind = field.terrain[ty * field.cols + tx] ?? SAGA_TILE_GRASS;
      if (kind !== SAGA_TILE_FOREST && kind !== SAGA_TILE_MOUNTAIN) continue;
      const r = tileHash(tx, ty);
      const sx = Math.round(tx * tile - camX);
      const sy = Math.round(ty * tile - camY);
      sprites.push({
        y: sy + tile,
        draw: () =>
          kind === SAGA_TILE_MOUNTAIN
            ? paintMountain(ctx, sx, sy, tile, r)
            : paintFieldTree(ctx, sx, sy, tile, r, time),
      });
    }
  }
  for (const camp of field.camps) {
    const sx = camp.x - camX;
    const sy = camp.y - camY;
    if (sx < -80 || sx > view.w + 80 || sy < -120 || sy > view.h + 80) continue;
    const state = options.cleared.includes(camp.node)
      ? "cleared"
      : options.open.includes(camp.node)
        ? "open"
        : "locked";
    sprites.push({
      y: sy + 14,
      draw: () => paintCamp(ctx, { ...camp, x: sx, y: sy }, time, state),
    });
  }
  for (const poi of field.pois) {
    const sx = poi.x - camX;
    const sy = poi.y - camY;
    if (sx < -80 || sx > view.w + 80 || sy < -80 || sy > view.h + 80) continue;
    sprites.push({
      y: sy + 14,
      draw: () => paintPoi(ctx, { ...poi, x: sx, y: sy }, time),
    });
  }
  const gx = field.city.gateTx * tile - camX;
  const gy = field.city.gateTy * tile - camY;
  if (gx > -120 && gx < view.w + 120 && gy > -160 && gy < view.h + 120) {
    sprites.push({
      y: gy + tile,
      draw: () => paintCityGate(ctx, field, time, options.townName),
    });
  }
  sprites.push({
    y: options.y - camY + 8,
    draw: () => paintFieldHero(ctx, options, camX, camY),
  });
  sprites.sort((a, b) => a.y - b.y);
  for (const sprite of sprites) sprite.draw();

  // 环境色：同一张地图在不同章节里分出晨昏寒暑，不额外做贴图。
  const mood = skyMoodFor(options.chapterIndex);
  ctx.fillStyle = mood.fieldTint;
  ctx.fillRect(0, 0, view.w, view.h);

  // 交互气泡
  if (options.prompt) {
    const px = options.x - camX;
    const py = options.y - camY - 62;
    ctx.textAlign = "center";
    ctx.font = uiFont(14);
    const label = `${options.prompt} ｜ E`;
    const width = ctx.measureText(label).width + 26;
    ctx.fillStyle = "rgba(18,16,13,0.84)";
    roundRect(ctx, px - width / 2, py - 14, width, 26, 13);
    ctx.fill();
    ctx.strokeStyle = "rgba(214,178,116,0.75)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ecd39a";
    ctx.fillText(label, px, py + 4);
  }

  drawMinimap(ctx, field, options);

  // 顶部信息条
  const banner = ctx.createLinearGradient(0, 0, 0, 56);
  banner.addColorStop(0, "rgba(12,14,20,0.78)");
  banner.addColorStop(1, "rgba(12,14,20,0)");
  ctx.fillStyle = banner;
  ctx.fillRect(0, 0, view.w, 56);
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8d5ab";
  ctx.font = uiFont(18);
  ctx.fillText(`${options.townName} · ${options.chapterName}`, 24, 30);
  ctx.fillStyle = "rgba(232,213,171,0.66)";
  ctx.font = uiFont(12);
  ctx.fillText(
    `第 ${options.chapterIndex + 1} 处 · 营地 ${options.cleared.length}/${field.camps.length} · 金币 ${options.gold} · 战力 ${options.power}`,
    24,
    48,
  );
  ctx.textAlign = "right";
  ctx.fillText("方向键 / WASD 行走 · E 交互", view.w - 24, 30);
  ctx.textAlign = "left";

  // 暗角
  const vignette = ctx.createRadialGradient(
    view.w / 2,
    view.h / 2,
    Math.min(view.w, view.h) * 0.44,
    view.w / 2,
    view.h / 2,
    Math.max(view.w, view.h) * 0.58,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.w, view.h);
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
  /** 毫秒时间轴（performance.now），动画起点 startedAt 用的也是毫秒。 */
  nowMs?: number;
  target: number;
  animation?: BattleAnimation | null;
  /** 当前章节，用来选战场天候；省略按第 0 章画。 */
  chapterIndex?: number;
  /** 逻辑视野；省略则按 960×540（16:9）画。 */
  view?: SagaView;
  /** 内景与阵位种子；省略按节点序号生成，同一座营 / 城每次进场一致。 */
  layoutSeed?: number;
}

interface UnitSlot {
  x: number;
  y: number;
  scale: number;
}

/** 战斗内景种子：同一节点每场一样，不同营地 / 敌城之间不同。 */
export function battleLayoutSeed(battle: SagaBattleState): number {
  const node = Number.isFinite(battle.nodeIndex) ? battle.nodeIndex : 0;
  const partySize = battle.party?.length ?? 0;
  const enemySize = battle.enemies?.length ?? 0;
  let seed = 2166136261 >>> 0;
  seed = (seed ^ Math.imul(node + 1, 374761393)) >>> 0;
  seed = (seed ^ Math.imul(partySize + 1, 668265263)) >>> 0;
  seed = (seed ^ Math.imul(enemySize + 1, 2246822519)) >>> 0;
  return seed;
}

/** 固定种子的轻量随机，只用于摆陈设，不参与战斗结算。 */
function battleRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 两军各排成一列，从上往下就位；人多时整体缩小，避免队列挤出屏幕。 */
function unitSlots(count: number, side: "player" | "enemy", k = 1, seed = 0): UnitSlot[] {
  const slots: UnitSlot[] = [];
  const scale =
    count >= 5 ? 0.52 : count === 4 ? 0.58 : count === 3 ? 0.66 : count === 2 ? 0.76 : 0.86;
  const rand = battleRandom(seed ^ (side === "player" ? 0x9e3779b9 : 0x85ebca6b));
  // 队伍从上往下排，给顶部两军血条面板和底部战报浮层都留出空档。
  const top = 210;
  const bottom = 326;
  const step = count > 1 ? Math.min(56, (bottom - top) / (count - 1)) : 0;
  const start = top + ((bottom - top) - step * (count - 1)) / 2;
  for (let i = 0; i < count; i++) {
    // 阵位带一点按种子固定的错落，不同营地的队列不会像复制粘贴
    const jitterX = (rand() - 0.5) * 18;
    const jitterY = (rand() - 0.5) * 10;
    const stagger = count >= 4 ? (i % 2 === 0 ? -20 : 20) : 0;
    slots.push({
      x: side === "player" ? 258 + stagger + jitterX : 702 - stagger + jitterX,
      y: (start + i * step + jitterY) * k,
      scale,
    });
  }
  return slots;
}

const SQUAD_ARMOR_TIER: Record<string, 1 | 2 | 3> = {
  cloth: 1,
  leather: 1,
  iron_armor: 2,
  heavy_armor: 3,
};

function squadArmorTier(armor: string | null | undefined): 0 | 1 | 2 | 3 {
  if (!armor) return 0;
  if (armor === "leather") return 1;
  return SQUAD_ARMOR_TIER[armor] ?? 0;
}

/** 战阵里的武将按穿戴画出甲片与兵器：换装之后队形里的造型也跟着变。 */
function drawSquadArmor(
  ctx: CanvasRenderingContext2D,
  tier: 0 | 1 | 2 | 3,
  accent: string,
): void {
  if (tier === 0) return;
  const steel = tier >= 2;
  const grad = ctx.createLinearGradient(0, -74, 0, -34);
  if (steel) {
    grad.addColorStop(0, tier === 3 ? "#6c7076" : "#8b9097");
    grad.addColorStop(1, tier === 3 ? "#23262b" : "#3a3f45");
  } else {
    grad.addColorStop(0, "#8a5a36");
    grad.addColorStop(1, "#4a2f1b");
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-17, -60);
  ctx.quadraticCurveTo(0, -72, 17, -60);
  ctx.lineTo(19, -34);
  ctx.quadraticCurveTo(0, -42, -19, -34);
  ctx.closePath();
  ctx.fill();
  // 肩吞
  for (const dir of [-1, 1] as const) {
    ctx.fillStyle = steel ? (tier === 3 ? "#2a2d31" : "#4b5056") : "#5a3a22";
    ctx.beginPath();
    ctx.ellipse(dir * 18, -63, 8, 5, dir * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(dir * 18, -64, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (steel) {
    ctx.strokeStyle = "rgba(232,238,244,0.3)";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 8, -64);
      ctx.lineTo(i * 9, -40);
      ctx.stroke();
    }
  }
  if (tier === 3) {
    ctx.strokeStyle = "#c9a15a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-15, -62);
    ctx.quadraticCurveTo(0, -70, 15, -62);
    ctx.stroke();
  }
}

function drawSquadWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: string | null | undefined,
  accent: string,
): void {
  const kind = weapon ?? "spear";
  if (kind === "fan") {
    ctx.save();
    ctx.translate(22, -52);
    ctx.rotate(-0.3);
    ctx.fillStyle = "rgba(238,232,214,0.95)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 16, -1.9, -0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(120,110,90,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(6, -15);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const shaft = "#4d3a24";
  const steel = "#d8d2c0";
  if (kind === "guandao") {
    ctx.strokeStyle = shaft;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(28, -24);
    ctx.lineTo(42, -96);
    ctx.stroke();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(42, -96);
    ctx.quadraticCurveTo(58, -104, 60, -86);
    ctx.quadraticCurveTo(50, -92, 43, -88);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(41, -88);
    ctx.lineTo(45, -97);
    ctx.stroke();
    return;
  }
  if (kind === "blade") {
    ctx.strokeStyle = shaft;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(27, -22);
    ctx.lineTo(41, -82);
    ctx.stroke();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(38, -80);
    ctx.lineTo(51, -99);
    ctx.lineTo(56, -92);
    ctx.lineTo(43, -75);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (kind === "iron_sword") {
    ctx.strokeStyle = "#3a2c1a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(27, -30);
    ctx.lineTo(36, -52);
    ctx.stroke();
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(34, -52);
    ctx.lineTo(44, -74);
    ctx.lineTo(48, -70);
    ctx.lineTo(38, -47);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(31, -51, 11, 3);
    return;
  }
  // 长枪
  ctx.strokeStyle = shaft;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(26, -22);
  ctx.lineTo(42, -92);
  ctx.stroke();
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(42, -92);
  ctx.lineTo(46, -107);
  ctx.lineTo(50, -92);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(39, -92, 14, 3);
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
  weapon: string | null = null,
  armor: string | null = null,
  rim = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  ctx.globalAlpha = downed ? 0.28 : 1;

  if (rim) {
    const glow = ctx.createRadialGradient(0, -46, 6, 0, -46, 74);
    glow.addColorStop(0, "rgba(255,216,150,0.22)");
    glow.addColorStop(1, "rgba(255,216,150,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -46, 74, 0, Math.PI * 2);
    ctx.fill();
  }

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
  drawSquadArmor(ctx, squadArmorTier(armor), accent);
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
  drawSquadWeapon(ctx, weapon, accent);
  ctx.restore();
}

function findUnit(
  battle: SagaBattleState,
  name: string,
  k: number,
  seed = battleLayoutSeed(battle),
): { unit: typeof battle.party[number]; slot: UnitSlot; side: "player" | "enemy" } | null {
  const playerSlots = unitSlots(battle.party.length, "player", k, seed);
  const enemySlots = unitSlots(battle.enemies.length, "enemy", k, seed);
  const pIndex = battle.party.findIndex((unit) => unit.name === name);
  if (pIndex >= 0) return { unit: battle.party[pIndex], slot: playerSlots[pIndex], side: "player" };
  const eIndex = battle.enemies.findIndex((unit) => unit.name === name);
  if (eIndex >= 0) return { unit: battle.enemies[eIndex], slot: enemySlots[eIndex], side: "enemy" };
  return null;
}

/**
 * 顶部两军兵力面板：左右各占半边，名字、兵力条与残兵数逐行排开，
 * 像吞食天地那样一眼看清两军还剩多少兵。
 */
function paintBattleTeams(
  ctx: CanvasRenderingContext2D,
  battle: SagaBattleState,
  target: number,
  view: SagaView,
): void {
  const panelW = view.w / 2 - 64;
  const leftX = 12;
  const rightX = view.w / 2 + 52;
  const top = 12;
  const rows = Math.max(battle.party.length, battle.enemies.length);
  const panelH = 32 + rows * 22;
  const paintSide = (
    units: typeof battle.party,
    side: "player" | "enemy",
    x: number,
  ): void => {
    ctx.fillStyle = "rgba(14,13,11,0.8)";
    roundRect(ctx, x, top, panelW, panelH, 6);
    ctx.fill();
    ctx.strokeStyle = side === "player" ? "rgba(202,161,90,0.65)" : "rgba(190,110,90,0.65)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const total = units.reduce((sum, unit) => sum + Math.max(0, unit.troops), 0);
    ctx.textAlign = "left";
    ctx.font = uiFont(13);
    ctx.fillStyle = side === "player" ? "#ecd39a" : "#f0c9b4";
    const title =
      side === "player"
        ? `我军 · ${battle.nodeName}`
        : `敌军${battle.boss ? " · 主将" : ""}`;
    ctx.fillText(title.slice(0, 22), x + 12, top + 20);
    ctx.textAlign = "right";
    ctx.font = uiFont(11);
    ctx.fillStyle = "rgba(236,213,171,0.62)";
    ctx.fillText(`总兵力 ${Math.round(total)}`, x + panelW - 12, top + 20);

    units.forEach((unit, index) => {
      const rowY = top + 30 + index * 22;
      if (side === "enemy" && index === target && !unit.downed) {
        ctx.fillStyle = "rgba(240,190,110,0.16)";
        roundRect(ctx, x + 6, rowY, panelW - 12, 19, 3);
        ctx.fill();
      }
      ctx.textAlign = "left";
      ctx.font = uiFont(11);
      ctx.fillStyle = unit.downed ? "rgba(180,170,155,0.55)" : "#f0e2c4";
      const marks = `${unit.downed ? "败 " : ""}${unit.guard ? "守" : ""}${unit.buff > 0 ? "鼓" : ""}${unit.confused > 0 ? "乱" : ""}`;
      const name = `${unit.name} Lv${unit.level}${unit.boss ? "（主将）" : ""}`;
      ctx.fillText(name.slice(0, 16), x + 12, rowY + 13);
      if (marks) {
        ctx.fillStyle = unit.downed ? "#8a8378" : unit.confused > 0 ? "#c9b2ff" : unit.guard ? "#78b4e6" : "#e7a15a";
        ctx.fillText(marks, x + 130, rowY + 13);
      }
      if (side === "player") {
        ctx.fillStyle = "rgba(150,200,240,0.85)";
        ctx.fillText(`策 ${unit.tacticPoints}`, x + 164, rowY + 13);
      }
      const barX = x + (side === "player" ? 200 : 180);
      const barW = Math.max(60, panelW - (side === "player" ? 200 : 180) - 92);
      const ratio = Math.max(0, Math.min(1, unit.troops / unit.maxTroops));
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, barX, rowY + 6, barW, 7, 3);
      ctx.fill();
      if (ratio > 0) {
        ctx.fillStyle = side === "player" ? "#c9a15a" : "#b5533d";
        roundRect(ctx, barX, rowY + 6, barW * ratio, 7, 3);
        ctx.fill();
      }
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(240,226,196,0.82)";
      ctx.font = uiFont(10);
      ctx.fillText(
        `${Math.max(0, Math.round(unit.troops))}/${unit.maxTroops}`,
        x + panelW - 12,
        rowY + 13,
      );
    });
  };
  paintSide(battle.party, "player", leftX);
  paintSide(battle.enemies, "enemy", rightX);

  // 中间窄条：回合数与目标提示
  const chipW = 92;
  ctx.fillStyle = "rgba(16,14,11,0.82)";
  roundRect(ctx, view.w / 2 - chipW / 2, top, chipW, 34, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(202,161,90,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = uiFont(15);
  ctx.fillStyle = "#ecd39a";
  ctx.fillText(`第 ${battle.round} 回合`, view.w / 2, top + 22);
}

/** 画布点击：命中框内取离触点最近的敌将，没点中返回 -1。人多时框会重叠，不能按顺序取第一个。 */
export function battleEnemyAtPoint(
  view: SagaView,
  battle: SagaBattleState,
  x: number,
  y: number,
): number {
  const slots = unitSlots(battle.enemies.length, "enemy", view.k, battleLayoutSeed(battle));
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (Math.abs(x - slot.x) > 58 || y <= slot.y - 120 * slot.scale || y >= slot.y + 24) continue;
    const distance = Math.hypot(x - slot.x, y - (slot.y - 40 * slot.scale));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** 伤害飘字的存活时长：比一条事件节拍长，连击时前几行还挂在空中。 */
export const BATTLE_FLOAT_MS = 900;
const DOWN_STAMP_MS = 760;

/** 顶部兵力面板的底边：飘字钳制在它下面，不然会被面板盖住。 */
function battlePanelBottom(battle: SagaBattleState): number {
  return 12 + 32 + Math.max(battle.party.length, battle.enemies.length) * 22;
}

/** 把动画窗口内的伤害/回复数字逐条画出来，而不是只画当前那一条。 */
function paintBattleFloats(
  ctx: CanvasRenderingContext2D,
  battle: SagaBattleState,
  anim: BattleAnimation,
  elapsed: number,
  k: number,
  seed = battleLayoutSeed(battle),
): void {
  const lanes = new Map<string, number>();
  for (let i = 0; i < anim.events.length; i++) {
    const event = anim.events[i];
    if (event.kind !== "attack" && event.kind !== "tactic" && event.kind !== "heal") continue;
    if (typeof event.amount !== "number" || event.amount <= 0 || !event.target) continue;
    const age = elapsed - i * anim.stepMs;
    // 留一点延迟给刀光先行；飘字有自己的寿命，不受单条节拍限制。
    if (age < 90 || age > BATTLE_FLOAT_MS) continue;
    const anchor = findUnit(battle, event.target, k, seed);
    if (!anchor) continue;
    // 同一目标连续挨打时左右错开，第二、三条不会叠在第一条上。
    const lane = lanes.get(event.target) ?? 0;
    lanes.set(event.target, lane + 1);
    const progress = clamp01((age - 90) / (BATTLE_FLOAT_MS - 90));
    const crit = Boolean(event.crit) && event.kind === "attack";
    const color =
      event.kind === "heal"
        ? "#8ef0b0"
        : event.kind === "tactic"
          ? "#d8b4fe"
          : crit
            ? "#ffd166"
            : "#ffe3b0";
    const size = crit ? 27 : event.kind === "tactic" ? 22 : 20;
    const text = `${event.kind === "heal" ? "+" : "-"}${event.amount}`;
    const x = anchor.slot.x + (crit ? 0 : 26) + [0, 18, -18][lane % 3] + Math.sin(progress * 5) * 2;
    const y = Math.max(
      battlePanelBottom(battle) + 16,
      anchor.slot.y - 96 - progress * 48 - Math.floor(lane / 3) * 18,
    );
    ctx.save();
    ctx.globalAlpha = 1 - progress * progress;
    ctx.textAlign = "center";
    ctx.font = uiFont(size);
    // 深色描边保证在火焰、旗帜与云层上都看得清。
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(10,8,6,0.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    if (crit) {
      ctx.font = uiFont(11);
      ctx.fillStyle = "#ffcf5a";
      ctx.fillText("暴击", x, y - 24);
    }
    ctx.restore();
  }
}

/** 败退章：红印砸落 + 脚下扬尘，比静态「败」字更有结算感。 */
function paintDownStamps(
  ctx: CanvasRenderingContext2D,
  battle: SagaBattleState,
  anim: BattleAnimation,
  elapsed: number,
  k: number,
  seed = battleLayoutSeed(battle),
): void {
  // 败退章的停留窗口跟着节拍缩放：2× 速度下印章也跟着短，不拖到下一回合。
  const span = Math.min(DOWN_STAMP_MS, anim.stepMs * 2.2);
  for (let i = 0; i < anim.events.length; i++) {
    const event = anim.events[i];
    if (event.kind !== "down" || !event.target) continue;
    const age = elapsed - i * anim.stepMs;
    if (age < 0 || age > span) continue;
    const anchor = findUnit(battle, event.target, k, seed);
    if (!anchor) continue;
    const reduced = prefersReducedMotion();
    const grow = reduced || age >= 170 ? 1 : 1.8 - (age / 170) * 0.8;
    const alpha = age > span - 180 ? (span - age) / 180 : 1;
    const y = anchor.slot.y - 74 * Math.max(0.7, anchor.slot.scale);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(anchor.slot.x, y);
    ctx.rotate(-0.1);
    ctx.scale(grow, grow);
    ctx.fillStyle = "rgba(150,38,30,0.22)";
    roundRect(ctx, -26, -26, 52, 52, 9);
    ctx.fill();
    ctx.strokeStyle = "rgba(224,86,68,0.92)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = uiFont(30);
    ctx.fillStyle = "#f2bdb0";
    ctx.fillText("败", 0, 2);
    ctx.restore();

    if (reduced) continue;
    const dust = clamp01(age / 420);
    ctx.save();
    ctx.globalAlpha = (1 - dust) * 0.6;
    ctx.fillStyle = "rgba(214,196,166,0.6)";
    for (let d = 0; d < 3; d++) {
      const angle = Math.PI + (d - 1) * 0.55;
      ctx.beginPath();
      ctx.ellipse(
        anchor.slot.x + Math.cos(angle) * (16 + dust * 30),
        anchor.slot.y + 4 - dust * 8,
        12 + dust * 10,
        5 + dust * 4,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 中式飞檐：中间高脊、两端上翘，瓦面下压一道深色檐影。 */
function paintEaves(
  ctx: CanvasRenderingContext2D,
  x: number,
  ridgeY: number,
  halfW: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - halfW, ridgeY + h * 0.55);
  ctx.quadraticCurveTo(x - halfW * 0.55, ridgeY + h, x, ridgeY);
  ctx.quadraticCurveTo(x + halfW * 0.55, ridgeY + h, x + halfW, ridgeY + h * 0.55);
  ctx.quadraticCurveTo(x + halfW * 0.6, ridgeY + h * 0.92, x, ridgeY + h);
  ctx.quadraticCurveTo(x - halfW * 0.6, ridgeY + h * 0.92, x - halfW, ridgeY + h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(16,14,11,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - halfW * 0.88, ridgeY + h * 0.66);
  ctx.quadraticCurveTo(x, ridgeY + h * 1.1, x + halfW * 0.88, ridgeY + h * 0.66);
  ctx.stroke();
}

/** 旗杆 + 三角旗，用时间推摆动；竹节纹只画一条，远看够用。 */
function paintVenueBanner(
  ctx: CanvasRenderingContext2D,
  time: number,
  x: number,
  baseY: number,
  height: number,
  color: string,
): void {
  ctx.strokeStyle = "#241d15";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, baseY - height);
  ctx.stroke();
  const wave = Math.sin(time * 2 + x * 0.05) * 5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, baseY - height);
  ctx.lineTo(x + 34, baseY - height + 10 + wave);
  ctx.lineTo(x, baseY - height + 42);
  ctx.closePath();
  ctx.fill();
}

/** 营门 / 城楼下的挂灯，暖光会随天色轻微呼吸。 */
function paintHangingLantern(
  ctx: CanvasRenderingContext2D,
  time: number,
  x: number,
  y: number,
  scale = 1,
): void {
  const sway = Math.sin(time * 1.6 + x * 0.05) * 3;
  ctx.strokeStyle = "rgba(28,22,14,0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + sway, y + 15 * scale);
  ctx.stroke();
  const lx = x + sway;
  const ly = y + 15 * scale;
  const glow = ctx.createRadialGradient(lx, ly + 7 * scale, 2, lx, ly + 7 * scale, 30 * scale);
  glow.addColorStop(0, "rgba(255,190,110,0.4)");
  glow.addColorStop(1, "rgba(255,158,80,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(lx - 34 * scale, ly - 26 * scale, 68 * scale, 66 * scale);
  ctx.fillStyle = "#b5482f";
  roundRect(ctx, lx - 6 * scale, ly, 12 * scale, 16 * scale, 4 * scale);
  ctx.fill();
  ctx.fillStyle = "rgba(255,214,140,0.85)";
  ctx.fillRect(lx - 3.5 * scale, ly + 3 * scale, 7 * scale, 10 * scale);
  ctx.strokeStyle = "#c99a58";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lx - 7 * scale, ly);
  ctx.lineTo(lx + 7 * scale, ly);
  ctx.moveTo(lx - 7 * scale, ly + 16 * scale);
  ctx.lineTo(lx + 7 * scale, ly + 16 * scale);
  ctx.stroke();
}

function paintCampTent(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  s: number,
  variant: boolean,
): void {
  const w = 74 * s;
  const h = 70 * s;
  ctx.fillStyle = variant ? "#51483a" : "#5d5342";
  ctx.beginPath();
  ctx.moveTo(x - w, baseY);
  ctx.lineTo(x, baseY - h);
  ctx.lineTo(x + w, baseY);
  ctx.closePath();
  ctx.fill();
  // 受光面偏一点暖色，背面压暗，帐篷才有体积
  ctx.fillStyle = "rgba(255,232,190,0.09)";
  ctx.beginPath();
  ctx.moveTo(x - w, baseY);
  ctx.lineTo(x, baseY - h);
  ctx.lineTo(x - w * 0.18, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(20,16,11,0.4)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, baseY);
  ctx.lineTo(x + w, baseY);
  ctx.lineTo(x, baseY - h);
  ctx.closePath();
  ctx.fill();
  // 门帘
  ctx.fillStyle = "#241c12";
  ctx.beginPath();
  ctx.moveTo(x - 13 * s, baseY);
  ctx.lineTo(x, baseY - 36 * s);
  ctx.lineTo(x + 13 * s, baseY);
  ctx.closePath();
  ctx.fill();
  // 顶杆与号旗
  ctx.strokeStyle = "#2c2217";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, baseY - h);
  ctx.lineTo(x, baseY - h - 26 * s);
  ctx.stroke();
  ctx.fillStyle = variant ? "#243a5e" : "#7d2f2a";
  ctx.beginPath();
  ctx.moveTo(x, baseY - h - 26 * s);
  ctx.lineTo(x + 24 * s, baseY - h - 19 * s);
  ctx.lineTo(x, baseY - h - 6 * s);
  ctx.closePath();
  ctx.fill();
}

/** 营寨望楼：四腿交叉撑地，平台上一圈短栏，顶棚再插一面号旗。 */
function paintCampWatchtower(
  ctx: CanvasRenderingContext2D,
  time: number,
  x: number,
  baseY: number,
): void {
  const platform = baseY - 82;
  ctx.strokeStyle = "#3a2c1c";
  ctx.lineWidth = 6;
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dir * 26, platform);
    ctx.lineTo(x + dir * 38, baseY);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 32, baseY);
  ctx.lineTo(x + 28, platform);
  ctx.moveTo(x + 32, baseY);
  ctx.lineTo(x - 28, platform);
  ctx.stroke();
  ctx.fillStyle = "#5a4530";
  ctx.fillRect(x - 42, platform - 8, 84, 10);
  ctx.fillStyle = "#4a3826";
  for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * 12 - 2, platform - 26, 4, 18);
  ctx.fillRect(x - 42, platform - 30, 84, 5);
  ctx.fillStyle = "#6b5334";
  ctx.beginPath();
  ctx.moveTo(x - 50, platform - 30);
  ctx.lineTo(x, platform - 54);
  ctx.lineTo(x + 50, platform - 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2c2217";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, platform - 54);
  ctx.lineTo(x, platform - 88);
  ctx.stroke();
  const wave = Math.sin(time * 2.4 + x) * 4;
  ctx.fillStyle = "#7d2f2a";
  ctx.beginPath();
  ctx.moveTo(x, platform - 88);
  ctx.lineTo(x + 28, platform - 82 + wave);
  ctx.lineTo(x, platform - 64);
  ctx.closePath();
  ctx.fill();
}

/** 营地篝火：柴堆 + 火苗 + 呼吸感的暖光。 */
function paintCampfire(ctx: CanvasRenderingContext2D, time: number, x: number, y: number): void {
  const flicker = 0.82 + Math.sin(time * 7.3) * 0.1 + Math.sin(time * 13.7) * 0.05;
  const glow = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 84 * flicker);
  glow.addColorStop(0, "rgba(255,176,84,0.32)");
  glow.addColorStop(0.55, "rgba(255,130,52,0.12)");
  glow.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 90, y - 100, 180, 132);
  ctx.strokeStyle = "#3a2a1a";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 22, y + 3);
  ctx.lineTo(x + 20, y - 4);
  ctx.moveTo(x - 20, y - 4);
  ctx.lineTo(x + 22, y + 3);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(time * (6 + i * 1.7) + i) * 4;
    const h = (26 + i * 5) * flicker;
    ctx.fillStyle = i === 0 ? "rgba(255,206,110,0.88)" : "rgba(255,124,50,0.7)";
    ctx.beginPath();
    ctx.moveTo(x - 13 + i * 9, y - 2);
    ctx.quadraticCurveTo(x - 6 + i * 9 + sway, y - h * 0.55, x - 9 + i * 9 + sway * 0.5, y - h);
    ctx.quadraticCurveTo(x + 2 + i * 9 + sway, y - h * 0.4, x + 13 + i * 9, y - 2);
    ctx.closePath();
    ctx.fill();
  }
}

/** 兵器架：两根斜撑 + 四杆长枪，营地里补一处兵营细节。 */
function paintWeaponRack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = "#3a2c1c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 26, y);
  ctx.lineTo(x - 16, y - 36);
  ctx.moveTo(x + 26, y);
  ctx.lineTo(x + 16, y - 36);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const bx = x - 18 + i * 12;
    const tipX = bx - 10 + i * 4;
    const tipY = y - 58 - (i % 2) * 9;
    ctx.strokeStyle = "#5c4a30";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = "#9aa0a6";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - 3, tipY - 12);
    ctx.lineTo(tipX + 4, tipY - 12);
    ctx.closePath();
    ctx.fill();
  }
}

function paintSupplyCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
): void {
  const w = 32 * s;
  const h = 26 * s;
  ctx.fillStyle = "#4a3722";
  ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = "rgba(18,13,8,0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w / 2, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.moveTo(x + w / 2, y - h);
  ctx.lineTo(x - w / 2, y);
  ctx.stroke();
}

/** 营寨内景：木栅、帐幔、望楼与门前篝火，按种子换摆位。 */
function paintCampVenue(
  ctx: CanvasRenderingContext2D,
  time: number,
  view: SagaView,
  rand: () => number,
): void {
  const gy = view.groundY;
  const baseY = gy - 168;
  const gateX = 260 + rand() * 440;
  const gateW = 84;

  for (let i = 0; i < 3; i++) {
    const tx = 110 + i * 290 + rand() * 90;
    if (Math.abs(tx - gateX) < 110) continue;
    paintCampTent(ctx, tx, baseY - 30, 0.9 + rand() * 0.28, rand() > 0.5);
  }
  paintCampWatchtower(ctx, time, 862 + rand() * 36, baseY);

  // 木栅：尖头木桩逐根歪一点，门洞处留空
  for (let x = -14; x < view.w + 14; x += 30) {
    if (Math.abs(x - gateX) < gateW / 2 + 6) continue;
    const h = 56 + rand() * 26;
    const lean = (rand() - 0.5) * 4;
    ctx.fillStyle = rand() > 0.5 ? "#4a3826" : "#3d2d1e";
    ctx.beginPath();
    ctx.moveTo(x - 8, baseY);
    ctx.lineTo(x - 6 + lean, baseY - h + 12);
    ctx.lineTo(x + lean, baseY - h);
    ctx.lineTo(x + 6 + lean, baseY - h + 12);
    ctx.lineTo(x + 8, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + 2, baseY - h + 16, 4, h - 16);
  }
  ctx.fillStyle = "#5b4530";
  ctx.fillRect(-10, baseY - 34, view.w + 20, 7);
  ctx.fillRect(-10, baseY - 62, view.w + 20, 6);

  // 寨门
  ctx.fillStyle = "#2b2116";
  ctx.fillRect(gateX - gateW / 2, baseY - 94, gateW, 94);
  const doorGlow = ctx.createLinearGradient(0, baseY - 90, 0, baseY);
  doorGlow.addColorStop(0, "rgba(255,178,96,0)");
  doorGlow.addColorStop(1, "rgba(255,166,84,0.3)");
  ctx.fillStyle = doorGlow;
  ctx.fillRect(gateX - gateW / 2 + 4, baseY - 90, gateW - 8, 90);
  ctx.fillStyle = "#3d2b1a";
  ctx.fillRect(gateX - gateW / 2 - 9, baseY - 100, 11, 100);
  ctx.fillRect(gateX + gateW / 2 - 2, baseY - 100, 11, 100);
  ctx.fillStyle = "#5b4530";
  ctx.fillRect(gateX - gateW / 2 - 14, baseY - 108, gateW + 28, 11);
  paintHangingLantern(ctx, time, gateX, baseY - 108, 1);

  // 栅上号旗
  const bannerXs = [90 + rand() * 200, 640 + rand() * 220];
  for (const bx of bannerXs) {
    if (Math.abs(bx - gateX) < 100) continue;
    paintVenueBanner(ctx, time, bx, baseY - 24, 88, "#7d2f2a");
  }

  // 近景：篝火、兵器架、粮箱，落在队列脚下，不遮挡武将
  paintCampfire(ctx, time, 118, gy - 46);
  paintWeaponRack(ctx, 838, gy - 22);
  paintSupplyCrate(ctx, 196, gy - 26, 1);
  paintSupplyCrate(ctx, 782, gy - 24, 0.72);
}

/** 城墙马面：比墙体略高出一截，顶部压一片飞檐。 */
function paintWallTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  wallTop: number,
  baseY: number,
  s: number,
): void {
  const w = 58 * s;
  ctx.fillStyle = "#514b41";
  ctx.fillRect(x - w / 2, wallTop - 26 * s, w, baseY - wallTop + 26 * s);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(x + w / 2 - 8, wallTop - 26 * s, 8, baseY - wallTop + 26 * s);
  ctx.fillStyle = "#5d574b";
  ctx.fillRect(x - w / 2, wallTop - 26 * s, w, 5);
  paintEaves(ctx, x, wallTop - 62 * s, w * 0.82, 24 * s, "#2f3438");
}

/** 敌城内景：砖石城墙、紧闭的城门、城楼飞檐与墙头挂灯。 */
function paintCityVenue(
  ctx: CanvasRenderingContext2D,
  time: number,
  view: SagaView,
  rand: () => number,
): void {
  const gy = view.groundY;
  const baseY = gy - 166;
  const wallH = 92;
  const wallTop = baseY - wallH;
  const gateX = 400 + rand() * 140;
  const gateW = 96;

  const wall = ctx.createLinearGradient(0, wallTop, 0, baseY);
  wall.addColorStop(0, "#5e584c");
  wall.addColorStop(1, "#35312a");
  ctx.fillStyle = wall;
  ctx.fillRect(0, wallTop, view.w, wallH);

  ctx.strokeStyle = "rgba(22,20,16,0.32)";
  ctx.lineWidth = 1;
  let row = 0;
  for (let y = wallTop + 18; y < baseY; y += 18, row++) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.w, y);
    ctx.stroke();
    for (let x = (row % 2) * 26; x < view.w; x += 52) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 18);
      ctx.stroke();
    }
  }

  // 垛口
  for (let x = -8; x < view.w + 8; x += 34) {
    if (Math.abs(x - gateX) < 96) continue;
    ctx.fillStyle = "#6a6357";
    ctx.fillRect(x, wallTop - 16, 21, 16);
    ctx.fillStyle = "rgba(20,18,14,0.35)";
    ctx.fillRect(x, wallTop - 2, 21, 3);
  }

  // 墙根积影与苔痕
  const foot = ctx.createLinearGradient(0, baseY - 26, 0, baseY);
  foot.addColorStop(0, "rgba(12,12,10,0)");
  foot.addColorStop(1, "rgba(12,12,10,0.5)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, baseY - 26, view.w, 26);
  ctx.fillStyle = "rgba(70,92,54,0.22)";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(rand() * view.w, baseY - 18 - rand() * 30, 10 + rand() * 26, 4 + rand() * 10);
  }

  // 城门洞
  ctx.fillStyle = "#191410";
  ctx.beginPath();
  ctx.moveTo(gateX - gateW / 2, baseY);
  ctx.lineTo(gateX - gateW / 2, baseY - 58);
  ctx.quadraticCurveTo(gateX, baseY - 108, gateX + gateW / 2, baseY - 58);
  ctx.lineTo(gateX + gateW / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // 紧闭的双扇门 + 门钉
  ctx.fillStyle = "#3a2417";
  ctx.fillRect(gateX - gateW / 2 + 7, baseY - 62, gateW - 14, 62);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fillRect(gateX - 2, baseY - 62, 4, 62);
  ctx.fillStyle = "#c9a15a";
  for (let r = 0; r < 3; r++) {
    for (const dir of [-1, 1] as const) {
      for (let c = 0; c < 2; c++) {
        ctx.beginPath();
        ctx.arc(gateX + dir * (14 + c * 16), baseY - 46 + r * 16, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 城楼：木身 + 朱柱 + 暖窗 + 飞檐
  const houseW = 168;
  const houseTop = wallTop - 56;
  ctx.fillStyle = "#473a2b";
  ctx.fillRect(gateX - houseW / 2, houseTop, houseW, 56);
  ctx.fillStyle = "rgba(20,18,14,0.3)";
  ctx.fillRect(gateX - houseW / 2, houseTop + 48, houseW, 8);
  ctx.fillStyle = "#8a3a30";
  ctx.fillRect(gateX - houseW / 2 + 12, houseTop, 11, 56);
  ctx.fillRect(gateX + houseW / 2 - 23, houseTop, 11, 56);
  ctx.fillStyle = "rgba(255,198,118,0.55)";
  ctx.fillRect(gateX - 52, houseTop + 20, 24, 20);
  ctx.fillRect(gateX + 28, houseTop + 20, 24, 20);
  ctx.strokeStyle = "rgba(40,26,16,0.8)";
  ctx.lineWidth = 1.5;
  for (const wx of [gateX - 52, gateX + 28]) {
    ctx.strokeRect(wx, houseTop + 20, 24, 20);
    ctx.beginPath();
    ctx.moveTo(wx + 12, houseTop + 20);
    ctx.lineTo(wx + 12, houseTop + 40);
    ctx.stroke();
  }
  paintEaves(ctx, gateX, houseTop - 46, houseW * 0.68, 46, "#2f3438");

  for (const [tx, s] of [
    [118 + rand() * 60, 0.94],
    [854 + rand() * 40, 1],
  ] as [number, number][]) {
    paintWallTower(ctx, tx, wallTop, baseY, s);
  }

  // 墙头挂灯
  paintHangingLantern(ctx, time, gateX - 78, wallTop - 4, 0.9);
  paintHangingLantern(ctx, time, gateX + 78, wallTop - 4, 0.9);

  // 墙头军旗
  const bannerXs = [150 + rand() * 160, 660 + rand() * 190];
  for (const bx of bannerXs) {
    if (Math.abs(bx - gateX) < 150) continue;
    paintVenueBanner(ctx, time, bx, wallTop - 16, 76, "#243a5e");
  }

  // 墙下碎石
  ctx.fillStyle = "rgba(78,73,63,0.85)";
  for (let i = 0; i < 8; i++) {
    const rx = rand() * view.w;
    const ry = gy - 20 - rand() * 24;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 5 + rand() * 9, 3 + rand() * 4, rand() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 战斗内景：普通营寨画木栅帐篷，主将坐镇的敌城画石墙城楼。 */
function paintBattleVenue(
  ctx: CanvasRenderingContext2D,
  time: number,
  view: SagaView,
  mood: SkyMood,
  seed: number,
  venue: "camp" | "city",
): void {
  const gy = view.groundY;
  const rand = battleRandom(seed ^ 0x51ed270b);

  // 战场台地：上缘融进远山，下缘淡进地面，武将队列就站在这一带
  const dirt = ctx.createLinearGradient(0, gy - 256, 0, gy - 26);
  dirt.addColorStop(0, "rgba(92,72,48,0)");
  dirt.addColorStop(0.16, "rgba(92,72,48,0.62)");
  dirt.addColorStop(0.62, "rgba(66,52,35,0.88)");
  dirt.addColorStop(1, "rgba(46,37,26,0)");
  ctx.fillStyle = dirt;
  ctx.fillRect(0, gy - 256, view.w, 230);

  if (venue === "city") paintCityVenue(ctx, time, view, rand);
  else paintCampVenue(ctx, time, view, rand);

  // 章节色雾压一层，石墙木栅才不会和天候脱节
  ctx.fillStyle = mood.fieldTint;
  ctx.fillRect(0, gy - 256, view.w, 230);
}

export function paintBattle(ctx: CanvasRenderingContext2D, options: BattlePaintOptions): void {
  const { battle, time, target } = options;
  const view = options.view ?? DEFAULT_VIEW;
  const mood = skyMoodFor(options.chapterIndex ?? 0);
  const anim = options.animation;
  // time 是秒（环境动画用），动画节拍是毫秒：统一到毫秒再算已播时长。
  const elapsed = anim ? Math.max(0, (options.nowMs ?? time * 1000) - anim.startedAt) : 0;
  const eventIndex = anim ? Math.floor(elapsed / anim.stepMs) : -1;
  const currentEvent =
    anim && eventIndex >= 0 && eventIndex < anim.events.length ? anim.events[eventIndex] : null;
  const eventProgress = anim
    ? Math.min(1, Math.max(0, (elapsed - eventIndex * anim.stepMs) / anim.stepMs))
    : 0;

  // 震屏与冲击白闪都由当前事件的类型与进度推出来，不掷随机数，回放才稳定。
  // 系统要求减少动态效果时只保留白闪，不抖画面。
  const reducedMotion = prefersReducedMotion();
  const darkStage = isDarkMood(mood);
  let shakeX = 0;
  let shakeY = 0;
  if (!reducedMotion && currentEvent && eventProgress < 0.6) {
    const power =
      currentEvent.kind === "down"
        ? 9
        : currentEvent.crit
          ? 8
          : currentEvent.kind === "tactic"
            ? 5
            : currentEvent.kind === "attack"
              ? 3
              : 0;
    if (power > 0) {
      const damp = 1 - eventProgress / 0.6;
      shakeX = Math.sin(elapsed * 0.085) * power * damp;
      shakeY = Math.cos(elapsed * 0.12) * power * 0.7 * damp;
    }
  }
  const impact =
    currentEvent &&
    currentEvent.kind === "attack" &&
    eventProgress < 0.45 &&
    (currentEvent.crit || (currentEvent.amount ?? 0) >= 60)
      ? (1 - eventProgress / 0.45) * (currentEvent.crit ? 0.28 : 0.18)
      : 0;

  // 正在落章的败将用动态印章，静态「败」字先让位，避免两行字叠在一起。
  const stamping = new Set<string>();
  if (anim) {
    const stampMs = Math.min(DOWN_STAMP_MS, anim.stepMs * 2.2);
    for (let i = 0; i < anim.events.length; i++) {
      const event = anim.events[i];
      if (event.kind !== "down" || !event.target) continue;
      const age = elapsed - i * anim.stepMs;
      if (age >= 0 && age <= stampMs) stamping.add(event.target);
    }
  }

  // 震屏会露出画布边缘，先铺一层同色底，抖起来像暗边而不是空白。
  ctx.fillStyle = mood.base;
  ctx.fillRect(0, 0, view.w, view.h);

  ctx.save();
  ctx.translate(shakeX, shakeY);

  paintBackdrop(ctx, time + 4, view, mood);
  paintGround(ctx, 0, view, mood);

  // 内景与阵位共用一个种子：同一座营 / 城每次进场长得一样，换节点才变
  const layoutSeed = options.layoutSeed ?? battleLayoutSeed(battle);
  paintBattleVenue(ctx, time, view, mood, layoutSeed, battle.boss ? "city" : "camp");

  // 顶部两军兵力面板在震屏之外绘制：抖的是战场，不是 HUD。
  const playerSlots = unitSlots(battle.party.length, "player", view.k, layoutSeed);
  const enemySlots = unitSlots(battle.enemies.length, "enemy", view.k, layoutSeed);

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
      unit.weapon,
      unit.armor,
      !unit.downed && darkStage,
    );
    ctx.filter = "none";
    ctx.restore();

    if (unit.downed && !stamping.has(unit.name)) {
      ctx.fillStyle = "rgba(230,200,180,0.7)";
      ctx.font = uiFont(12);
      ctx.textAlign = "center";
      ctx.fillText("败", slot.x, slot.y - 112 * slot.scale);
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
    const actor = findUnit(battle, currentEvent.actor, view.k, layoutSeed);
    const victim = currentEvent.target
      ? findUnit(battle, currentEvent.target, view.k, layoutSeed)
      : null;
    if (currentEvent.kind === "attack" && victim) {
      const progress = Math.min(1, eventProgress / 0.6);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = currentEvent.crit ? "#fff1c4" : "#ffe9b8";
      ctx.lineWidth = currentEvent.crit ? 7 : 5;
      ctx.beginPath();
      ctx.arc(
        victim.slot.x,
        victim.slot.y - 46,
        30 + progress * (currentEvent.crit ? 40 : 26),
        -1.2,
        0.9,
      );
      ctx.stroke();
      ctx.restore();
    }
    if (currentEvent.kind === "tactic" && victim) {
      // 计策：紫气扩散环 + 火星，和普攻的刀光区分开。
      ctx.save();
      ctx.globalAlpha = 1 - eventProgress;
      ctx.strokeStyle = "rgba(190,130,255,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(
        victim.slot.x,
        victim.slot.y - 26,
        18 + eventProgress * 66,
        (18 + eventProgress * 66) * 0.55,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 10 + eventProgress * 50;
        const purple = i % 3 === 0;
        ctx.fillStyle = purple
          ? `rgba(196,140,255,${1 - eventProgress})`
          : `rgba(255,${120 + i * 4},60,${1 - eventProgress})`;
        ctx.beginPath();
        ctx.arc(
          victim.slot.x + Math.cos(angle) * radius,
          victim.slot.y - 30 + Math.sin(angle) * radius * 0.6,
          purple ? 3 : 4 + (i % 3),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    if (currentEvent.kind === "heal" && victim) {
      // 回复：绿色光点绕着身体往上飘。
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        ctx.fillStyle = `rgba(126,230,160,${0.8 * (1 - eventProgress)})`;
        ctx.beginPath();
        ctx.arc(
          victim.slot.x + Math.cos(angle) * (12 + i * 2),
          victim.slot.y - 40 - eventProgress * 44 + Math.sin(angle) * 10,
          2.2 + (i % 2),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
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
    if (currentEvent.kind === "miss" && victim) {
      ctx.fillStyle = `rgba(220,214,200,${1 - eventProgress})`;
      ctx.font = uiFont(16);
      ctx.textAlign = "center";
      ctx.fillText("落空", victim.slot.x, victim.slot.y - 74 - eventProgress * 20);
    }
    if (currentEvent.kind === "recruit" && victim) {
      ctx.fillStyle = `rgba(240,210,130,${1 - eventProgress})`;
      ctx.font = uiFont(16);
      ctx.textAlign = "center";
      ctx.fillText("归顺", victim.slot.x, victim.slot.y - 70 - eventProgress * 20);
    }
    if (currentEvent.kind === "level" && actor) {
      ctx.fillStyle = `rgba(255,214,102,${1 - eventProgress})`;
      ctx.font = uiFont(17);
      ctx.textAlign = "center";
      ctx.fillText("升级！", actor.slot.x, actor.slot.y - 96 - eventProgress * 24);
    }
  }

  if (anim) paintDownStamps(ctx, battle, anim, elapsed, view.k, layoutSeed);

  ctx.restore();

  if (impact > 0) {
    ctx.fillStyle = `rgba(255,244,220,${impact})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  // 顶部两军兵力面板（左右各半边）
  paintBattleTeams(ctx, battle, target, view);

  // 飘字画在面板之后：位置已钳制在面板下方，既不会被兵力条盖掉，也不遮挡面板。
  if (anim) paintBattleFloats(ctx, battle, anim, elapsed, view.k, layoutSeed);

  const vignette = ctx.createRadialGradient(
    view.w / 2,
    view.h / 2,
    Math.min(view.w, view.h) * 0.48,
    view.w / 2,
    view.h / 2,
    Math.max(view.w, view.h) * 0.6,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.46)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.w, view.h);
}
