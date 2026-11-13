import {
  WORKSHOP_TILE_CAMP,
  WORKSHOP_TILE_FLOWER,
  WORKSHOP_TILE_GYM,
  WORKSHOP_TILE_PATH,
  WORKSHOP_TILE_ROCK,
  WORKSHOP_TILE_TALL,
  WORKSHOP_TILE_TREE,
  WORKSHOP_TILE_WATER,
  fieldTileAt,
  type WorkshopField,
  type WorkshopFieldHotspot,
} from "@/lib/workshop/field";

/**
 * 灵宠工坊冒险地图的绘制：红白机配色 + 32px 格，纯函数、无状态。
 *
 * 与 `lib/workshop/field.ts` 同一份地图数据：这里只负责把格画出来，
 * 主角走到哪、会不会遇敌都由服务端的重放说了算，画布只是它的影子。
 */

export const WORKSHOP_VIEW_W = 640;
export const WORKSHOP_VIEW_H = 360;

/** 逻辑视野：宽恒 640（约 20 格），高按画布实际比例给。 */
export interface WorkshopView {
  w: number;
  h: number;
}

export const DEFAULT_WORKSHOP_VIEW: WorkshopView = { w: WORKSHOP_VIEW_W, h: WORKSHOP_VIEW_H };

export function makeWorkshopView(height: number): WorkshopView {
  const h = Math.max(280, Math.min(900, Math.round(Number(height) || WORKSHOP_VIEW_H)));
  return { w: WORKSHOP_VIEW_W, h };
}

export type WorkshopFacing = "up" | "down" | "left" | "right";

export interface WorkshopFieldPaintOptions {
  field: WorkshopField;
  time: number;
  view?: WorkshopView;
  /** 主角脚底像素坐标。 */
  x: number;
  y: number;
  facing: WorkshopFacing;
  moving: boolean;
  hotspot: WorkshopFieldHotspot;
  prompt: string | null;
  areaName: string;
  /** 剩余步数/遇敌额度，画在右上角，快用完时变色。 */
  stepsLeft: number;
  encountersLeft: number;
  partyColor: string;
  partyAccent: string;
}

/** 每格一个稳定的伪随机数：同一张图每次画出来都一样。 */
function tileHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const uiFont = (size: number): string =>
  `${size}px "Press Start 2P", ui-monospace, SFMono-Regular, Menlo, monospace`;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const GROUND = "#5f8a4a";
const GROUND_DARK = "#557e42";

function paintGrassBase(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  ctx.fillStyle = r < 0.5 ? GROUND : GROUND_DARK;
  ctx.fillRect(sx, sy, tile, tile);
  // 红白机式点阵纹理
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  const px = sx + 4 + Math.floor(r * 7) * 3;
  const py = sy + 6 + Math.floor(((r * 13) % 1) * 6) * 3;
  ctx.fillRect(px, py, 2, 2);
  ctx.fillRect(px + 8, py + 6, 2, 2);
}

function paintTall(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
  time: number,
): void {
  paintGrassBase(ctx, sx, sy, tile, r);
  const sway = Math.sin(time * 1.6 + r * 6) * 1.2;
  ctx.strokeStyle = "#3f6b36";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const bx = sx + 4 + i * 7 + ((r * 31 + i * 17) % 5);
    const by = sy + tile - 5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + sway, by - 10, bx + sway * 2, by - 16 - (i % 2) * 3);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150,200,120,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + 3, sy + tile - 9);
  ctx.lineTo(sx + tile - 3, sy + tile - 9);
  ctx.stroke();
}

function paintFlower(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  paintGrassBase(ctx, sx, sy, tile, r);
  const petals = ["#f2d16b", "#ef9bb0", "#cbb4f0"];
  for (let i = 0; i < 3; i += 1) {
    const fx = sx + 6 + Math.floor(((r * 100 + i * 37) % 1) * (tile - 14));
    const fy = sy + 8 + Math.floor(((r * 61 + i * 23) % 1) * (tile - 16));
    ctx.fillStyle = "#3f6b36";
    ctx.fillRect(fx + 1, fy + 2, 1, 5);
    ctx.fillStyle = petals[(i + Math.floor(r * 3)) % 3];
    ctx.fillRect(fx, fy, 4, 4);
  }
}

function paintPath(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  ctx.fillStyle = "#b6a079";
  ctx.fillRect(sx, sy, tile, tile);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(sx, sy, tile, 2);
  ctx.fillStyle = "rgba(90,72,48,0.28)";
  ctx.fillRect(sx + 3 + Math.floor(r * 9), sy + 6 + Math.floor(((r * 7) % 1) * 12), 4, 3);
  ctx.fillRect(sx + 14 + Math.floor(((r * 11) % 1) * 8), sy + 18, 3, 3);
}

function paintWater(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
  time: number,
): void {
  ctx.fillStyle = "#3f74a8";
  ctx.fillRect(sx, sy, tile, tile);
  ctx.fillStyle = "#2f5f8d";
  ctx.fillRect(sx, sy, tile, 4);
  ctx.strokeStyle = "rgba(190,226,255,0.45)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i += 1) {
    const wy = sy + 11 + i * 9 + Math.sin(time * 1.4 + r * 5 + i * 2) * 1.6;
    ctx.beginPath();
    ctx.moveTo(sx + 4, wy);
    ctx.quadraticCurveTo(sx + tile / 2, wy - 3, sx + tile - 4, wy);
    ctx.stroke();
  }
}

function paintRock(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
): void {
  paintGrassBase(ctx, sx, sy, tile, r);
  const w = tile - 8 - Math.floor(r * 5);
  ctx.fillStyle = "#7c7f86";
  roundRect(ctx, sx + 4, sy + tile - 12, w, 10, 3);
  ctx.fill();
  ctx.fillStyle = "#9aa0a8";
  roundRect(ctx, sx + 6, sy + tile - 14, w - 6, 8, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(40,44,50,0.5)";
  ctx.fillRect(sx + 8, sy + tile - 8, 3, 2);
}

function paintTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  r: number,
  time: number,
): void {
  paintGrassBase(ctx, sx, sy, tile, r);
  const sway = Math.sin(time * 1.1 + r * 7) * 0.8;
  ctx.fillStyle = "#6b4a2c";
  ctx.fillRect(sx + tile / 2 - 2, sy + tile - 12, 4, 10);
  ctx.fillStyle = "#2f5c2c";
  roundRect(ctx, sx + 4 + sway, sy + 3, tile - 8, tile - 12, 6);
  ctx.fill();
  ctx.fillStyle = "#3d7238";
  roundRect(ctx, sx + 7 + sway, sy + 5, tile - 14, tile - 20, 5);
  ctx.fill();
}

/** 营地：一顶帐篷 + 一堆火，回这张图的落脚点。 */
function paintCamp(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  time: number,
): void {
  ctx.fillStyle = "#b6a079";
  ctx.fillRect(sx, sy, tile, tile);
  ctx.fillStyle = "#e6d9bd";
  ctx.beginPath();
  ctx.moveTo(sx + 3, sy + tile - 7);
  ctx.lineTo(sx + tile / 2, sy + 5);
  ctx.lineTo(sx + tile - 3, sy + tile - 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8c6f4a";
  ctx.beginPath();
  ctx.moveTo(sx + tile / 2 - 4, sy + tile - 7);
  ctx.lineTo(sx + tile / 2, sy + 13);
  ctx.lineTo(sx + tile / 2 + 4, sy + tile - 7);
  ctx.closePath();
  ctx.fill();
  const flicker = 1 + Math.sin(time * 7) * 0.18;
  ctx.fillStyle = "#ef8f4c";
  ctx.fillRect(sx + 2, sy + tile - 5, 5, Math.max(2, 4 * flicker));
}

/** 道馆：一栋小楼，门口挂着徽章数。 */
function paintGym(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tile: number,
  badges: number,
): void {
  ctx.fillStyle = "#b6a079";
  ctx.fillRect(sx, sy, tile, tile);
  ctx.fillStyle = "#c9564f";
  ctx.beginPath();
  ctx.moveTo(sx + 1, sy + 12);
  ctx.lineTo(sx + tile / 2, sy + 2);
  ctx.lineTo(sx + tile - 1, sy + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8e2d2";
  ctx.fillRect(sx + 4, sy + 12, tile - 8, tile - 17);
  ctx.fillStyle = "#6b5b45";
  ctx.fillRect(sx + tile / 2 - 3, sy + tile - 9, 6, 8);
  ctx.fillStyle = "#f0c27a";
  ctx.beginPath();
  ctx.arc(sx + tile / 2, sy + 17, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2f22";
  ctx.font = uiFont(6);
  ctx.textAlign = "center";
  ctx.fillText(String(badges), sx + tile / 2, sy + 19);
  ctx.textAlign = "left";
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  field: WorkshopField,
  tx: number,
  ty: number,
  camX: number,
  camY: number,
  time: number,
  badges: number,
): void {
  const tile = field.tile;
  const sx = tx * tile - camX;
  const sy = ty * tile - camY;
  const kind = fieldTileAt(field, tx, ty);
  const r = tileHash(tx, ty);
  if (kind === WORKSHOP_TILE_TALL) {
    paintTall(ctx, sx, sy, tile, r, time);
    return;
  }
  if (kind === WORKSHOP_TILE_PATH) {
    paintPath(ctx, sx, sy, tile, r);
    return;
  }
  if (kind === WORKSHOP_TILE_WATER) {
    paintWater(ctx, sx, sy, tile, r, time);
    return;
  }
  if (kind === WORKSHOP_TILE_ROCK) {
    paintRock(ctx, sx, sy, tile, r);
    return;
  }
  if (kind === WORKSHOP_TILE_TREE) {
    paintTree(ctx, sx, sy, tile, r, time);
    return;
  }
  if (kind === WORKSHOP_TILE_FLOWER) {
    paintFlower(ctx, sx, sy, tile, r);
    return;
  }
  if (kind === WORKSHOP_TILE_CAMP) {
    paintCamp(ctx, sx, sy, tile, time);
    return;
  }
  if (kind === WORKSHOP_TILE_GYM) {
    paintGym(ctx, sx, sy, tile, badges);
    return;
  }
  paintGrassBase(ctx, sx, sy, tile, r);
}

/** 训练师：16px 小人，走路时两脚交替、身体上下轻浮。 */
function paintHero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: WorkshopFacing,
  moving: boolean,
  time: number,
  color: string,
  accent: string,
): void {
  const step = moving ? Math.floor(time * 8) % 2 : 0;
  const bob = moving ? Math.sin(time * 16) * 0.8 : 0;
  ctx.save();
  ctx.translate(x, y + bob);

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 1, 9, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 腿
  ctx.fillStyle = "#3a3f4b";
  ctx.fillRect(-5, -8 + (step ? -1 : 0), 4, 8);
  ctx.fillRect(1, -8 + (step ? 0 : -1), 4, 8);
  // 身体
  ctx.fillStyle = color;
  ctx.fillRect(-7, -20, 14, 13);
  ctx.fillStyle = accent;
  ctx.fillRect(-7, -14, 14, 2);
  // 头与帽子
  ctx.fillStyle = "#f0d0a8";
  ctx.fillRect(-5, -28, 10, 9);
  ctx.fillStyle = accent;
  ctx.fillRect(-6, -30, 12, 4);
  if (facing === "down") {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-3, -24, 2, 2);
    ctx.fillRect(1, -24, 2, 2);
  } else if (facing === "left") {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-4, -24, 2, 2);
  } else if (facing === "right") {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(2, -24, 2, 2);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(-5, -28, 10, 5);
  }
  ctx.restore();
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  field: WorkshopField,
  view: WorkshopView,
  x: number,
  y: number,
): void {
  const w = 112;
  const h = Math.round((w * field.rows) / field.cols);
  const mx = view.w - w - 12;
  const my = view.h - h - 12;
  ctx.fillStyle = "rgba(12,16,12,0.72)";
  roundRect(ctx, mx - 3, my - 3, w + 6, h + 6, 4);
  ctx.fill();
  ctx.fillStyle = "#476b3c";
  ctx.fillRect(mx, my, w, h);
  const cell = w / field.cols;
  for (let ty = 0; ty < field.rows; ty += 1) {
    for (let tx = 0; tx < field.cols; tx += 1) {
      const kind = fieldTileAt(field, tx, ty);
      if (kind !== WORKSHOP_TILE_WATER && kind !== WORKSHOP_TILE_TREE && kind !== WORKSHOP_TILE_ROCK) {
        continue;
      }
      ctx.fillStyle = kind === WORKSHOP_TILE_WATER ? "#3f74a8" : "#6d7076";
      ctx.fillRect(mx + tx * cell, my + ty * (h / field.rows), Math.ceil(cell), Math.ceil(h / field.rows));
    }
  }
  ctx.fillStyle = "#d9c39b";
  ctx.fillRect(mx + field.camp.tx * cell - 1, my + field.camp.ty * (h / field.rows) - 1, 4, 4);
  ctx.fillStyle = "#e0574d";
  ctx.fillRect(mx + field.gym.tx * cell - 1, my + field.gym.ty * (h / field.rows) - 1, 4, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(mx + (x / field.tile) * cell - 1.5, my + (y / field.tile) * (h / field.rows) - 1.5, 4, 4);
}

export function paintWorkshopField(
  ctx: CanvasRenderingContext2D,
  options: WorkshopFieldPaintOptions & { badges: number },
): void {
  const { field, time, x, y } = options;
  const view = options.view ?? DEFAULT_WORKSHOP_VIEW;
  const tile = field.tile;

  const camX = Math.max(0, Math.min(field.worldW - view.w, x - view.w / 2));
  const camY = Math.max(0, Math.min(field.worldH - view.h, y - view.h / 2));

  ctx.fillStyle = GROUND_DARK;
  ctx.fillRect(0, 0, view.w, view.h);

  const fromTx = Math.floor(camX / tile);
  const toTx = Math.min(field.cols - 1, Math.ceil((camX + view.w) / tile));
  const fromTy = Math.floor(camY / tile);
  const toTy = Math.min(field.rows - 1, Math.ceil((camY + view.h) / tile));

  // 地形：先铺不含树的层，树与小人在第二轮按 y 排序，走到树后能被挡住一点
  const above: { y: number; draw: () => void }[] = [];
  for (let ty = fromTy; ty <= toTy; ty += 1) {
    for (let tx = fromTx; tx <= toTx; tx += 1) {
      paintTile(ctx, field, tx, ty, camX, camY, time, options.badges);
      const kind = fieldTileAt(field, tx, ty);
      if (kind !== WORKSHOP_TILE_TREE) continue;
      const sx = tx * tile - camX;
      const sy = ty * tile - camY;
      above.push({
        y: sy + tile,
        draw: () => paintTree(ctx, sx, sy, tile, tileHash(tx, ty), time),
      });
    }
  }

  // 营地/道馆的可交互提示圈
  const hotspot = options.hotspot;
  if (hotspot) {
    const point = hotspot.kind === "camp" ? field.camp : field.gym;
    const sx = (point.tx + 0.5) * tile - camX;
    const sy = (point.ty + 0.5) * tile - camY;
    ctx.strokeStyle = `rgba(240,194,122,${0.45 + Math.sin(time * 5) * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 6, 16, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  above.push({ y, draw: () => paintHero(ctx, x - camX, y - camY, options.facing, options.moving, time, options.partyColor, options.partyAccent) });
  above.sort((a, b) => a.y - b.y);
  for (const item of above) item.draw();

  // 顶部信息条
  ctx.fillStyle = "rgba(12,16,12,0.72)";
  ctx.fillRect(0, 0, view.w, 30);
  ctx.font = uiFont(12);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f2e8cf";
  ctx.fillText(options.areaName, 12, 20);
  ctx.textAlign = "right";
  const thin = options.stepsLeft <= 60 || options.encountersLeft <= 1;
  ctx.fillStyle = thin ? "#f0a35a" : "#cfe6b0";
  ctx.fillText(`余 ${options.stepsLeft} 步 · ${options.encountersLeft} 次遇敌`, view.w - 12, 20);
  ctx.textAlign = "left";

  if (options.prompt) {
    const width = ctx.measureText(options.prompt).width + 24;
    ctx.font = uiFont(11);
    ctx.fillStyle = "rgba(12,16,12,0.82)";
    roundRect(ctx, view.w / 2 - width / 2, view.h - 62, width, 26, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(240,194,122,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#f2e8cf";
    ctx.textAlign = "center";
    ctx.fillText(options.prompt, view.w / 2, view.h - 45);
    ctx.textAlign = "left";
  }

  drawMinimap(ctx, field, view, x, y);
}
