import { SAGA_CHAPTERS } from "./data";
import {
  SAGA_FIELD_COLS,
  SAGA_FIELD_ROWS,
  SAGA_FIELD_TILE,
  SAGA_FERRY_TICKETS,
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
  type SagaFieldCity,
  type SagaFieldFerry,
  type SagaFieldGate,
  type SagaFieldPoi,
  type SagaFieldPoiKind,
  type SagaFieldRegion,
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

/** 点击走位：落在实心格上就往四周挪到最近的一格空地，全被挡住时返回 null。 */
export function fieldWalkPoint(field: SagaField, x: number, y: number): { x: number; y: number } | null {
  const tile = field.tile;
  const cx = clamp(x, tile, field.worldW - tile);
  const cy = clamp(y, tile, field.worldH - tile);
  if (!fieldHitsSolid(field, cx, cy)) return { x: cx, y: cy };
  for (let ring = 1; ring <= 6; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const px = cx + dx * tile;
        const py = cy + dy * tile;
        if (px < tile || py < tile || px > field.worldW - tile || py > field.worldH - tile) continue;
        if (!fieldHitsSolid(field, px, py)) return { x: px, y: py };
      }
    }
  }
  return null;
}

/** 树林里行军放慢，其余地形全速。 */
export function fieldSpeedAt(field: SagaField, x: number, y: number): number {
  const tile = field.tile;
  const kind = fieldTileAt(field, Math.floor(x / tile), Math.floor(y / tile));
  return kind === SAGA_TILE_FOREST ? 0.72 : 1;
}

/** 挨着水面的草地算滩涂（海边）：沿岸能走，也一样可能撞见流寇。 */
export function fieldShoreAt(field: SagaField, tx: number, ty: number): boolean {
  if (fieldTileAt(field, tx, ty) !== SAGA_TILE_GRASS) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (fieldTileAt(field, tx + dx, ty + dy) === SAGA_TILE_WATER) return true;
    }
  }
  return false;
}

/**
 * 每走过一格野外路面的遇敌概率；官道、草地、海边滩涂与树林都会遇敌，
 * 只有城墙、城门洞与城内校场安全（`SAGA_TILE_YARD` / `SAGA_TILE_WALL`）。
 * 概率只决定「什么时候撞上」，编成由种子与第几场遭遇推出，重放不依赖走位。
 */
export function fieldEncounterChanceAt(field: SagaField, x: number, y: number): number {
  const tile = field.tile;
  const tx = Math.floor(x / tile);
  const ty = Math.floor(y / tile);
  // 城门洞归城内管，站在门洞里不算出城。
  if (tx === field.city.gateTx && (ty === field.city.gateTy || ty === field.city.gateTy + 1)) {
    return 0;
  }
  const kind = fieldTileAt(field, tx, ty);
  // v0.69.1 起整体为原来的 3 倍：树林、草地、滩涂与官道都可能遇敌。
  if (kind === SAGA_TILE_FOREST) return 0.3;
  if (kind === SAGA_TILE_GRASS) return fieldShoreAt(field, tx, ty) ? 0.135 : 0.165;
  if (kind === SAGA_TILE_ROAD) return 0.09;
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
  keep?: (current: number) => boolean,
): void {
  for (let ty = Math.floor(cy - ry); ty <= Math.ceil(cy + ry); ty++) {
    for (let tx = Math.floor(cx - rx); tx <= Math.ceil(cx + rx); tx++) {
      if (tx <= 0 || ty <= 0 || tx >= cols - 1 || ty >= rows - 1) continue;
      const dx = (tx - cx) / Math.max(0.6, rx);
      const dy = (ty - cy) / Math.max(0.6, ry);
      if (dx * dx + dy * dy > 1) continue;
      const at = ty * cols + tx;
      if (keep?.(terrain[at] ?? SAGA_TILE_GRASS)) continue;
      terrain[at] = kind;
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
  const count = clamp(Math.trunc(options.nodeCount), 1, 9);
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
  // 营前空地：营地周围扫出一片扎营地，已铺好的官道留着，免得走在路上被空地截断
  for (const camp of camps) {
    paintBlob(
      terrain,
      cols,
      rows,
      SAGA_TILE_GRASS,
      camp.tx,
      camp.ty,
      2.4,
      2.0,
      (current) => current === SAGA_TILE_ROAD,
    );
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
    paintBlob(
      terrain,
      cols,
      rows,
      SAGA_TILE_GRASS,
      best.tx,
      best.ty,
      1.8,
      1.5,
      (current) => current === SAGA_TILE_ROAD,
    );
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
    regions: [{ chapter: chapterIndex, name: chapter.name, tx: 0, ty: 0, w: cols, h: rows }],
    cities: [
      {
        chapter: chapterIndex,
        name: chapter.name,
        tx: cityTx,
        ty: cityTy,
        w: cityW,
        h: cityH,
        gateTx,
        gateTy,
        x: (gateTx + 2.5) * tile,
        y: (gateTy + 0.5) * tile,
      },
    ],
    gates: [],
    ferries: [],
    spawn,
    camps,
    pois,
  };
  return field;
}

const cache = new Map<string, SagaField>();

/** 有序去重后的章节号；空则退回起始区。 */
function chaptersOf(run: SagaRun): number[] {
  const seen: number[] = [];
  for (const node of run.nodes) {
    if (!seen.includes(node.chapter)) seen.push(node.chapter);
  }
  if (!seen.length) seen.push(run.startSave.chapter);
  return seen.sort((a, b) => a - b);
}

/** 每区节点在大图上的全局下标（与该区营寨顺序一一对应）。 */
function nodeIndexByChapter(run: SagaRun): Record<number, number[]> {
  const map: Record<number, number[]> = {};
  run.nodes.forEach((node, index) => {
    (map[node.chapter] ??= []).push(index);
  });
  return map;
}

/**
 * 八区拼成一张连续大地图：每章一块，横向排成一条讨逆路线，
 * 区界处各留一道关卡（前区本阵被破才开闸）和一处渡口（花船票直达隔壁）。
 */
export function generateSagaWorld(options: {
  chapters: number[];
  /** 每区营寨数（等于该区节点数）。 */
  nodeCounts: Record<number, number>;
  /** 每区节点在大图上的全局下标，按该区节点顺序。 */
  nodeIndexByChapter: Record<number, number[]>;
  seed: number;
  /** 已平定（本阵被破）的区，决定关卡是否开闸。 */
  openChapters: number[];
}): SagaField {
  const chapters = options.chapters.length ? options.chapters : [0];
  const regionCols = SAGA_FIELD_COLS;
  const rows = SAGA_FIELD_ROWS;
  const tile = SAGA_FIELD_TILE;
  const cols = regionCols * chapters.length;
  const terrain = new Array<number>(cols * rows).fill(SAGA_TILE_GRASS);

  const cities: SagaFieldCity[] = [];
  const regions: SagaFieldRegion[] = [];
  const camps: SagaFieldCamp[] = [];
  const pois: SagaFieldPoi[] = [];
  let spawn: { x: number; y: number } = { x: tile * 6, y: tile * 8 };

  const setTile = (tx: number, ty: number, kind: number): void => {
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return;
    terrain[ty * cols + tx] = kind;
  };
  /** 一格宽的直角通路：先横后竖，免得在地形上断掉。 */
  const carvePath = (x1: number, y1: number, x2: number, y2: number): void => {
    const xa = Math.min(x1, x2);
    const xb = Math.max(x1, x2);
    for (let x = xa; x <= xb; x++) {
      setTile(x, y1, SAGA_TILE_ROAD);
      setTile(x, y1 + 1, SAGA_TILE_ROAD);
    }
    const ya = Math.min(y1, y2);
    const yb = Math.max(y1, y2);
    for (let y = ya; y <= yb; y++) {
      setTile(x2, y, SAGA_TILE_ROAD);
    }
  };

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const offsetX = i * regionCols;
    const region = generateSagaField({
      chapter,
      nodeCount: options.nodeCounts[chapter] ?? 5,
      seed: (options.seed ^ Math.imul(chapter + 1, 0x9e3779b1)) >>> 0,
    });
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < regionCols; tx++) {
        terrain[ty * cols + offsetX + tx] = region.terrain[ty * regionCols + tx];
      }
    }
    if (i === 0) spawn = { x: region.spawn.x + offsetX * tile, y: region.spawn.y };
    const city: SagaFieldCity = {
      chapter,
      name: region.regions?.[0]?.name ?? "",
      tx: region.city.tx + offsetX,
      ty: region.city.ty,
      w: region.city.w,
      h: region.city.h,
      gateTx: region.city.gateTx + offsetX,
      gateTy: region.city.gateTy,
      x: region.city.x + offsetX * tile,
      y: region.city.y,
    };
    cities.push(city);
    regions.push({ chapter, name: city.name, tx: offsetX, ty: 0, w: regionCols, h: rows });
    const base = options.nodeIndexByChapter[chapter] ?? [];
    for (const camp of region.camps) {
      const globalNode = base[camp.node] ?? base[base.length - 1] ?? camp.node;
      camps.push({
        node: globalNode,
        tx: camp.tx + offsetX,
        ty: camp.ty,
        x: camp.x + offsetX * tile,
        y: camp.y,
      });
    }
    for (const poi of region.pois) {
      pois.push({
        kind: poi.kind,
        name: poi.name,
        tx: poi.tx + offsetX,
        ty: poi.ty,
        x: poi.x + offsetX * tile,
        y: poi.y,
      });
    }
  }

  // 区界：开一道关卡，再配一处渡口；关卡在前区本阵被破之前是墙。
  const gates: SagaFieldGate[] = [];
  const ferries: SagaFieldFerry[] = [];
  for (let i = 0; i < chapters.length - 1; i++) {
    const from = chapters[i];
    const to = chapters[i + 1];
    const boundaryX = (i + 1) * regionCols;
    const gy = clamp(
      Math.round((cities[i].gateTy + cities[i + 1].gateTy) / 2),
      6,
      rows - 12,
    );
    // 两侧城门口到关口的通路，保证城门、关卡、渡口连成一条线
    carvePath(cities[i].gateTx, cities[i].gateTy, boundaryX - 6, gy);
    carvePath(boundaryX + 6, gy, cities[i + 1].gateTx, cities[i + 1].gateTy);
    for (let x = boundaryX - 6; x <= boundaryX + 6; x++) {
      setTile(x, gy, SAGA_TILE_ROAD);
      setTile(x, gy + 1, SAGA_TILE_ROAD);
    }
    const open = options.openChapters.includes(from);
    if (!open) {
      for (let x = boundaryX - 1; x <= boundaryX + 1; x++) {
        for (let y = gy - 1; y <= gy + 2; y++) setTile(x, y, SAGA_TILE_WALL);
      }
    }
    gates.push({
      from,
      to,
      tx: boundaryX - 1,
      ty: gy - 1,
      w: 3,
      h: 4,
      x: (boundaryX + 0.5) * tile,
      y: (gy + 0.5) * tile,
      open,
    });

    // 渡口：区界两侧各一处码头，中间切成水面，走水路可直接摆到对岸
    const fy = clamp(gy + 10, 8, rows - 6);
    for (const dir of [-1, 1] as const) {
      const dockX = boundaryX + dir * 3;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) setTile(dockX + dx, fy + dy, SAGA_TILE_WATER);
      }
      for (let y = gy + 3; y <= fy + 3; y++) setTile(dockX, y, SAGA_TILE_ROAD);
    }
    // 两岸各一处码头：站在哪边都能上船，回来也坐得回去。
    const ferryName = `${SAGA_CHAPTERS[from]?.stages?.[4] ?? "界河"}渡口`;
    const leftX = (boundaryX - 3 + 0.5) * tile;
    const rightX = (boundaryX + 3 + 0.5) * tile;
    const dockY = (fy + 2 + 0.5) * tile;
    ferries.push(
      {
        from,
        to,
        name: ferryName,
        tickets: SAGA_FERRY_TICKETS,
        x: leftX,
        y: dockY,
        toX: rightX,
        toY: dockY,
      },
      {
        from: to,
        to: from,
        name: ferryName,
        tickets: SAGA_FERRY_TICKETS,
        x: rightX,
        y: dockY,
        toX: leftX,
        toY: dockY,
      },
    );
  }

  return {
    cols,
    rows,
    tile,
    worldW: cols * tile,
    worldH: rows * tile,
    terrain,
    flavor: SAGA_CHAPTERS[chapters[0]]?.terrain ?? "plain",
    city: {
      tx: cities[0].tx,
      ty: cities[0].ty,
      w: cities[0].w,
      h: cities[0].h,
      gateTx: cities[0].gateTx,
      gateTy: cities[0].gateTy,
      x: cities[0].x,
      y: cities[0].y,
    },
    regions,
    cities,
    gates,
    ferries,
    spawn,
    camps,
    pois,
  };
}

/**
 * 同一局行军的地图按种子复现；这里缓存一份，供每帧渲染与碰撞查询复用。
 * 跨区的世界图会随「哪些区已平定」换一次地形（关卡开闸），所以开闸状态要进缓存键。
 */
export function sagaFieldFor(run: SagaRun, openChapters: number[] = []): SagaField {
  const chapters = chaptersOf(run);
  const counts: Record<number, number> = {};
  for (const chapter of chapters) {
    counts[chapter] = run.nodes.filter((node) => node.chapter === chapter).length || 1;
  }
  const open = [...openChapters].sort((a, b) => a - b);
  const key = `${chapters.join(",")}:${chapters.map((c) => counts[c]).join(",")}:${run.seed}:${open.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const field =
    chapters.length <= 1
      ? generateSagaField({
          chapter: chapters[0],
          nodeCount: run.nodes.length,
          seed: run.seed,
        })
      : generateSagaWorld({
          chapters,
          nodeCounts: counts,
          nodeIndexByChapter: nodeIndexByChapter(run),
          seed: run.seed,
          openChapters: open,
        });
  cache.set(key, field);
  if (cache.size > 12) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return field;
}

export interface FieldHotspot {
  kind: "city" | "camp" | "poi" | "gate" | "ferry";
  camp?: SagaFieldCamp;
  poi?: SagaFieldPoi;
  city?: SagaFieldCity;
  gate?: SagaFieldGate;
  ferry?: SagaFieldFerry;
  x: number;
  y: number;
  /** 交互半径（世界像素）。 */
  radius: number;
}

/** 找出脚边可交互的营、渡口、点位、关卡或城门：营地优先，其次渡口，最后城门。 */
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
  for (const ferry of field.ferries ?? []) {
    const dist = Math.hypot(ferry.x - x, ferry.y - (y - 6));
    if (dist < 34 && dist < bestDist) {
      best = { kind: "ferry", ferry, x: ferry.x, y: ferry.y, radius: 34 };
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
  for (const gate of field.gates ?? []) {
    const dist = Math.hypot(gate.x - x, gate.y - (y - 6));
    if (dist < 38 && dist < bestDist) {
      best = { kind: "gate", gate, x: gate.x, y: gate.y, radius: 38 };
      bestDist = dist;
    }
  }
  if (best) return best;
  for (const city of field.cities ?? []) {
    const dist = Math.hypot(city.x - x, city.y - (y - 6));
    if (dist < 44 && dist < bestDist) {
      best = { kind: "city", city, x: city.x, y: city.y, radius: 44 };
      bestDist = dist;
    }
  }
  if (best) return best;
  const cityDist = Math.hypot(field.city.x - x, field.city.y - (y - 6));
  if (cityDist < 44) return { kind: "city", x: field.city.x, y: field.city.y, radius: 44 };
  return null;
}
