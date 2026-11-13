import { areaByKey } from "./battle";

/**
 * 灵宠工坊的冒险地图：进图时的种子 + 区域就能完整复现一张俯视格网。
 *
 * 地图不入库也不采信客户端坐标：客户端只上传「往哪个方向走了几格」的走位路径，
 * 服务端用同一份纯函数逐格重放，遇到草丛就按 `fieldStepRandom(seed, 第几步)` 摇遇敌。
 * 所以「走了多少步、走过什么地貌」是可验证的事实，而随机数流只由种子决定。
 */

export const WORKSHOP_FIELD_COLS = 44;
export const WORKSHOP_FIELD_ROWS = 28;
export const WORKSHOP_FIELD_TILE = 32;

export const WORKSHOP_TILE_GRASS = 0;
export const WORKSHOP_TILE_TALL = 1;
export const WORKSHOP_TILE_PATH = 2;
export const WORKSHOP_TILE_WATER = 3;
export const WORKSHOP_TILE_ROCK = 4;
export const WORKSHOP_TILE_TREE = 5;
export const WORKSHOP_TILE_FLOWER = 6;
export const WORKSHOP_TILE_CAMP = 7;
export const WORKSHOP_TILE_GYM = 8;

/** 每个地貌的遇敌概率（按步算）。营地与道馆前不打扰。 */
const ENCOUNTER_RATE: number[] = [0.05, 0.16, 0.015, 0, 0, 0, 0.1, 0, 0];

/** 行走速度倍率：草丛慢、小径快。 */
const SPEED_RATE: number[] = [1, 0.78, 1.18, 1, 1, 1, 0.92, 1, 1];

const SOLID = new Set<number>([WORKSHOP_TILE_WATER, WORKSHOP_TILE_ROCK, WORKSHOP_TILE_TREE]);

interface AreaFlavor {
  tall: number;
  tree: number;
  rock: number;
  water: number;
  flower: number;
  /** 遇敌率倍率：越深的区域越不安生。 */
  rate: number;
}

const FLAVOR: Record<string, AreaFlavor> = {
  ash: { tall: 13, tree: 3, rock: 6, water: 2, flower: 3, rate: 1 },
  shore: { tall: 8, tree: 2, rock: 7, water: 9, flower: 2, rate: 1 },
  grove: { tall: 10, tree: 15, rock: 4, water: 4, flower: 6, rate: 1.1 },
  spire: { tall: 6, tree: 3, rock: 14, water: 2, flower: 2, rate: 1.25 },
};

const DEFAULT_FLAVOR: AreaFlavor = {
  tall: 10,
  tree: 5,
  rock: 6,
  water: 3,
  flower: 3,
  rate: 1,
};

/** 四向走位的方向下标：与客户端的路径编码一致。 */
export const WORKSHOP_DIR: { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

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

function hashText(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface WorkshopFieldPoint {
  tx: number;
  ty: number;
}

export interface WorkshopField {
  areaKey: string;
  seed: number;
  cols: number;
  rows: number;
  tile: number;
  /** `rows * cols` 的地貌下标，见上面的 WORKSHOP_TILE_*。 */
  terrain: number[];
  worldW: number;
  worldH: number;
  /** 出入口（营地）与道馆所在的格。 */
  camp: WorkshopFieldPoint;
  gym: WorkshopFieldPoint;
  /** 区域遇敌率倍率，客户端画 HUD 时也用得上。 */
  rate: number;
}

export function fieldTileAt(field: WorkshopField, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= field.cols || ty >= field.rows) return WORKSHOP_TILE_ROCK;
  return field.terrain[ty * field.cols + tx] ?? WORKSHOP_TILE_GRASS;
}

export function fieldTileSolid(field: WorkshopField, tx: number, ty: number): boolean {
  return SOLID.has(fieldTileAt(field, tx, ty));
}

/** 脚底碰撞盒：中心点上下左右各 10 px，四角都不撞墙才算走得过去。 */
export function fieldHitsSolid(field: WorkshopField, x: number, y: number): boolean {
  const half = 10;
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
  return corners.some(([cx, cy]) =>
    fieldTileSolid(field, Math.floor(cx / field.tile), Math.floor(cy / field.tile)),
  );
}

export function fieldSpeedAt(field: WorkshopField, x: number, y: number): number {
  const kind = fieldTileAt(field, Math.floor(x / field.tile), Math.floor(y / field.tile));
  return SPEED_RATE[kind] ?? 1;
}

/** 这一步会不会摇遇敌：按脚下地貌与区域倍率给概率，水面与障碍不摇。 */
export function fieldEncounterChanceAt(field: WorkshopField, tx: number, ty: number): number {
  const base = ENCOUNTER_RATE[fieldTileAt(field, tx, ty)] ?? 0;
  return base * field.rate;
}

/**
 * 第 `step` 步的随机数流：只由种子与步数决定，所以服务端可以从任意一步重放，
 * 不必持久化随机数状态。摇遇敌与摇野生灵宠共用这一条流。
 */
export function fieldStepRandom(seed: number, step: number): () => number {
  return mulberry32((seed ^ Math.imul(step + 1, 0x9e3779b1)) >>> 0);
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
  const fromX = Math.max(1, Math.floor(cx - rx));
  const toX = Math.min(cols - 2, Math.ceil(cx + rx));
  const fromY = Math.max(1, Math.floor(cy - ry));
  const toY = Math.min(rows - 2, Math.ceil(cy + ry));
  for (let ty = fromY; ty <= toY; ty += 1) {
    for (let tx = fromX; tx <= toX; tx += 1) {
      const dx = (tx - cx) / Math.max(0.6, rx);
      const dy = (ty - cy) / Math.max(0.6, ry);
      if (dx * dx + dy * dy > 1) continue;
      // 留出一点毛边，blob 之间不会拼成方方正正的一块
      if (dx * dx + dy * dy > 0.72 && (tx + ty) % 3 === 0) continue;
      terrain[ty * cols + tx] = kind;
    }
  }
}

/** 从 a 走到 b 的抖动折线，沿途刷成小径并清掉障碍，保证走得通。 */
function carveRoad(
  terrain: number[],
  cols: number,
  rows: number,
  a: WorkshopFieldPoint,
  b: WorkshopFieldPoint,
  random: () => number,
): void {
  let tx = a.tx;
  let ty = a.ty;
  for (let guard = 0; guard < cols * rows * 2; guard += 1) {
    terrain[ty * cols + tx] = WORKSHOP_TILE_PATH;
    if (tx === b.tx && ty === b.ty) return;
    const horizontal = tx !== b.tx;
    const vertical = ty !== b.ty;
    if (horizontal && vertical) {
      const takeHorizontal = random() < 0.55;
      tx += takeHorizontal ? Math.sign(b.tx - tx) : 0;
      ty += takeHorizontal ? 0 : Math.sign(b.ty - ty);
    } else if (horizontal) {
      tx += Math.sign(b.tx - tx);
    } else {
      ty += Math.sign(b.ty - ty);
    }
    // 岔出去一小截也让路走通，避免斜切到 blob 里留下走不过去的窄口
    if (random() < 0.25) {
      const side = random() < 0.5 ? 1 : -1;
      const sx = clamp(tx + side * (horizontal ? 0 : 1), 1, cols - 2);
      const sy = clamp(ty + side * (horizontal ? 1 : 0), 1, rows - 2);
      terrain[sy * cols + sx] = WORKSHOP_TILE_PATH;
    }
  }
}

export function fieldReachable(field: WorkshopField): boolean[] {
  const seen = new Array<boolean>(field.cols * field.rows).fill(false);
  const queue: number[] = [field.camp.ty * field.cols + field.camp.tx];
  seen[queue[0]] = true;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const tx = index % field.cols;
    const ty = Math.floor(index / field.cols);
    for (const dir of WORKSHOP_DIR) {
      const nx = tx + dir.dx;
      const ny = ty + dir.dy;
      if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) continue;
      const next = ny * field.cols + nx;
      if (seen[next] || fieldTileSolid(field, nx, ny)) continue;
      seen[next] = true;
      queue.push(next);
    }
  }
  return seen;
}

export function generateWorkshopField(input: { areaKey: string; seed: number }): WorkshopField {
  const cols = WORKSHOP_FIELD_COLS;
  const rows = WORKSHOP_FIELD_ROWS;
  const tile = WORKSHOP_FIELD_TILE;
  const area = areaByKey(input.areaKey);
  const areaKey = area?.key ?? "ash";
  const flavor = FLAVOR[areaKey] ?? DEFAULT_FLAVOR;
  const seed = (input.seed ^ 0x5f3759df) >>> 0;
  const rng = mulberry32((seed ^ hashText(areaKey)) >>> 0);
  const terrain = new Array<number>(cols * rows).fill(WORKSHOP_TILE_GRASS);

  // 外圈一圈岩石：走不出这张图
  for (let tx = 0; tx < cols; tx += 1) {
    terrain[tx] = WORKSHOP_TILE_ROCK;
    terrain[(rows - 1) * cols + tx] = WORKSHOP_TILE_ROCK;
  }
  for (let ty = 0; ty < rows; ty += 1) {
    terrain[ty * cols] = WORKSHOP_TILE_ROCK;
    terrain[ty * cols + cols - 1] = WORKSHOP_TILE_ROCK;
  }

  const scatter = (kind: number, blobs: number, minR: number, maxR: number): void => {
    for (let i = 0; i < blobs; i += 1) {
      const rx = minR + rng() * (maxR - minR);
      const ry = rx * (0.6 + rng() * 0.5);
      paintBlob(terrain, cols, rows, kind, 3 + rng() * (cols - 6), 3 + rng() * (rows - 6), rx, ry);
    }
  };
  scatter(WORKSHOP_TILE_TALL, flavor.tall, 2.2, 5.2);
  scatter(WORKSHOP_TILE_TREE, flavor.tree, 1.6, 3.6);
  scatter(WORKSHOP_TILE_ROCK, flavor.rock, 1.4, 3.2);
  scatter(WORKSHOP_TILE_WATER, flavor.water, 1.6, 3.4);
  scatter(WORKSHOP_TILE_FLOWER, flavor.flower, 1.4, 2.8);

  const camp: WorkshopFieldPoint = { tx: 3, ty: Math.floor(rows / 2) };
  const gym: WorkshopFieldPoint = {
    tx: cols - 4,
    ty: 4 + Math.floor(rng() * (rows - 8)),
  };

  // 主干道串起营地与道馆，再甩两条岔路把地图走活
  carveRoad(terrain, cols, rows, camp, gym, rng);
  const branchTargets: WorkshopFieldPoint[] = [
    { tx: 4 + Math.floor(rng() * (cols - 8)), ty: 3 },
    { tx: 4 + Math.floor(rng() * (cols - 8)), ty: rows - 4 },
    { tx: Math.floor(cols / 2), ty: 3 + Math.floor(rng() * (rows - 6)) },
  ];
  for (const target of branchTargets) {
    carveRoad(terrain, cols, rows, camp, target, rng);
  }

  // 营地与道馆各自清出一块空地，门口不能被树或水堵死
  const clearAround = (point: WorkshopFieldPoint, radius: number, kind: number): void => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tx = clamp(point.tx + dx, 1, cols - 2);
        const ty = clamp(point.ty + dy, 1, rows - 2);
        if (SOLID.has(terrain[ty * cols + tx])) {
          terrain[ty * cols + tx] = kind;
        }
      }
    }
    terrain[point.ty * cols + point.tx] = kind;
  };
  clearAround(camp, 2, WORKSHOP_TILE_PATH);
  clearAround(gym, 2, WORKSHOP_TILE_PATH);

  const field: WorkshopField = {
    areaKey,
    seed: input.seed >>> 0,
    cols,
    rows,
    tile,
    terrain,
    worldW: cols * tile,
    worldH: rows * tile,
    camp,
    gym,
    rate: flavor.rate,
  };

  // 兜底：万一 blob 把路切断了，直接沿直线再铺一条，保证营地到道馆走得通
  if (!fieldReachable(field)[gym.ty * cols + gym.tx]) {
    let tx = camp.tx;
    let ty = camp.ty;
    while (tx !== gym.tx || ty !== gym.ty) {
      terrain[ty * cols + tx] = WORKSHOP_TILE_PATH;
      if (tx !== gym.tx) tx += Math.sign(gym.tx - tx);
      else ty += Math.sign(gym.ty - ty);
    }
    terrain[gym.ty * cols + gym.tx] = WORKSHOP_TILE_GYM;
    return generateWorkshopFieldAgain(field);
  }
  terrain[gym.ty * cols + gym.tx] = WORKSHOP_TILE_GYM;
  terrain[camp.ty * cols + camp.tx] = WORKSHOP_TILE_CAMP;
  return field;
}

/**
 * 兜底重铺之后只清标记，不再重新生成：直接复用同一份 terrain，
 * 免得两次生成算出不同的图。
 */
function generateWorkshopFieldAgain(field: WorkshopField): WorkshopField {
  const terrain = field.terrain.slice();
  terrain[field.camp.ty * field.cols + field.camp.tx] = WORKSHOP_TILE_CAMP;
  terrain[field.gym.ty * field.cols + field.gym.tx] = WORKSHOP_TILE_GYM;
  return { ...field, terrain };
}

const cache = new Map<string, WorkshopField>();

/** 按「区域 + 种子」缓存：同一趟探险每帧取到的是同一个对象。 */
export function workshopFieldFor(areaKey: string, seed: number): WorkshopField {
  const key = `${areaKey}:${seed >>> 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const field = generateWorkshopField({ areaKey, seed });
  cache.set(key, field);
  if (cache.size > 64) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return field;
}

export type WorkshopFieldHotspot = { kind: "camp" } | { kind: "gym" } | null;

/** 走到营地或道馆跟前才有的交互点，像素坐标按格心判定。 */
export function fieldHotspotNear(field: WorkshopField, x: number, y: number): WorkshopFieldHotspot {
  const tx = Math.floor(x / field.tile);
  const ty = Math.floor(y / field.tile);
  if (Math.abs(tx - field.camp.tx) <= 1 && Math.abs(ty - field.camp.ty) <= 1) return { kind: "camp" };
  if (Math.abs(tx - field.gym.tx) <= 1 && Math.abs(ty - field.gym.ty) <= 1) return { kind: "gym" };
  return null;
}

/** 营地与道馆的像素中心，客户端点击走位与出生点都用它。 */
export function fieldPointPixel(field: WorkshopField, point: WorkshopFieldPoint): { x: number; y: number } {
  return { x: (point.tx + 0.5) * field.tile, y: (point.ty + 0.5) * field.tile };
}
