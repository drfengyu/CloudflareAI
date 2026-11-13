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
  { id: "train", label: "训练场", hint: "花试炼券逐级提升武将等级" },
  { id: "forge", label: "铁匠铺", hint: "用试炼券打造武器与防具" },
  { id: "herb", label: "药铺", hint: "用试炼券购买伤药与良药" },
  { id: "supply", label: "军需帐", hint: "用试炼券购买此行军需" },
  { id: "inn", label: "客栈", hint: "花试炼券歇脚，补满上阵武将兵力" },
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

function paintBackdrop(ctx: CanvasRenderingContext2D, time: number, view: SagaView): void {
  const k = view.k;
  const sky = ctx.createLinearGradient(0, 0, 0, view.h);
  sky.addColorStop(0, "#141d33");
  sky.addColorStop(0.34, "#2d3350");
  sky.addColorStop(0.62, "#7a4a4a");
  sky.addColorStop(0.8, "#d08a58");
  sky.addColorStop(1, "#e8b57a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.w, view.h);

  const sun = ctx.createRadialGradient(760, 300 * k, 10, 760, 300 * k, 220);
  sun.addColorStop(0, "rgba(255,226,170,0.9)");
  sun.addColorStop(0.3, "rgba(255,190,120,0.35)");
  sun.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(520, 120 * k, 440, 360 * k);

  // 远山：三层墨色剪影
  const layers: { base: number; amp: number; color: string; phase: number }[] = [
    { base: 316, amp: 42, color: "#2a3345", phase: 0.4 },
    { base: 344, amp: 34, color: "#232c3c", phase: 1.7 },
    { base: 372, amp: 26, color: "#1c2431", phase: 3.1 },
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
  mist.addColorStop(1, "rgba(226,196,160,0.16)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, 300 * k, view.w, 140 * k);

  // 飘动的云/尘
  ctx.fillStyle = "rgba(255,220,180,0.09)";
  for (let i = 0; i < 5; i++) {
    const x = ((time * (8 + i * 3) + i * 240) % (view.w + 240)) - 120;
    const y = (120 + i * 34 + Math.sin(time + i) * 6) * k;
    ctx.beginPath();
    ctx.ellipse(x, y, 80 + i * 16, 10 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGround(ctx: CanvasRenderingContext2D, camera: number, view: SagaView): void {
  const gy = view.groundY;
  const ground = ctx.createLinearGradient(0, gy - 26, 0, view.h);
  ground.addColorStop(0, "#4a4433");
  ground.addColorStop(0.4, "#3a3729");
  ground.addColorStop(1, "#23231c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, gy - 26, view.w, view.h - gy + 26);

  // 石板路
  ctx.fillStyle = "#5c5341";
  ctx.fillRect(0, gy + 6, view.w, 76);
  ctx.strokeStyle = "rgba(24,22,18,0.5)";
  ctx.lineWidth = 1;
  const offset = camera % 96;
  for (let x = -offset - 96; x < view.w + 96; x += 96) {
    ctx.strokeRect(x, gy + 6, 96, 38);
    ctx.strokeRect(x + 48, gy + 44, 96, 38);
  }
  ctx.fillStyle = "rgba(255,214,150,0.05)";
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

function paintFieldHero(
  ctx: CanvasRenderingContext2D,
  options: FieldPaintOptions,
  camX: number,
  camY: number,
): void {
  const { time, facing, moving, partyColor, partyAccent } = options;
  const x = options.x - camX;
  const y = options.y - camY;
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
  target: number;
  animation?: BattleAnimation | null;
  /** 逻辑视野；省略则按 960×540（16:9）画。 */
  view?: SagaView;
}

interface UnitSlot {
  x: number;
  y: number;
  scale: number;
}

/** 两军各排成一列，从上往下就位；人多时整体缩小，避免队列挤出屏幕。 */
function unitSlots(count: number, side: "player" | "enemy", k = 1): UnitSlot[] {
  const slots: UnitSlot[] = [];
  const scale =
    count >= 5 ? 0.52 : count === 4 ? 0.58 : count === 3 ? 0.66 : count === 2 ? 0.76 : 0.86;
  // 队伍从上往下排，给顶部两军血条面板和底部战报浮层都留出空档。
  const top = 210;
  const bottom = 326;
  const step = count > 1 ? Math.min(56, (bottom - top) / (count - 1)) : 0;
  const start = top + ((bottom - top) - step * (count - 1)) / 2;
  for (let i = 0; i < count; i++) {
    const stagger = count >= 4 ? (i % 2 === 0 ? -20 : 20) : 0;
    slots.push({
      x: side === "player" ? 258 + stagger : 702 - stagger,
      y: (start + i * step) * k,
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
): { unit: typeof battle.party[number]; slot: UnitSlot; side: "player" | "enemy" } | null {
  const playerSlots = unitSlots(battle.party.length, "player", k);
  const enemySlots = unitSlots(battle.enemies.length, "enemy", k);
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

/** 画布点击：点在哪个敌将身上就返回哪个下标，没点中返回 -1。 */
export function battleEnemyAtPoint(
  view: SagaView,
  battle: SagaBattleState,
  x: number,
  y: number,
): number {
  const slots = unitSlots(battle.enemies.length, "enemy", view.k);
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (Math.abs(x - slot.x) <= 58 && y > slot.y - 120 * slot.scale && y < slot.y + 24) {
      return index;
    }
  }
  return -1;
}

export function paintBattle(ctx: CanvasRenderingContext2D, options: BattlePaintOptions): void {
  const { battle, time, target } = options;
  const view = options.view ?? DEFAULT_VIEW;
  const gy = view.groundY;
  const anim = options.animation;
  const elapsed = anim ? time - anim.startedAt : 0;
  const eventIndex = anim ? Math.floor(elapsed / anim.stepMs) : -1;
  const currentEvent = anim && eventIndex >= 0 && eventIndex < anim.events.length ? anim.events[eventIndex] : null;
  const eventProgress = anim
    ? Math.min(1, Math.max(0, (elapsed - eventIndex * anim.stepMs) / anim.stepMs))
    : 0;

  paintBackdrop(ctx, time + 4, view);
  paintGround(ctx, 0, view);

  // 战场土坡与军旗
  const field = ctx.createLinearGradient(0, gy - 40, 0, view.h);
  field.addColorStop(0, "rgba(94,72,46,0.4)");
  field.addColorStop(1, "rgba(30,26,20,0.85)");
  ctx.fillStyle = field;
  ctx.fillRect(0, gy - 40, view.w, view.h - gy + 40);
  for (const [bx, color] of [
    [80, "#7d2f2a"],
    [330, "#7d2f2a"],
    [650, "#243a5e"],
    [880, "#243a5e"],
  ] as [number, string][]) {
    ctx.strokeStyle = "#241d15";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx, gy + 4);
    ctx.lineTo(bx, gy - 156);
    ctx.stroke();
    const wave = Math.sin(time * 2 + bx) * 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(bx, gy - 156);
    ctx.lineTo(bx + 40, gy - 146 + wave);
    ctx.lineTo(bx, gy - 112);
    ctx.closePath();
    ctx.fill();
  }

  // 顶部两军兵力面板（左右各半边）
  paintBattleTeams(ctx, battle, target, view);

  const playerSlots = unitSlots(battle.party.length, "player", view.k);
  const enemySlots = unitSlots(battle.enemies.length, "enemy", view.k);

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
    );
    ctx.filter = "none";
    ctx.restore();

    if (unit.downed) {
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
    const actor = findUnit(battle, currentEvent.actor, view.k);
    const victim = currentEvent.target ? findUnit(battle, currentEvent.target, view.k) : null;
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
