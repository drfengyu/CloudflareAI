import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·翻牌夺宝的纯配置与计算。
 *
 * 与转盘（`lib/lottery/prize-math`）最大的区别是**赔率是精确的，不靠大数定律**：
 * 牌桌就 12 张牌、奖项一一对应写死，每局发一张洗牌后的牌，所以单期期望就是 12 格平均值，
 * 返还率 = 平均奖 / 票价，配平一次就成立，不需要模拟器跑一万次才知道真实赔率。
 * 代价是它没有倒扣档、也不送券——是一个纯回收 cr 的活动。
 *
 * 这里刻意不 import 任何读库代码：后台表单要在浏览器里实时算返还率。
 * 读 `option.flip_config` 在 `lib/flip/settings.ts`。
 */

export const FLIP_CONFIG_KEY = "flip_config";

/** `topup.type`：12=翻牌夺宝（票价为负、中奖为正）。11 已被雷电行动占用。 */
export const TOPUP_TYPE_FLIP = 12;

/** 牌桌张数。改这个数等于改玩法：12 格是「一屏摆满、翻一张就走」的节奏。 */
export const FLIP_CARD_COUNT = 12;

/** 单格奖励上限，与转盘奖品同一量级。 */
export const FLIP_MAX_REWARD = 1_000_000;

export interface FlipConfig {
  enabled: boolean;
  /** 北京墙钟 `YYYY-MM-DD HH:mm`；解析失败视为未开始。 */
  startAt: string;
  endAt: string;
  /** 开一局的价格（cr）。 */
  roundPriceCredits: number;
  /**
   * 牌桌上 12 张牌的奖项（cr），长度恒为 `FLIP_CARD_COUNT`，0 = 空牌。
   * 顺序就是配置里的第几张格子的金额；开局时服务端洗牌决定它落在哪个位置。
   */
  cardRewards: number[];
  /** 中奖 cr 作为临时余额的有效天数。 */
  rewardValidDays: number;
  /** 每日最多开局次数（按北京时间自然日），给大额回收留一个闸门。 */
  dailyRounds: number;
}

/**
 * 默认牌桌：3 个 cr 大奖 + 3 个小额 + 6 张空，票价 100 cr。
 *
 * 七档合计 720 cr → 每局期望 60 cr → 返还率 60%，站点每局净回收 40 cr。
 * 想调利润率只动票价或某几格金额，后台那行实时返还是准的。
 */
export const DEFAULT_FLIP_CONFIG: FlipConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  roundPriceCredits: 100,
  cardRewards: [300, 180, 120, 60, 40, 20, 0, 0, 0, 0, 0, 0],
  rewardValidDays: 7,
  dailyRounds: 20,
};

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

/** 补齐/裁剪成 12 格，脏值按空牌处理——空牌是合法配置，缺格才需要兜默认值。 */
function sanitizeCardRewards(raw: unknown): number[] {
  const source = Array.isArray(raw) ? raw : [];
  return Array.from({ length: FLIP_CARD_COUNT }, (_, index) => {
    const n = Number(source[index]);
    return Number.isFinite(n) ? round2(Math.min(FLIP_MAX_REWARD, Math.max(0, n))) : 0;
  });
}

/** 脏配置（缺字段、负票价、起止时间写错）一律退回可用默认值，不让活动页 500。 */
export function sanitizeFlipConfig(raw: unknown): FlipConfig {
  const d = DEFAULT_FLIP_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<FlipConfig>;

  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    roundPriceCredits: round2(positiveNumber(it.roundPriceCredits, d.roundPriceCredits)),
    cardRewards: sanitizeCardRewards(it.cardRewards),
    rewardValidDays: boundedInteger(it.rewardValidDays, d.rewardValidDays, 1, 3650),
    dailyRounds: boundedInteger(it.dailyRounds, d.dailyRounds, 1, 1000),
  };
}

export type FlipActivityStatus = "disabled" | "pending" | "active" | "ended";

export interface FlipActivityWindow {
  status: FlipActivityStatus;
  startMs: number | null;
  endMs: number | null;
}

/** 活动窗口状态；起止时间任一无效即视为未开始。 */
export function flipActivityWindow(config: FlipConfig, now = Date.now()): FlipActivityWindow {
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
export function flipActivityKey(config: FlipConfig): string | null {
  if (!config.enabled || !config.startAt.trim()) return null;
  return config.startAt.trim();
}

export interface FlipExpectation {
  /** 12 格金额合计（cr）。 */
  boardTotal: number;
  /** 每局期望返还（cr）= 合计 / 12，精确值而非模拟值。 */
  expectedPerRound: number;
  /** 返还率（%），> 100 即每开一局站点净亏。 */
  returnRatePercent: number;
  /** 站点每局净回收（cr），= 票价 − 期望返还。 */
  houseEdge: number;
  /** 牌桌上的非空牌张数。 */
  winningCards: number;
  /** 中到奖的概率（%）。 */
  hitChancePercent: number;
}

/** 期望返还的完整拆解，后台表单按当前输入实时重算。 */
export function flipExpectation(config: FlipConfig): FlipExpectation {
  const boardTotal = round2(config.cardRewards.reduce((sum, value) => sum + value, 0));
  const expectedPerRound = round2(boardTotal / FLIP_CARD_COUNT);
  const price = config.roundPriceCredits;
  const winningCards = config.cardRewards.filter((value) => value > 0).length;
  return {
    boardTotal,
    expectedPerRound,
    returnRatePercent: price > 0 ? round2((expectedPerRound / price) * 100) : 0,
    houseEdge: round2(price - expectedPerRound),
    winningCards,
    hitChancePercent: round2((winningCards / FLIP_CARD_COUNT) * 100),
  };
}

export function formatFlipReward(value: number): string {
  const n = round2(value);
  return n > 0 ? `+${n} cr` : "空牌";
}

/**
 * 洗出一副牌桌：奖项按 Fisher–Yates 打乱后落到 12 个位置上。
 *
 * 结果只写进库、不下发给前端（未翻开前发出去就等于把答案给用户看了），
 * 翻开那一局才随结算结果一起揭晓。
 */
export function dealFlipBoard(config: FlipConfig, random: () => number = Math.random): number[] {
  const board = [...config.cardRewards];
  for (let i = board.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

/** 落库的牌桌读回来用：脏行按空牌处理，绝不因为一行坏数据把结算卡死。 */
export function parseFlipBoard(raw: string | null | undefined): number[] {
  try {
    return sanitizeCardRewards(JSON.parse(raw ?? "[]"));
  } catch {
    return sanitizeCardRewards(null);
  }
}
