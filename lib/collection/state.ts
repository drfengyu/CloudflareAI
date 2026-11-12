import { cnDateString } from "@/lib/date";
import {
  CONSTELLATIONS,
  STAR_BRIGHTNESS_NAMES,
  STAR_COLORS,
  STAR_COLOR_META,
  allStarNodes,
  completedConstellations,
  nodeById,
  type StarColor,
} from "./config";

/**
 * 星图存档：星石库存（颜色 × 亮度）、已点亮星位、星辉与每日计数。
 *
 * 这里只有纯数据与纯函数，不碰数据库：页面、服务端动作、单测共用同一套口径。
 * 旧版「星匣图鉴」的已收集藏品会在 normalize 时换算成星石，集齐的星匣直接点亮整张星座。
 */

export type StarStones = Record<StarColor, number[]>;

export interface CollectionState {
  /** 北京日期；换天后观星次数重置。 */
  day: string;
  observesToday: number;
  /** 星辉。 */
  shards: number;
  /** 星石库存：每种颜色三个格子，下标 = 亮度 - 1。 */
  stones: StarStones;
  /** 已点亮的星位 id。 */
  nodes: string[];
  /** 最近一次共鸣的北京日期，每天一次。 */
  resonanceDay: string;
}

export function emptyStones(): StarStones {
  return {
    blue: [0, 0, 0],
    teal: [0, 0, 0],
    gold: [0, 0, 0],
  };
}

export function emptyCollectionState(day = cnDateString()): CollectionState {
  return {
    day,
    observesToday: 0,
    shards: 0,
    stones: emptyStones(),
    nodes: [],
    resonanceDay: "",
  };
}

function clampCount(value: unknown, max = 9_999): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
}

function normalizeStones(raw: unknown): StarStones {
  const bag = emptyStones();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bag;
  const row = raw as Record<string, unknown>;
  for (const color of STAR_COLORS) {
    const arr = row[color];
    if (!Array.isArray(arr)) continue;
    bag[color] = [0, 1, 2].map((index) => clampCount(arr[index]));
  }
  return bag;
}

function normalizeNodes(raw: unknown): string[] {
  const valid = new Set(allStarNodes().map((node) => node.id));
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from(
    new Set(arr.filter((id): id is string => typeof id === "string" && valid.has(id))),
  );
}

/** 旧图鉴的藏品顺序，用于把已收集藏品换算成星石。 */
const LEGACY_SET_ITEMS: Record<string, string[]> = {
  aurora: ["shard", "dust", "prism", "meteor", "eye", "crown"],
  abyss: ["pearl", "conch", "coral", "scale", "moon", "crown"],
  grove: ["seed", "vine", "ring", "bell", "laurel", "crown"],
};

const LEGACY_SET_COLOR: Record<string, StarColor> = {
  aurora: "blue",
  abyss: "teal",
  grove: "gold",
};

/** 旧藏品按稀有度折算亮度：前两件 1、中间两件 2、王冠 3。 */
const LEGACY_ITEM_BRIGHTNESS: Array<1 | 2 | 3> = [1, 1, 2, 2, 3, 3];

function migrateLegacy(
  owned: Set<string>,
  nodes: string[],
  stones: StarStones,
): void {
  for (const constellation of CONSTELLATIONS) {
    const itemKeys = LEGACY_SET_ITEMS[constellation.key] ?? [];
    if (itemKeys.length === 0) continue;
    const got = itemKeys.filter((key) => owned.has(`${constellation.key}/${key}`)).length;

    // 旧版已集齐的星匣直接折算成整张星座点亮，不让老玩家重做一遍。
    if (got >= itemKeys.length) {
      for (const node of constellation.nodes) {
        if (!nodes.includes(node.id)) nodes.push(node.id);
      }
      continue;
    }
    itemKeys.forEach((key, index) => {
      if (!owned.has(`${constellation.key}/${key}`)) return;
      const color = LEGACY_SET_COLOR[constellation.key] ?? "blue";
      const brightness = LEGACY_ITEM_BRIGHTNESS[index] ?? 1;
      stones[color][brightness - 1] += 1;
    });
  }
}

function isLegacyState(raw: Partial<CollectionState> & { owned?: unknown; dust?: unknown }): boolean {
  return raw.stones === undefined && (Array.isArray(raw.owned) || raw.dust !== undefined);
}

export function normalizeCollectionState(
  raw: unknown,
  day = cnDateString(),
): CollectionState {
  const base = emptyCollectionState(day);
  if (!raw || typeof raw !== "object") return base;
  const it = raw as Partial<CollectionState> & {
    owned?: unknown;
    boxesToday?: unknown;
    dust?: unknown;
  };
  const sameDay = typeof it.day === "string" && it.day === day;

  base.observesToday = sameDay
    ? Math.min(1_000_000, clampCount(it.observesToday ?? it.boxesToday))
    : 0;
  base.shards = Math.min(1_000_000, clampCount(it.shards ?? it.dust));
  base.resonanceDay = typeof it.resonanceDay === "string" ? it.resonanceDay : "";
  base.nodes = normalizeNodes(it.nodes);
  base.stones = normalizeStones(it.stones);

  if (isLegacyState(it)) {
    const owned = new Set(
      (Array.isArray(it.owned) ? it.owned : []).filter(
        (key): key is string => typeof key === "string",
      ),
    );
    migrateLegacy(owned, base.nodes, base.stones);
  }
  return base;
}

export function starCount(state: CollectionState, color: StarColor, brightness: 1 | 2 | 3): number {
  return state.stones[color]?.[brightness - 1] ?? 0;
}

export function addStones(
  state: CollectionState,
  color: StarColor,
  brightness: 1 | 2 | 3,
  count = 1,
): void {
  const stock = state.stones[color] ?? (state.stones[color] = [0, 0, 0]);
  stock[brightness - 1] = Math.max(0, Math.min(9_999, (stock[brightness - 1] ?? 0) + count));
}

/**
 * 把一颗星石嵌进星位：同色、亮度 ≥ 星位要求，优先消耗刚好够的那一档。
 * 成功时直接修改 state（扣库存、点亮星位）。
 */
export function placeStarStone(
  state: CollectionState,
  nodeId: string,
): { ok: true; brightness: 1 | 2 | 3 } | { ok: false; reason: string } {
  const node = nodeById(nodeId);
  if (!node) return { ok: false, reason: "星位不存在" };
  if (state.nodes.includes(node.id)) return { ok: false, reason: "这颗星已经点亮" };

  const stock = state.stones[node.color] ?? [0, 0, 0];
  for (let brightness = node.brightness; brightness <= 3; brightness += 1) {
    if ((stock[brightness - 1] ?? 0) <= 0) continue;
    stock[brightness - 1] -= 1;
    state.nodes.push(node.id);
    return { ok: true, brightness: brightness as 1 | 2 | 3 };
  }
  const colorName = STAR_COLOR_META[node.color].name;
  return {
    ok: false,
    reason: `缺少${colorName}${STAR_BRIGHTNESS_NAMES[node.brightness]}以上的星石`,
  };
}

/** 已点亮的星座 key。 */
export function litConstellations(state: CollectionState): string[] {
  return completedConstellations(new Set(state.nodes));
}
