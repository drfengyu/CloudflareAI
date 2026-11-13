import { SAGA_CHAPTERS } from "./data";
import {
  SAGA_FIELD_COLS,
  SAGA_FIELD_ROWS,
  SAGA_FIELD_TILE,
  SAGA_HIT_HALF_H,
  SAGA_HIT_HALF_W,
  SAGA_TILE_FOREST,
  SAGA_TILE_GRASS,
  SAGA_TILE_MOUNTAIN,
  SAGA_TILE_ROAD,
  SAGA_TILE_WALL,
  SAGA_TILE_WATER,
  SAGA_TILE_YARD,
  type SagaField,
  type SagaFieldCamp,
  type SagaFieldPoi,
  type SagaFieldPoiKind,
  type SagaRun,
  type SagaTerrainFlavor,
} from "./types";

/**
 * 行军大地图：出城时的种子 + 当前地方 + 节点数就能完整复现一张俯视格网。
 *
 * 地图不入库（`trial_run` 只存节点与种子），客户端每帧按同一份纯函数取图，
 * 服务端重放时完全不需要它——走位本身不直接改数值，能作弊的只有「打哪座营」与
 * 「打不打这场野外遭遇」，两者都由 `replaySagaRun` 校验；遭遇编成来自种子与序号。
 */

const SOLID = new Set<number>([SAGA_TILE_MOUNTAIN, SAGA_TILE_WATER, SAGA_TILE_WALL]);

const FLAVOR: Record<
  SagaTerrainFlavor,
  { forest: number; mountain: number; water: number; rivers: number }
> = {
  plain: { forest: 8, mountain: 3, water: 2, rivers: 0 },
  mountain: { forest: 5, mountain: 13, water: 1, rivers: 0 },
  river: { forest: 5, mountain: 3, water: 4, rivers: 2 },
  forest: { forest: 15, mountain: 3, water: 2, rivers: 0 },
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function fieldTileAt(field: SagaField, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= field.cols || ty >= field.rows) return SAGA_TILE_MOUNTAIN;
  return field.terrain[ty * field.cols + tx] ?? SAGA_TILE_GRASS;
}

export function fieldTileSolid(field: SagaField, tx: number, ty: number): boolean {
  return SOLID.has(fieldTileAt(field, tx, ty));
}

/** 世界像素 → 该点是否站在障碍上（用脚底碰撞盒的四角判定）。 */
export function fieldHitsSolid(
  field: SagaField,
  x: number,
  y: number,
  halfW = SAGA_HIT_HALF_W,
  halfH = SAGA_HIT_HALF_H,
): boolean {
  const tile = field.tile;
  const corners: [number, number][] = [
    [x - halfW, y - halfH],
    [x + halfW, y - halfH],
    [x - halfW, y + halfH],
    [x + halfW, y + halfH],
  ];
  for (const [px, py] of corners) {
    if (fieldTileSolid(field, Math.floor(px / tile), Math.floor(py / tile))) return true;
  }
  return false;
}

/** 树林里行军放慢，其余地形全速。 */
export function fieldSpeedAt(field: SagaField, x: number, y: number): number {
  const tile = field.tile;
  const kind = fieldTileAt(field, Math.floor(x / tile), Math.floor(y / tile));
  return kind === SAGA_TILE_FOREST ? 0.72 : 1;
}

/**
 * 每走过一格草地 / 树林的遇敌概率；官道、城墙与城内外一律安全。
 * 概率只决定「什么时候撞上」，编成由种子与第几场遭遇推出，重放不依赖走位。
 */
export function fieldEncounterChanceAt(field: SagaField, x: number, y: number): number {
  const tile = field.tile;
  const kind = fieldTileAt(field, Math.floor(x / tile), Math.floor(y / tile));
  if (kind === SAGA_TILE_FOREST) return 0.024;
  if (kind === SAGA_TILE_GRASS) return 0.011;
  return 0;
}

function paintBlob(
  terrain: number[],
  cols: number,
  rows: number,
  kind: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  for (let ty = Math.floor(cy - ry); ty <= Math.ceil(cy + ry); ty++) {
    for (let tx = Math.floor(cx - rx); tx <= Math.ceil(cx + rx); tx++) {
      if (tx <= 0 || ty <= 0 || tx >= cols - 1 || ty >= rows - 1) continue;
      const dx = (tx - cx) / Math.max(0.6, rx);
      const dy = (ty - cy) / Math.max(0.6, ry);
      if (dx * dx + dy * dy > 1) continue;
      terrain[ty * cols + tx] = kind;
    }
  }
}

/** 官道：一条带拐点的折线，沿途刷出 3 格宽的路，任何障碍都被让开。 */
function carveRoad(
  terrain: number[],
  cols: number,
  rows: number,
  rng: () => number,
  from: { tx: number; ty: number },
  to: { tx: number; ty: number },
): void {
  const stamp = (tx: number, ty: number): void => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) continue;
        terrain[y * cols + x] = SAGA_TILE_ROAD;
      }
    }
  };
  const midX = Math.round(from.tx + (to.tx - from.tx) * (0.35 + rng() * 0.3));
  const waypoints = [
    from,
    { tx: clamp(midX, 1, cols - 2), ty: from.ty },
    { tx: clamp(midX, 1, cols - 2), ty: to.ty },
    to,
  ];
  for (let leg = 1; leg < waypoints.length; leg++) {
    const a = waypoints[leg - 1];
    const b = waypoints[leg];
    const steps = Math.max(Math.abs(b.tx - a.tx), Math.abs(b.ty - a.ty));
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 1 : s / steps;
      stamp(Math.round(a.tx + (b.tx - a.tx) * t), Math.round(a.ty + (b.ty - a.ty) * t));
    }
  }
}

/** 从出生点做一次四连通 BFS，用来验证每座营寨都走得过去。 */
export function fieldReachable(field: SagaField): boolean[] {
  const { cols, rows } = field;
  const seen = new Array<boolean>(cols * rows).fill(false);
  const queue: number[] = [
    Math.floor(field.spawn.y / field.tile) * cols + Math.floor(field.spawn.x / field.tile),
  ];
  seen[queue[0]] = true;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const tx = cell % cols;
    const ty = Math.floor(cell / cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as [number, number][]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const next = ny * cols + nx;
      if (seen[next] || SOLID.has(field.terrain[next] ?? SAGA_TILE_MOUNTAIN)) continue;
      seen[next] = true;
      queue.push(next);
    }
  }
  return seen;
}

export function generateSagaField(options: {
  chapter: number;
  nodeCount: number;
  seed: number;
}): SagaField {
  const cols = SAGA_FIELD_COLS;
  const rows = SAGA_FIELD_ROWS;
  const tile = SAGA_FIELD_TILE;
  const chapterIndex = clamp(Math.trunc(options.chapter), 0, SAGA_CHAPTERS.length - 1);
  const chapter = SAGA_CHAPTERS[chapterIndex];
  const count = clamp(Math.trunc(options.nodeCount), 1, 7);
  const rng = mulberry32((options.seed ^ 0x5f3759df) >>> 0);
  const terrain = new Array<number>(cols * rows).fill(SAGA_TILE_GRASS);

  // 外圈群山：走不出这张图
  for (let tx = 0; tx < cols; tx++) {
    terrain[tx] = SAGA_TILE_MOUNTAIN;
    terrain[(rows - 1) * cols + tx] = SAGA_TILE_MOUNTAIN;
  }
  for (let ty = 0; ty < rows; ty++) {
    terrain[ty * cols] = SAGA_TILE_MOUNTAIN;
    terrain[ty * cols + cols - 1] = SAGA_TILE_MOUNTAIN;
  }

  const flavor = FLAVOR[chapter.terrain];
  /** 地图从 52×34 扩到 76×48，地貌 blob 按面积同步加密，免得大图显得空。 */
  const density = Math.max(1, (cols * rows) / (52 * 34));
  const scatter = (kind: number, blobs: number, minR: number, maxR: number): void => {
    const total = Math.round(blobs * density);
    for (let i = 0; i < total; i++) {
      const rx = (minR + rng() * (maxR - minR)) * 1.12;
      const ry = rx * (0.6 + rng() * 0.5);
      paintBlob(
        terrain,
        cols,
        rows,
        kind,
        2 + rng() * (cols - 4),
        2 + rng() * (rows - 4),
        rx,
        ry,
      );
    }
  };
  scatter(SAGA_TILE_FOREST, flavor.forest, 1.6, 4.2);
  scatter(SAGA_TILE_MOUNTAIN, flavor.mountain, 2.2, 5.4);
  scatter(SAGA_TILE_WATER, flavor.water, 1.4, 3.2);
  const rivers = Math.round(flavor.rivers * 1.6);
  for (let i = 0; i < rivers; i++) {
    const bandY = 4 + Math.floor(rng() * (rows - 8));
    const amp = 2 + rng() * 3;
    const phase = rng() * Math.PI * 2;
    for (let tx = 1; tx < cols - 1; tx++) {
      const ty = Math.round(bandY + Math.sin(tx / 5 + phase) * amp);
      paintBlob(terrain, cols, rows, SAGA_TILE_WATER, tx, ty, 1.1, 1.4);
    }
  }

  // 城池：占一块矩形，右边开门
  const cityW = 9;
  const cityH = 7;
  const cityTx = 3;
  const cityTy = clamp(Math.round(rows / 2 - cityH / 2 + (rng() * 6 - 3)), 2, rows - cityH - 2);
  const gateTx = cityTx + cityW - 1;
  const gateTy = clamp(cityTy + Math.round(cityH / 2), 1, rows - 2);
  const spawnTx = clamp(gateTx + 2, 1, cols - 2);
  const spawn = { x: (spawnTx + 0.5) * tile, y: (gateTy + 0.5) * tile };

  // 营寨：沿东西向铺开，上下错落，首领扎在最远处
  const camps: SagaFieldCamp[] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const ratio = count === 1 ? 1 : (i + 0.6) / count;
    const tx = clamp(Math.round(spawnTx + 3 + ratio * (cols - spawnTx - 7)), 2, cols - 3);
    const swing = i === count - 1 ? 0 : Math.sin(i * 1.9 + phase) * (rows * 0.3);
    const ty = clamp(Math.round(rows / 2 + swing + (rng() * 4 - 2)), 3, rows - 4);
    camps.push({ node: i, tx, ty, x: (tx + 0.5) * tile, y: (ty + 0.5) * tile });
  }

  // 官道从城门外一路串起每座营，保证可达
  let cursor = { tx: spawnTx, ty: gateTy };
  for (const camp of camps) {
    carveRoad(terrain, cols, rows, rng, cursor, { tx: camp.tx, ty: camp.ty });
    cursor = { tx: camp.tx, ty: camp.ty };
  }

  // 城墙压在路上：城内是校场，只有城门能进出
  for (let tx = cityTx; tx < cityTx + cityW; tx++) {
    for (let ty = cityTy; ty < cityTy + cityH; ty++) {
      if (tx <= 0 || ty <= 0 || tx >= cols - 1 || ty >= rows - 1) continue;
      const edge = tx === cityTx || tx === cityTx + cityW - 1 || ty === cityTy || ty === cityTy + cityH - 1;
      const gate = tx === gateTx && (ty === gateTy || ty === gateTy + 1);
      terrain[ty * cols + tx] = edge ? (gate ? SAGA_TILE_ROAD : SAGA_TILE_WALL) : SAGA_TILE_YARD;
    }
  }
  // 营前空地：营地周围扫出一片扎营地
  for (const camp of camps) {
    paintBlob(terrain, cols, rows, SAGA_TILE_GRASS, camp.tx, camp.ty, 2.4, 2.0);
    terrain[camp.ty * cols + camp.tx] = SAGA_TILE_ROAD;
  }

  // 乡野点位：沿着官道挑三处落脚地，走过去能听一段本地故事。
  const poiKinds: SagaFieldPoiKind[] = ["village", "shrine", "ferry"];
  const pois: SagaFieldPoi[] = [];
  for (let i = 0; i < poiKinds.length; i++) {
    const kind = poiKinds[i];
    const targetTx = clamp(
      Math.round(cols * (0.32 + i * 0.23) + (rng() * 4 - 2)),
      4,
      cols - 5,
    );
    const targetTy = clamp(
      Math.round(cityTy + (i - 1) * rows * 0.24 + (rng() * 6 - 3)),
      4,
      rows - 5,
    );
    let best: { tx: number; ty: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let ty = 2; ty < rows - 2; ty++) {
      for (let tx = 2; tx < cols - 2; tx++) {
        if (terrain[ty * cols + tx] !== SAGA_TILE_ROAD) continue;
        if (tx >= cityTx - 2 && tx <= cityTx + cityW + 2 && ty >= cityTy - 2 && ty <= cityTy + cityH + 2) {
          continue;
        }
        if (camps.some((camp) => Math.hypot(camp.tx - tx, camp.ty - ty) < 5)) continue;
        if (pois.some((poi) => Math.hypot(poi.tx - tx, poi.ty - ty) < 9)) continue;
        const score = Math.hypot(tx - targetTx, ty - targetTy);
        if (score < bestScore) {
          bestScore = score;
          best = { tx, ty };
        }
      }
    }
    if (!best) continue;
    paintBlob(terrain, cols, rows, SAGA_TILE_GRASS, best.tx, best.ty, 1.8, 1.5);
    terrain[best.ty * cols + best.tx] = SAGA_TILE_ROAD;
    pois.push({
      kind,
      name: chapter.landmarks[i] ?? chapter.stages[i] ?? "乡野",
      tx: best.tx,
      ty: best.ty,
      x: (best.tx + 0.5) * tile,
      y: (best.ty + 0.5) * tile,
    });
  }

  const field: SagaField = {
    cols,
    rows,
    tile,
    worldW: cols * tile,
    worldH: rows * tile,
    terrain,
    flavor: chapter.terrain,
    city: {
      tx: cityTx,
      ty: cityTy,
      w: cityW,
      h: cityH,
      gateTx,
      gateTy,
      x: (gateTx + 2.5) * tile,
      y: (gateTy + 0.5) * tile,
    },
    spawn,
    camps,
    pois,
  };
  return field;
}

const cache = new Map<string, SagaField>();

/** 同一局行军的地图按种子复现；这里缓存一份，供每帧渲染与碰撞查询复用。 */
export function sagaFieldFor(run: SagaRun): SagaField {
  const key = `${run.startSave.chapter}:${run.nodes.length}:${run.seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const field = generateSagaField({
    chapter: run.startSave.chapter,
    nodeCount: run.nodes.length,
    seed: run.seed,
  });
  cache.set(key, field);
  if (cache.size > 12) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return field;
}

export interface FieldHotspot {
  kind: "city" | "camp" | "poi";
  camp?: SagaFieldCamp;
  poi?: SagaFieldPoi;
  x: number;
  y: number;
  /** 交互半径（世界像素）。 */
  radius: number;
}

/** 找出脚边可交互的城、营或乡野点位：营地优先，其次点位，最后城门。 */
export function fieldHotspotNear(field: SagaField, x: number, y: number): FieldHotspot | null {
  let best: FieldHotspot | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const camp of field.camps) {
    const dist = Math.hypot(camp.x - x, camp.y - (y - 6));
    if (dist < 30 && dist < bestDist) {
      best = { kind: "camp", camp, x: camp.x, y: camp.y, radius: 30 };
      bestDist = dist;
    }
  }
  if (best) return best;
  for (const poi of field.pois) {
    const dist = Math.hypot(poi.x - x, poi.y - (y - 6));
    if (dist < 28 && dist < bestDist) {
      best = { kind: "poi", poi, x: poi.x, y: poi.y, radius: 28 };
      bestDist = dist;
    }
  }
  if (best) return best;
  const cityDist = Math.hypot(field.city.x - x, field.city.y - (y - 6));
  if (cityDist < 44) return { kind: "city", x: field.city.x, y: field.city.y, radius: 44 };
  return null;
}
