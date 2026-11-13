import { snapCostToUnit } from "@/lib/activity/ticket-math";
import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·灵宠工坊的纯配置与规则。
 *
 * 红白机式养成：三选一初始灵宠，花活动券在区域里探索并捕捉野生灵宠，
 * 打怪升级、到等级自动进化；集齐徽章解锁更深的地图，三个道馆按顺序挑战。
 * 两只同阶灵宠仍可合成一只高一阶（不花券，作为加速路径）。
 * 任意一条线首次达到 3/5/7/9 阶各领一次 tcr。
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
  /** 每日最多进图次数（按北京时间自然日）；一次进图能在地图里走到上限为止。 */
  dailyExplores: number;
  /** 单次进图票价（cr），必须是券单价的整数倍。 */
  exploreCostCredits: number;
  /** 一趟探险最多走多少步：走位刷遇敌的总闸，到数即收兵。 */
  runMaxSteps: number;
  /** 一趟探险最多摇出多少只野生灵宠，到数即收兵。 */
  runMaxEncounters: number;
  /** 每日最多挑战道馆次数（按北京时间自然日）。 */
  dailyGyms: number;
  /** 单次道馆挑战票价（cr），必须是券单价的整数倍。 */
  gymCostCredits: number;
  /** 免费休息用完后，再休息一次要付的券价（cr），必须是券单价的整数倍。 */
  restCostCredits: number;
  /** 1 张活动券兑换所需的 cr（券面单价）。 */
  couponUnitCredits: number;
  /** 奖励 tcr 的有效天数。 */
  rewardValidDays: number;
  /** 达到某阶的一次性 tcr。 */
  milestones: WorkshopMilestone[];
}

export const DEFAULT_WORKSHOP_CONFIG: WorkshopConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  dailyExplores: 5,
  exploreCostCredits: 2,
  runMaxSteps: 600,
  runMaxEncounters: 4,
  dailyGyms: 3,
  gymCostCredits: 5,
  restCostCredits: 2,
  couponUnitCredits: 2,
  rewardValidDays: 30,
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

/** 旧版配置用的字段名，读回时兜底，避免升级后把管理员调过的次数/票价重置。 */
interface LegacyWorkshopConfig {
  dailyGathers?: unknown;
  gatherCostCredits?: unknown;
}

function firstNumber(primary: unknown, legacy: unknown, fallback: number): number {
  if (primary !== undefined && primary !== null) return Number(primary);
  if (legacy !== undefined && legacy !== null) return Number(legacy);
  return fallback;
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
  const it = raw as Partial<WorkshopConfig> & LegacyWorkshopConfig;
  const unit = Math.min(
    1_000_000,
    round2(positiveNumber(it.couponUnitCredits, d.couponUnitCredits)),
  );
  const milestones = sanitizeWorkshopMilestones(it.milestones);
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    dailyExplores: boundedInteger(
      firstNumber(it.dailyExplores, it.dailyGathers, d.dailyExplores),
      d.dailyExplores,
      1,
      200,
    ),
    exploreCostCredits: snapCostToUnit(
      round2(
        positiveNumber(
          firstNumber(it.exploreCostCredits, it.gatherCostCredits, d.exploreCostCredits),
          d.exploreCostCredits,
        ),
      ),
      unit,
    ),
    dailyGyms: boundedInteger(it.dailyGyms, d.dailyGyms, 1, 50),
    runMaxSteps: boundedInteger(it.runMaxSteps, d.runMaxSteps, 20, 5_000),
    runMaxEncounters: boundedInteger(it.runMaxEncounters, d.runMaxEncounters, 1, 50),
    gymCostCredits: snapCostToUnit(
      round2(positiveNumber(it.gymCostCredits, d.gymCostCredits)),
      unit,
    ),
    restCostCredits: snapCostToUnit(
      round2(positiveNumber(it.restCostCredits, d.restCostCredits)),
      unit,
    ),
    couponUnitCredits: unit,
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
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

/** 第 tier 阶（1..9）的名字。 */
export function workshopTierName(lineKey: string, tier: number): string {
  const line = WORKSHOP_LINES.find((item) => item.key === lineKey) ?? WORKSHOP_LINES[0];
  const index = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(tier))) - 1;
  return line.tiers[index];
}
