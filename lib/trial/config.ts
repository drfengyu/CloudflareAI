import { snapCostToUnit } from "@/lib/activity/ticket-math";
import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·每日试炼的纯配置与判分规则。
 *
 * 题目由服务端在开局时生成并落库，客户端只拿到题干；交卷时按服务端保存的答案判分。
 * 这里不 import 任何读库代码，后台表单与页面都要在服务端/浏览器两侧复用。
 */

export const TRIAL_CONFIG_KEY = "trial_config";

/** `topup.type`：17=每日试炼奖励（只发 tcr，非负）。 */
export const TOPUP_TYPE_TRIAL = 17;

/** 每局最多几道题：再多一屏排不下，也拉不开难度档。 */
export const TRIAL_MAX_QUESTIONS = 10;
/** 单局最短时长下限（秒）：至少给每题 4 秒，防脚本瞬交。 */
export const TRIAL_MIN_SECONDS = 15;

export interface TrialTier {
  /** 答对多少题起；同分取最高档。 */
  correct: number;
  /** 该档 tcr。 */
  reward: number;
}

export interface TrialConfig {
  enabled: boolean;
  /** 北京墙钟 `YYYY-MM-DD HH:mm`。 */
  startAt: string;
  endAt: string;
  /** 每局题数。 */
  questionCount: number;
  /** 单局限时（秒），超时交卷按 0 分并标记 expired。 */
  timeLimitSeconds: number;
  /** 每日最多挑战次数（按北京时间自然日）。 */
  dailyRuns: number;
  /** 单局票价（cr），必须是券单价的整数倍。 */
  runPriceCredits: number;
  /** 1 张活动券兑换所需的 cr（券面单价）。 */
  couponUnitCredits: number;
  /** 奖励 tcr 的有效天数。 */
  rewardValidDays: number;
  /** 答对题数 → tcr 档位。 */
  tiers: TrialTier[];
}

export const DEFAULT_TRIAL_CONFIG: TrialConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  questionCount: 5,
  timeLimitSeconds: 120,
  dailyRuns: 3,
  runPriceCredits: 5,
  couponUnitCredits: 5,
  rewardValidDays: 30,
  tiers: [
    { correct: 2, reward: 1 },
    { correct: 3, reward: 2 },
    { correct: 4, reward: 4 },
    { correct: 5, reward: 8 },
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

/** 档位按答对数升序去重；0 分档不配也能跑（没命中就拿 0）。 */
export function sanitizeTrialTiers(raw: unknown, questionCount: number): TrialTier[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  return arr
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<TrialTier>;
      return {
        correct: Math.trunc(Number(row.correct)),
        reward: round2(Math.max(0, Number(row.reward) || 0)),
      };
    })
    .filter((row) => {
      if (!Number.isFinite(row.correct) || row.correct < 1 || row.correct > questionCount) return false;
      if (seen.has(row.correct)) return false;
      seen.add(row.correct);
      return true;
    })
    .sort((a, b) => a.correct - b.correct);
}

/** 脏配置（缺字段、负数、起止时间写错）一律退回可用默认值，不让试炼页 500。 */
export function sanitizeTrialConfig(raw: unknown): TrialConfig {
  const d = DEFAULT_TRIAL_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<TrialConfig>;
  const unit = Math.min(
    1_000_000,
    round2(positiveNumber(it.couponUnitCredits, d.couponUnitCredits)),
  );
  const questionCount = boundedInteger(it.questionCount, d.questionCount, 1, TRIAL_MAX_QUESTIONS);
  const tiers = sanitizeTrialTiers(it.tiers, questionCount);
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    questionCount,
    timeLimitSeconds: boundedInteger(it.timeLimitSeconds, d.timeLimitSeconds, TRIAL_MIN_SECONDS, 1800),
    dailyRuns: boundedInteger(it.dailyRuns, d.dailyRuns, 1, 100),
    runPriceCredits: snapCostToUnit(
      round2(positiveNumber(it.runPriceCredits, d.runPriceCredits)),
      unit,
    ),
    couponUnitCredits: unit,
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    tiers: tiers.length > 0 ? tiers : sanitizeTrialTiers(d.tiers, questionCount),
  };
}

export interface TrialActivityWindow {
  status: "disabled" | "pending" | "active" | "ended";
  startMs: number | null;
  endMs: number | null;
}

export function trialActivityWindow(config: TrialConfig, now = Date.now()): TrialActivityWindow {
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

/** 活动轮次标识（startAt 字符串）；未启用或未填开始时间返回 null。 */
export function trialActivityKey(config: TrialConfig): string | null {
  if (!config.enabled || !config.startAt.trim()) return null;
  return config.startAt.trim();
}

/** 命中档位：答对题数达到的最高一档；不够任何档位就是 0。 */
export function trialRewardFor(config: TrialConfig, correct: number): number {
  const safe = Math.max(0, Math.trunc(Number(correct) || 0));
  let reward = 0;
  for (const tier of config.tiers) {
    if (safe >= tier.correct) reward = tier.reward;
  }
  return round2(reward);
}

/** 服务端判分用的时间边界：最短 = 每题 4 秒（不超过限时），最长 = 限时 + 5 秒宽限。 */
export function trialTimeBounds(config: TrialConfig): { minMs: number; maxMs: number } {
  return {
    minMs: Math.min(config.timeLimitSeconds * 1000, config.questionCount * 4000),
    maxMs: config.timeLimitSeconds * 1000 + 5000,
  };
}
