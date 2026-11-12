import { snapCostToUnit } from "@/lib/activity/ticket-math";
import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·星图共鸣的纯配置与抽取规则。
 *
 * 三张星座各 9 个星位：观星得到「颜色 + 亮度」星石，嵌入同色星位点亮它，
 * 相邻星位都点亮时自动连线；一个星座 9 颗全亮即完成，发 tcr 并可按天共鸣。
 * 不想要的星石可熔成星辉，星辉能定向凝出指定颜色 / 亮度的星石。
 */

export const COLLECTION_CONFIG_KEY = "collection_config";

/** `topup.type`：19=星图共鸣完成 / 共鸣奖励（只发 tcr）。 */
export const TOPUP_TYPE_COLLECTION = 19;

export type StarColor = "blue" | "teal" | "gold";

export const STAR_COLORS: StarColor[] = ["blue", "teal", "gold"];

export function isStarColor(value: unknown): value is StarColor {
  return typeof value === "string" && (STAR_COLORS as string[]).includes(value);
}

export function isBrightness(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

export const STAR_COLOR_META: Record<StarColor, { name: string; hex: string }> = {
  blue: { name: "星蓝", hex: "#7dd3fc" },
  teal: { name: "潮青", hex: "#5eead4" },
  gold: { name: "日金", hex: "#fbbf24" },
};

/** 1~3 亮度的名字，下标即亮度。 */
export const STAR_BRIGHTNESS_NAMES = ["", "微光", "辉光", "耀光"];

/** 熔炼一颗星石得到的星辉。 */
export const MELT_SHARDS: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 3 };

/** 定向凝出一颗星石需要的星辉。 */
export const CRAFT_SHARDS: Record<1 | 2 | 3, number> = { 1: 3, 2: 6, 3: 10 };

/** 点亮一整张星座额外返还的星辉，帮助补完下一张。 */
export const CONSTELLATION_SHARDS = 5;

export interface StarNode {
  /** `${constellationKey}-${序号}`。 */
  id: string;
  /** 0~100 的 SVG 坐标。 */
  x: number;
  y: number;
  color: StarColor;
  brightness: 1 | 2 | 3;
}

export interface Constellation {
  key: string;
  name: string;
  subtitle: string;
  nodes: StarNode[];
  /** 连线两端都是星位 id；两点都点亮时画亮线。 */
  edges: [string, string][];
}

function buildConstellation(
  key: string,
  name: string,
  subtitle: string,
  rawNodes: Array<[number, number, StarColor, 1 | 2 | 3]>,
  rawEdges: Array<[number, number]>,
): Constellation {
  const nodes = rawNodes.map(([x, y, color, brightness], index) => ({
    id: `${key}-${index + 1}`,
    x,
    y,
    color,
    brightness,
  }));
  return {
    key,
    name,
    subtitle,
    nodes,
    edges: rawEdges.map(([a, b]) => [nodes[a - 1].id, nodes[b - 1].id] as [string, string]),
  };
}

export const CONSTELLATIONS: Constellation[] = [
  buildConstellation(
    "aurora",
    "极光座",
    "一条横过夜空的极光带，越靠近天顶越亮。",
    [
      [10, 80, "blue", 1],
      [20, 66, "blue", 1],
      [30, 52, "teal", 2],
      [40, 40, "blue", 2],
      [50, 32, "gold", 3],
      [60, 40, "teal", 2],
      [70, 54, "teal", 1],
      [80, 68, "gold", 3],
      [90, 82, "gold", 1],
    ],
    [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [3, 6],
    ],
  ),
  buildConstellation(
    "abyss",
    "深海座",
    "海底星图卷成的一枚螺壳，越往中心越暗。",
    [
      [50, 18, "teal", 1],
      [66, 24, "gold", 3],
      [78, 38, "blue", 2],
      [78, 56, "teal", 2],
      [64, 70, "gold", 3],
      [46, 72, "blue", 1],
      [30, 60, "teal", 1],
      [26, 42, "blue", 1],
      [38, 30, "gold", 1],
    ],
    [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 1],
    ],
  ),
  buildConstellation(
    "grove",
    "古树座",
    "年轮与枝桠拼成的树形，根须扎进星河。",
    [
      [50, 14, "gold", 3],
      [34, 26, "gold", 2],
      [66, 26, "gold", 2],
      [22, 42, "teal", 1],
      [78, 42, "teal", 1],
      [38, 46, "blue", 2],
      [62, 46, "blue", 2],
      [42, 64, "teal", 1],
      [58, 64, "blue", 3],
    ],
    [
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 5],
      [2, 6],
      [3, 7],
      [4, 6],
      [5, 7],
      [6, 8],
      [7, 9],
      [8, 9],
    ],
  ),
];

export function allStarNodes(): StarNode[] {
  return CONSTELLATIONS.flatMap((constellation) => constellation.nodes);
}

export function nodeById(nodeId: string): StarNode | null {
  return allStarNodes().find((node) => node.id === nodeId) ?? null;
}

export interface CollectionSetReward {
  /** 星座 key。 */
  set: string;
  reward: number;
}

export interface CollectionConfig {
  enabled: boolean;
  startAt: string;
  endAt: string;
  /** 每日最多观星次数（按北京时间自然日）。 */
  dailyObserves: number;
  /** 单次观星票价（cr），必须是券单价的整数倍。 */
  observeCostCredits: number;
  /** 1 张活动券兑换所需的 cr（券面单价）。 */
  couponUnitCredits: number;
  /** 奖励 tcr 的有效天数。 */
  rewardValidDays: number;
  /** 每日共鸣：每完成一张星座可领的 tcr。 */
  resonanceReward: number;
  /** 完成一张星座的一次性 tcr。 */
  setRewards: CollectionSetReward[];
}

export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  dailyObserves: 10,
  observeCostCredits: 2,
  couponUnitCredits: 2,
  rewardValidDays: 30,
  resonanceReward: 2,
  setRewards: [
    { set: "aurora", reward: 8 },
    { set: "abyss", reward: 15 },
    { set: "grove", reward: 30 },
  ],
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** 旧版配置字段，读回时兜底，避免升级后把管理员调过的次数 / 票价重置。 */
interface LegacyCollectionConfig {
  dailyBoxes?: unknown;
  openCostCredits?: unknown;
}

function firstNumber(primary: unknown, legacy: unknown, fallback: number): number {
  if (primary !== undefined && primary !== null) return Number(primary);
  if (legacy !== undefined && legacy !== null) return Number(legacy);
  return fallback;
}

export function sanitizeCollectionSetRewards(raw: unknown): CollectionSetReward[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const rows = arr
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<CollectionSetReward>;
      return {
        set: typeof row.set === "string" ? row.set.trim() : "",
        reward: round2(Math.max(0, Number(row.reward) || 0)),
      };
    })
    .filter((row) => {
      if (!CONSTELLATIONS.some((constellation) => constellation.key === row.set)) return false;
      if (seen.has(row.set)) return false;
      seen.add(row.set);
      return true;
    });
  // 缺哪张星座就补默认值，避免后台只改了一行导致其余星座完成后没有奖励。
  return CONSTELLATIONS.map((constellation) => {
    const row = rows.find((item) => item.set === constellation.key);
    const fallback = DEFAULT_COLLECTION_CONFIG.setRewards.find(
      (item) => item.set === constellation.key,
    );
    return { set: constellation.key, reward: row?.reward ?? fallback?.reward ?? 0 };
  });
}

export function sanitizeCollectionConfig(raw: unknown): CollectionConfig {
  const d = DEFAULT_COLLECTION_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<CollectionConfig> & LegacyCollectionConfig;
  const unit = Math.min(
    1_000_000,
    round2(positiveNumber(it.couponUnitCredits, d.couponUnitCredits)),
  );
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    dailyObserves: boundedInteger(
      firstNumber(it.dailyObserves, it.dailyBoxes, d.dailyObserves),
      d.dailyObserves,
      1,
      200,
    ),
    observeCostCredits: snapCostToUnit(
      round2(
        positiveNumber(
          firstNumber(it.observeCostCredits, it.openCostCredits, d.observeCostCredits),
          d.observeCostCredits,
        ),
      ),
      unit,
    ),
    couponUnitCredits: unit,
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    resonanceReward: round2(
      Math.min(1_000_000, Math.max(0, Number(it.resonanceReward ?? d.resonanceReward) || 0)),
    ),
    setRewards: sanitizeCollectionSetRewards(it.setRewards),
  };
}

export interface CollectionActivityWindow {
  status: "disabled" | "pending" | "active" | "ended";
  startMs: number | null;
  endMs: number | null;
}

export function collectionActivityWindow(
  config: CollectionConfig,
  now = Date.now(),
): CollectionActivityWindow {
  if (!config.enabled) return { status: "disabled", startMs: null, endMs: null };
  const startMs = parseCnWallClock(config.startAt);
  const endMs = parseCnWallClock(config.endAt);
  if (startMs === null || endMs === null || endMs <= startMs) {
    return { status: "pending", startMs, endMs };
  }
  if (now < startMs) return { status: "pending", startMs, endMs };
  if (now >= endMs) return { status: "ended", startMs, endMs };
  return { status: "active", startMs, endMs };
}

export function collectionActivityKey(config: CollectionConfig): string | null {
  if (!config.enabled || !config.startAt.trim()) return null;
  return config.startAt.trim();
}

/** 观星落点：颜色等概率，亮度 1/2/3 = 60% / 30% / 10%。 */
export function rollStarStone(random: () => number = Math.random): {
  color: StarColor;
  brightness: 1 | 2 | 3;
} {
  const colorRoll = Math.min(0.999999, Math.max(0, random()));
  const brightnessRoll = Math.min(0.999999, Math.max(0, random()));
  const color = STAR_COLORS[Math.floor(colorRoll * STAR_COLORS.length)] ?? STAR_COLORS[0];
  const brightness = brightnessRoll < 0.6 ? 1 : brightnessRoll < 0.9 ? 2 : 3;
  return { color, brightness };
}

/** 一张星座是否 9 个星位全部点亮。 */
export function constellationComplete(lit: Set<string>, constellationKey: string): boolean {
  const constellation = CONSTELLATIONS.find((item) => item.key === constellationKey);
  if (!constellation) return false;
  return constellation.nodes.every((node) => lit.has(node.id));
}

/** 已点亮的星座 key；顺序与配置一致。 */
export function completedConstellations(lit: Set<string>): string[] {
  return CONSTELLATIONS.filter((constellation) => constellationComplete(lit, constellation.key)).map(
    (constellation) => constellation.key,
  );
}

/** 一张星座里还没点亮的星位。 */
export function unlitNodes(lit: Set<string>, constellationKey: string): StarNode[] {
  const constellation = CONSTELLATIONS.find((item) => item.key === constellationKey);
  if (!constellation) return [];
  return constellation.nodes.filter((node) => !lit.has(node.id));
}
