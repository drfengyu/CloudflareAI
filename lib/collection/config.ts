import { snapCostToUnit } from "@/lib/activity/ticket-math";
import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·星匣图鉴的纯配置与抽取规则。
 *
 * 三个星匣各 6 件藏品：开匣先等概率选星匣，再按条目权重选藏品。
 * 抽到重复藏品折算星尘，星尘可以定向兑换任意未收集的藏品——保底不靠隐藏概率。
 */

export const COLLECTION_CONFIG_KEY = "collection_config";

/** `topup.type`：19=星匣图鉴集齐奖励（只发 tcr）。 */
export const TOPUP_TYPE_COLLECTION = 19;

/** 每个星匣的藏品数。 */
export const COLLECTION_SET_SIZE = 6;

export interface CollectionItemMeta {
  key: string;
  name: string;
  /** 相对权重；同匣内按权重抽。 */
  weight: number;
}

export interface CollectionSetMeta {
  key: string;
  name: string;
  subtitle: string;
  items: CollectionItemMeta[];
}

export const COLLECTION_SETS: CollectionSetMeta[] = [
  {
    key: "aurora",
    name: "极光星匣",
    subtitle: "被极光洗过的夜空碎片",
    items: [
      { key: "shard", name: "微光碎片", weight: 100 },
      { key: "dust", name: "星屑", weight: 100 },
      { key: "prism", name: "极光棱镜", weight: 80 },
      { key: "meteor", name: "流星核", weight: 60 },
      { key: "eye", name: "银河之眼", weight: 35 },
      { key: "crown", name: "极光王冠", weight: 15 },
    ],
  },
  {
    key: "abyss",
    name: "深海星匣",
    subtitle: "沉在海底的星图残页",
    items: [
      { key: "pearl", name: "泡沫珍珠", weight: 100 },
      { key: "conch", name: "潮声螺", weight: 100 },
      { key: "coral", name: "珊瑚灯", weight: 80 },
      { key: "scale", name: "深渊鳞", weight: 60 },
      { key: "moon", name: "海月镜", weight: 35 },
      { key: "crown", name: "潮汐之冠", weight: 15 },
    ],
  },
  {
    key: "grove",
    name: "古树星匣",
    subtitle: "年轮里藏着另一片星空",
    items: [
      { key: "seed", name: "苔藓种子", weight: 100 },
      { key: "vine", name: "萤火藤", weight: 100 },
      { key: "ring", name: "年轮石", weight: 80 },
      { key: "bell", name: "花语铃", weight: 60 },
      { key: "laurel", name: "月桂枝", weight: 35 },
      { key: "crown", name: "古树王冠", weight: 15 },
    ],
  },
];

export interface CollectionSetReward {
  /** 星匣 key。 */
  set: string;
  reward: number;
}

export interface CollectionConfig {
  enabled: boolean;
  startAt: string;
  endAt: string;
  /** 每日最多开匣次数（按北京时间自然日）。 */
  dailyBoxes: number;
  /** 单次开匣票价（cr），必须是券单价的整数倍。 */
  openCostCredits: number;
  /** 1 张活动券兑换所需的 cr（券面单价）。 */
  couponUnitCredits: number;
  /** 奖励 tcr 的有效天数。 */
  rewardValidDays: number;
  /** 重复藏品折算的星尘。 */
  duplicateDust: number;
  /** 定向兑换一件藏品需要的星尘。 */
  dustPerItem: number;
  /** 集齐一个星匣的一次性 tcr。 */
  setRewards: CollectionSetReward[];
}

export const DEFAULT_COLLECTION_CONFIG: CollectionConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  dailyBoxes: 10,
  openCostCredits: 2,
  couponUnitCredits: 2,
  rewardValidDays: 30,
  duplicateDust: 2,
  dustPerItem: 12,
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
      if (!COLLECTION_SETS.some((set) => set.key === row.set)) return false;
      if (seen.has(row.set)) return false;
      seen.add(row.set);
      return true;
    });
  // 缺哪个匣就补默认值，避免后台只改了一行导致其余匣集齐后没有奖励。
  return COLLECTION_SETS.map((set) => {
    const row = rows.find((item) => item.set === set.key);
    const fallback = DEFAULT_COLLECTION_CONFIG.setRewards.find((item) => item.set === set.key);
    return { set: set.key, reward: row?.reward ?? fallback?.reward ?? 0 };
  });
}

export function sanitizeCollectionConfig(raw: unknown): CollectionConfig {
  const d = DEFAULT_COLLECTION_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<CollectionConfig>;
  const unit = Math.min(
    1_000_000,
    round2(positiveNumber(it.couponUnitCredits, d.couponUnitCredits)),
  );
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    dailyBoxes: boundedInteger(it.dailyBoxes, d.dailyBoxes, 1, 200),
    openCostCredits: snapCostToUnit(
      round2(positiveNumber(it.openCostCredits, d.openCostCredits)),
      unit,
    ),
    couponUnitCredits: unit,
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    duplicateDust: boundedInteger(it.duplicateDust, d.duplicateDust, 0, 1_000),
    dustPerItem: boundedInteger(it.dustPerItem, d.dustPerItem, 1, 1_000_000),
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

/** 藏品唯一键：`setKey/itemKey`。 */
export function collectionItemKey(setKey: string, itemKey: string): string {
  return `${setKey}/${itemKey}`;
}

export function findCollectionItem(setKey: string, itemKey: string) {
  const set = COLLECTION_SETS.find((item) => item.key === setKey);
  const item = set?.items.find((entry) => entry.key === itemKey);
  return set && item ? { set, item } : null;
}

/** 开匣：先等概率选星匣，再按条目权重抽藏品。 */
export function rollCollectionItem(random: () => number = Math.random): {
  setKey: string;
  itemKey: string;
} {
  const set = COLLECTION_SETS[Math.min(COLLECTION_SETS.length - 1, Math.floor(random() * COLLECTION_SETS.length))];
  const total = set.items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let roll = random() * total;
  for (const item of set.items) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return { setKey: set.key, itemKey: item.key };
  }
  const last = set.items[set.items.length - 1];
  return { setKey: set.key, itemKey: last.key };
}

export function isSetComplete(owned: Set<string>, setKey: string): boolean {
  const set = COLLECTION_SETS.find((item) => item.key === setKey);
  if (!set) return false;
  return set.items.every((item) => owned.has(collectionItemKey(setKey, item.key)));
}

/** 已集齐的星匣 key；判定顺序与配置一致。 */
export function completedSets(owned: Set<string>): string[] {
  return COLLECTION_SETS.filter((set) => isSetComplete(owned, set.key)).map((set) => set.key);
}

/** 某个星匣里还没收集的藏品。 */
export function missingItems(owned: Set<string>, setKey: string): CollectionItemMeta[] {
  const set = COLLECTION_SETS.find((item) => item.key === setKey);
  if (!set) return [];
  return set.items.filter((item) => !owned.has(collectionItemKey(setKey, item.key)));
}
