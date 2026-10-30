import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·雷电行动（纵版射击）的纯配置与计算。
 *
 * 不 import 任何读库代码：后台表单与游戏页都要在浏览器里读它，
 * 读 `option.raiden_config` 在 `lib/raiden/settings.ts`。
 */

export const RAIDEN_CONFIG_KEY = "raiden_config";

/** `topup.type`：11=雷电行动（装备/复活为负、通关奖励为正）。 */
export const TOPUP_TYPE_RAIDEN = 11;

/** 固定三关；关卡编号从 1 开始，也写进数据库。 */
export interface RaidenStageMeta {
  no: number;
  code: string;
  name: string;
  subtitle: string;
  boss: string;
  brief: string;
}

export const RAIDEN_STAGES: RaidenStageMeta[] = [
  {
    no: 1,
    code: "STAGE 1",
    name: "滨海防线",
    subtitle: "COASTAL DEFENSE",
    boss: "苍鹭级空母",
    brief: "低空突入海岸线，摧毁正在集结的登陆舰队。",
  },
  {
    no: 2,
    code: "STAGE 2",
    name: "钢铁城区",
    subtitle: "STEEL DISTRICT",
    boss: "攻城要塞「铁蜈蚣」",
    brief: "沿高架桥穿越工业区，拔掉敌方防空节点。",
  },
  {
    no: 3,
    code: "STAGE 3",
    name: "轨道要塞",
    subtitle: "ORBITAL FORTRESS",
    boss: "雷神核心",
    brief: "冲入近地轨道，终结整场行动的指挥中枢。",
  },
];

export interface RaidenStageReward {
  stage: number;
  /** 本活动首次通关该关的 cr。 */
  firstClear: number;
  /** 重复通关该关的单次 cr（受每日重复奖励封顶限制）。 */
  repeat: number;
}

export interface RaidenItemConfig {
  /** 单份价格（cr）。 */
  price: number;
  /** 单局最多买几份。 */
  max: number;
}

export interface RaidenConfig {
  enabled: boolean;
  /** 北京墙钟 `YYYY-MM-DD HH:mm`。 */
  startAt: string;
  endAt: string;
  /** 每日最多出击次数（按北京时间自然日）。 */
  dailyRuns: number;
  /** 通关奖励作为临时余额的有效天数。 */
  rewardValidDays: number;
  /** 重复通关奖励每自然日封顶（cr）；首通不受此限。 */
  repeatDailyCap: number;
  /** 阵亡后原地复活的价格（cr）。 */
  revivePriceCredits: number;
  /** 单局最多付费复活次数。 */
  maxRevives: number;
  /** 服务端结算时，单关最短用时（秒）；防瞬通作弊，正常关卡约 70~90 秒。 */
  minStageSeconds: number;
  /** 单关最长用时（秒）；挂机超时后结算仍可，但避免异常数据。 */
  maxStageSeconds: number;
  items: {
    weapon: RaidenItemConfig;
    bomb: RaidenItemConfig;
    shield: RaidenItemConfig;
    life: RaidenItemConfig;
  };
  stages: RaidenStageReward[];
}

export const DEFAULT_RAIDEN_CONFIG: RaidenConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  dailyRuns: 10,
  rewardValidDays: 30,
  repeatDailyCap: 30,
  revivePriceCredits: 30,
  maxRevives: 3,
  minStageSeconds: 30,
  maxStageSeconds: 1800,
  items: {
    weapon: { price: 25, max: 2 },
    bomb: { price: 12, max: 2 },
    shield: { price: 20, max: 1 },
    life: { price: 45, max: 2 },
  },
  stages: [
    { stage: 1, firstClear: 60, repeat: 6 },
    { stage: 2, firstClear: 100, repeat: 8 },
    { stage: 3, firstClear: 240, repeat: 12 },
  ],
};

export interface RaidenLoadout {
  /** 火力强化份数（0..items.weapon.max），每份 +1 级。 */
  weapon: number;
  /** 额外炸弹数（0..items.bomb.max）。 */
  bomb: number;
  /** 出击护盾（0 或 1）。 */
  shield: boolean;
  /** 额外生命数（0..items.life.max）。 */
  life: number;
}

export const EMPTY_LOADOUT: RaidenLoadout = { weapon: 0, bomb: 0, shield: false, life: 0 };

export type RaidenItemKey = "weapon" | "bomb" | "shield" | "life";

export interface RaidenItemMeta {
  key: RaidenItemKey;
  title: string;
  hint: string;
  /** shield 是开关，其余是份数。 */
  kind: "count" | "toggle";
}

export const RAIDEN_ITEMS: RaidenItemMeta[] = [
  {
    key: "weapon",
    title: "火力强化",
    hint: "主炮火力 +1 级，最高 3 级；升级后弹幕更宽、射速更快。",
    kind: "count",
  },
  {
    key: "bomb",
    title: "炸弹补给",
    hint: "出击时携带的炸弹 +1，清屏并对全场敌人造成重创。",
    kind: "count",
  },
  {
    key: "shield",
    title: "能量护盾",
    hint: "出击后获得 8 秒无敌护盾，用来躲过开局的火力压制。",
    kind: "toggle",
  },
  {
    key: "life",
    title: "备用机体",
    hint: "生命 +1，多一次被击落后重返战场的机会。",
    kind: "count",
  },
];

/** 游戏内的起始数值：基础 3 命 / 3 弹 / 1 级火力。 */
export function startingStats(loadout: RaidenLoadout): {
  power: number;
  bombs: number;
  lives: number;
  shield: boolean;
} {
  return {
    power: 1 + loadout.weapon,
    bombs: 3 + loadout.bomb,
    lives: 3 + loadout.life,
    shield: loadout.shield,
  };
}

export function sanitizeLoadout(config: RaidenConfig, raw: unknown): RaidenLoadout {
  const it = (raw && typeof raw === "object" ? raw : {}) as Partial<RaidenLoadout>;
  const count = (value: unknown, max: number) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
  };
  return {
    weapon: count(it.weapon, config.items.weapon.max),
    bomb: count(it.bomb, config.items.bomb.max),
    shield: it.shield === true && config.items.shield.max > 0,
    life: count(it.life, config.items.life.max),
  };
}

/** 出击装备总价（cr）。服务端与前端共用，防止前端篡改价格。 */
export function loadoutCost(config: RaidenConfig, loadout: RaidenLoadout): number {
  const cost =
    loadout.weapon * config.items.weapon.price +
    loadout.bomb * config.items.bomb.price +
    (loadout.shield ? config.items.shield.price : 0) +
    loadout.life * config.items.life.price;
  return round2(cost);
}

export function describeLoadout(config: RaidenConfig, loadout: RaidenLoadout): string {
  const parts: string[] = [];
  if (loadout.weapon > 0) parts.push(`火力 Lv${1 + loadout.weapon}`);
  if (loadout.bomb > 0) parts.push(`炸弹 +${loadout.bomb}`);
  if (loadout.shield) parts.push("护盾");
  if (loadout.life > 0) parts.push(`生命 +${loadout.life}`);
  if (parts.length === 0) return "标准配备";
  return parts.join(" / ");
}

export function stageRewardFor(config: RaidenConfig, stageNo: number): RaidenStageReward {
  return config.stages.find((s) => s.stage === stageNo) ?? { stage: stageNo, firstClear: 0, repeat: 0 };
}

export function stageMeta(stageNo: number): RaidenStageMeta {
  return RAIDEN_STAGES.find((s) => s.no === stageNo) ?? RAIDEN_STAGES[0];
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function sanitizeItem(
  raw: unknown,
  fallback: RaidenItemConfig,
  maxPrice: number,
  maxCount: number,
): RaidenItemConfig {
  const it = (raw && typeof raw === "object" ? raw : {}) as Partial<RaidenItemConfig>;
  return {
    price: round2(positiveNumber(it.price, fallback.price)),
    max: boundedInteger(it.max, fallback.max, 0, maxCount),
  };
}

function sanitizeStages(raw: unknown): RaidenStageReward[] {
  const fallback = DEFAULT_RAIDEN_CONFIG.stages;
  const arr = Array.isArray(raw) ? raw : [];
  return [1, 2, 3].map((no) => {
    const source = arr.find((item) => Number((item as { stage?: unknown })?.stage) === no) as
      | Partial<RaidenStageReward>
      | undefined;
    const def = fallback.find((s) => s.stage === no)!;
    return {
      stage: no,
      firstClear: round2(Math.max(0, Number(source?.firstClear ?? def.firstClear) || 0)),
      repeat: round2(Math.max(0, Number(source?.repeat ?? def.repeat) || 0)),
    };
  });
}

/** 脏配置（缺字段、负价格、起止时间写错）一律退回可用默认值，不让活动页 500。 */
export function sanitizeRaidenConfig(raw: unknown): RaidenConfig {
  const d = DEFAULT_RAIDEN_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<RaidenConfig>;
  const items = (it.items && typeof it.items === "object" ? it.items : {}) as Partial<RaidenConfig["items"]>;

  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    dailyRuns: boundedInteger(it.dailyRuns, d.dailyRuns, 1, 100),
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    repeatDailyCap: round2(Math.max(0, Number(it.repeatDailyCap ?? d.repeatDailyCap) || 0)),
    revivePriceCredits: round2(positiveNumber(it.revivePriceCredits, d.revivePriceCredits)),
    maxRevives: boundedInteger(it.maxRevives, d.maxRevives, 0, 10),
    minStageSeconds: boundedInteger(it.minStageSeconds, d.minStageSeconds, 5, 600),
    maxStageSeconds: boundedInteger(it.maxStageSeconds, d.maxStageSeconds, 120, 7200),
    items: {
      weapon: sanitizeItem(items.weapon, d.items.weapon, 1_000_000, 2),
      bomb: sanitizeItem(items.bomb, d.items.bomb, 1_000_000, 5),
      shield: sanitizeItem(items.shield, d.items.shield, 1_000_000, 1),
      life: sanitizeItem(items.life, d.items.life, 1_000_000, 5),
    },
    stages: sanitizeStages(it.stages),
  };
}

export type RaidenActivityStatus = "disabled" | "pending" | "active" | "ended";

export interface RaidenActivityWindow {
  status: RaidenActivityStatus;
  startMs: number | null;
  endMs: number | null;
}

export function raidenActivityWindow(config: RaidenConfig, now = Date.now()): RaidenActivityWindow {
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
export function raidenActivityKey(config: RaidenConfig): string | null {
  if (!config.enabled || !config.startAt.trim()) return null;
  return config.startAt.trim();
}

/** 关卡的最短/最长合法用时（毫秒），服务端结算用。 */
export function stageDurationBounds(config: RaidenConfig): { minMs: number; maxMs: number } {
  return {
    minMs: config.minStageSeconds * 1000,
    maxMs: config.maxStageSeconds * 1000,
  };
}

/** 每关的分数上限：只做量级防作弊（正常满关约 3~8 万分）。 */
export const STAGE_SCORE_CAP: Record<number, number> = {
  1: 300_000,
  2: 400_000,
  3: 600_000,
};
