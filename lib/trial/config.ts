import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·每日试炼（三国讨逆传）的纯配置与判分规则。
 *
 * 玩法是连续剧情的回合 RPG：从当前城镇出发，依次攻克野外战斗、精英与首领节点；
 * 走完当前地方的全部剧情，主线才推进到下一处地方。存档（武将、金币、装备、
 * 图鉴）一直保留，不设次数与时间限制。节点在出城时落库，收兵只上传编制/
 * 购物/战斗指令，服务端用 `lib/trial/saga/` 按种子重放。
 * 这里不 import 任何读库代码，后台表单与页面都要在服务端/浏览器两侧复用。
 */

export const TRIAL_CONFIG_KEY = "trial_config";

/** `topup.type`：17=每日试炼奖励（只发 tcr，非负）。 */
export const TOPUP_TYPE_TRIAL = 17;

/** 每处地方最多几处节点：野外遭遇 + 精英 + 首领，足够撑起一段剧情。 */
export const TRIAL_MAX_FLOORS = 7;

export interface TrialTier {
  /** 攻克多少处节点起；同节点数取最高档。 */
  correct: number;
  /** 该档发放的游戏金币。 */
  reward: number;
}

export interface TrialConfig {
  enabled: boolean;
  /** 北京墙钟 `YYYY-MM-DD HH:mm`。 */
  startAt: string;
  endAt: string;
  /** 每处地方的节点数（沿用 `questionCount` 字段名，避免动表结构）。 */
  questionCount: number;
  /** 1 张活动券兑换所需的 cr（券面单价）。 */
  couponUnitCredits: number;
  /** 钱庄存金折成 tcr 的有效天数。 */
  rewardValidDays: number;
  /** 钱庄存金：多少行军金币折 1 tcr。 */
  bankGoldPerTcr: number;
  /** 每次行军最多存多少金币（按存金价向下取整）。 */
  bankMaxGoldPerRun: number;
  /** 攻克节点数 → 游戏金币档位（只有走完当前剧情才发）。 */
  tiers: TrialTier[];
}

export const DEFAULT_TRIAL_CONFIG: TrialConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  questionCount: 5,
  couponUnitCredits: 5,
  rewardValidDays: 30,
  bankGoldPerTcr: 100,
  bankMaxGoldPerRun: 600,
  tiers: [
    { correct: 2, reward: 100 },
    { correct: 3, reward: 200 },
    { correct: 4, reward: 400 },
    { correct: 5, reward: 800 },
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

/** 档位按节点数升序去重；0 档不配也能跑（没命中就拿 0）。 */
export function sanitizeTrialTiers(raw: unknown, questionCount: number): TrialTier[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  return arr
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<TrialTier>;
      return {
        correct: Math.trunc(Number(row.correct)),
        reward: Math.min(9_999_999, Math.trunc(Math.max(0, Number(row.reward) || 0))),
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
  const questionCount = boundedInteger(it.questionCount, d.questionCount, 2, TRIAL_MAX_FLOORS);
  const tiers = sanitizeTrialTiers(it.tiers, questionCount);
  const bankGoldPerTcr = boundedInteger(it.bankGoldPerTcr, d.bankGoldPerTcr, 2, 1_000_000);
  const bankMaxGoldPerRun = Math.max(
    bankGoldPerTcr,
    Math.floor(
      boundedInteger(it.bankMaxGoldPerRun, d.bankMaxGoldPerRun, 0, 100_000_000) / bankGoldPerTcr,
    ) * bankGoldPerTcr,
  );
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    questionCount,
    couponUnitCredits: unit,
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    bankGoldPerTcr,
    bankMaxGoldPerRun,
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

/** 命中档位：通关节点数达到的最高一档，返回应发放的游戏金币；调用方只在走完当前剧情时使用。 */
export function trialGoldFor(config: TrialConfig, correct: number): number {
  const safe = Math.max(0, Math.trunc(Number(correct) || 0));
  let gold = 0;
  for (const tier of config.tiers) {
    if (safe >= tier.correct) gold = tier.reward;
  }
  return gold;
}
