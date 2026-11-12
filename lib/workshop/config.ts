import { snapCostToUnit } from "@/lib/activity/ticket-math";
import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·灵宠工坊的纯配置与合成规则。
 *
 * 玩法：花活动券采集随机阶级的灵宠，两只同阶合成一只高一阶；
 * 任意一条线首次达到 3/5/7/9 阶各领一次 tcr。合成是确定性的，没有随机掉率陷阱，
 * 随机只发生在采集这一层，权重直接写在页面上。
 */

export const WORKSHOP_CONFIG_KEY = "workshop_config";

/** `topup.type`：18=灵宠工坊里程碑奖励（只发 tcr）。 */
export const TOPUP_TYPE_WORKSHOP = 18;

/** 每条养成线的阶数；第 9 阶是该线的终点。 */
export const WORKSHOP_TIER_COUNT = 9;

export interface WorkshopLineMeta {
  key: string;
  name: string;
  /** 9 个阶位名，从低到高。 */
  tiers: string[];
}

export const WORKSHOP_LINES: WorkshopLineMeta[] = [
  {
    key: "ember",
    name: "焰尾狐",
    tiers: ["焰尾幼狐", "火绒狐", "赤焰狐", "熔岩狐", "烈焰狐", "炎心狐", "曜日狐", "天火狐", "九尾炎尊"],
  },
  {
    key: "tide",
    name: "潮汐鲸",
    tiers: ["浪花幼鲸", "涌潮鲸", "深海鲸", "漩涡鲸", "沧澜鲸", "潮心鲸", "月汐鲸", "海皇鲸", "九渊潮主"],
  },
  {
    key: "verdant",
    name: "森语鹿",
    tiers: ["苔角幼鹿", "林语鹿", "青藤鹿", "古木鹿", "花冠鹿", "森心鹿", "翠灵鹿", "星叶鹿", "九色森王"],
  },
];

export interface WorkshopMilestone {
  /** 任意一条线首次达到该阶。 */
  tier: number;
  reward: number;
}

export interface WorkshopConfig {
  enabled: boolean;
  startAt: string;
  endAt: string;
  /** 每日最多采集次数（按北京时间自然日）。 */
  dailyGathers: number;
  /** 单次采集票价（cr），必须是券单价的整数倍。 */
  gatherCostCredits: number;
  /** 1 张活动券兑换所需的 cr（券面单价）。 */
  couponUnitCredits: number;
  /** 奖励 tcr 的有效天数。 */
  rewardValidDays: number;
  /** 采集落入第 1/2/3 阶的权重，只允许采到前三阶。 */
  gatherWeights: number[];
  /** 达到某阶的一次性 tcr。 */
  milestones: WorkshopMilestone[];
}

export const DEFAULT_WORKSHOP_CONFIG: WorkshopConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  dailyGathers: 20,
  gatherCostCredits: 2,
  couponUnitCredits: 2,
  rewardValidDays: 30,
  gatherWeights: [60, 30, 10],
  milestones: [
    { tier: 3, reward: 6 },
    { tier: 5, reward: 15 },
    { tier: 7, reward: 30 },
    { tier: 9, reward: 80 },
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

function sanitizeWeights(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : [];
  const weights = [0, 1, 2].map((index) => {
    const n = Number(arr[index]);
    return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  });
  return weights.some((weight) => weight > 0)
    ? weights
    : [...DEFAULT_WORKSHOP_CONFIG.gatherWeights];
}

export function sanitizeWorkshopMilestones(raw: unknown): WorkshopMilestone[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  return arr
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<WorkshopMilestone>;
      return {
        tier: Math.trunc(Number(row.tier)),
        reward: round2(Math.max(0, Number(row.reward) || 0)),
      };
    })
    .filter((row) => {
      if (!Number.isInteger(row.tier) || row.tier < 1 || row.tier > WORKSHOP_TIER_COUNT) return false;
      if (seen.has(row.tier)) return false;
      seen.add(row.tier);
      return true;
    })
    .sort((a, b) => a.tier - b.tier);
}

/** 脏配置（缺字段、负价格、起止时间写错）一律退回可用默认值，不让工坊页 500。 */
export function sanitizeWorkshopConfig(raw: unknown): WorkshopConfig {
  const d = DEFAULT_WORKSHOP_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<WorkshopConfig>;
  const unit = Math.min(
    1_000_000,
    round2(positiveNumber(it.couponUnitCredits, d.couponUnitCredits)),
  );
  const milestones = sanitizeWorkshopMilestones(it.milestones);
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    dailyGathers: boundedInteger(it.dailyGathers, d.dailyGathers, 1, 200),
    gatherCostCredits: snapCostToUnit(
      round2(positiveNumber(it.gatherCostCredits, d.gatherCostCredits)),
      unit,
    ),
    couponUnitCredits: unit,
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    gatherWeights: sanitizeWeights(it.gatherWeights),
    milestones: milestones.length > 0 ? milestones : d.milestones,
  };
}

export interface WorkshopActivityWindow {
  status: "disabled" | "pending" | "active" | "ended";
  startMs: number | null;
  endMs: number | null;
}

export function workshopActivityWindow(
  config: WorkshopConfig,
  now = Date.now(),
): WorkshopActivityWindow {
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

export function workshopActivityKey(config: WorkshopConfig): string | null {
  if (!config.enabled || !config.startAt.trim()) return null;
  return config.startAt.trim();
}

/** 采集阶级：返回 1..3，权重为 0 的档直接跳过。 */
export function rollGatherTier(weights: number[], random: () => number = Math.random): number {
  const safe = weights.slice(0, 3).map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const total = safe.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 1;
  let roll = random() * total;
  for (let index = 0; index < safe.length; index += 1) {
    roll -= safe[index];
    if (roll < 0) return index + 1;
  }
  return safe.length;
}

/** 第 tier 阶（1..9）的名字。 */
export function workshopTierName(lineKey: string, tier: number): string {
  const line = WORKSHOP_LINES.find((item) => item.key === lineKey) ?? WORKSHOP_LINES[0];
  const index = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(tier))) - 1;
  return line.tiers[index];
}

/** 每条线的权重百分比文案，例如「60% / 30% / 10%」。 */
export function gatherWeightSummary(config: WorkshopConfig): string {
  const total = config.gatherWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  return config.gatherWeights
    .map((weight) => `${Math.round((weight / total) * 100)}%`)
    .join(" / ");
}
