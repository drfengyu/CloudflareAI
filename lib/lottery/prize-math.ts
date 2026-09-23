import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·抽奖的纯计算部分（类型、配置清洗、开奖、期望返还）。
 *
 * 这里刻意不 import 任何读库代码：后台配置表单要在浏览器里实时算返还率，
 * 与 `getLotteryConfig()`（读 option 表）同住一个模块会把服务端依赖拖进客户端包。
 * 读配置在 `lib/lottery/config.ts`。
 */

export const LOTTERY_CONFIG_KEY = "lottery_config";

/** `topup.type`：6=限时活动（买券与倒扣为负、中奖为正）。5 已被在线充值占用。 */
export const TOPUP_TYPE_LOTTERY = 6;

/** 内圈奖品：固定加/减 cr。 */
export interface InnerPrize {
  credits: number;
  weight: number;
}

/** 外圈奖品：正负倍数，基数见 `multiplierBase`。 */
export interface OuterPrize {
  multiplier: number;
  weight: number;
}

/** 累抽档位：累计抽满 `draws` 次送 `tickets` 张券，每人每档位只发一次。 */
export interface LotteryMilestone {
  draws: number;
  tickets: number;
}

export interface LotteryConfig {
  enabled: boolean;
  /** 北京墙钟 `YYYY-MM-DD HH:mm`；解析失败视为未开始。 */
  startAt: string;
  endAt: string;
  /** 单张券价格（cr）。 */
  ticketPriceCredits: number;
  /** 进入外圈的概率百分比，0~100。 */
  outerChancePercent: number;
  /**
   * 外圈倍数的基数：
   * - `ticket`：单张券价。单抽与 10 连抽的每券期望相同。
   * - `batch`：本次点击的总花费。10 连抽的每券期望约为单抽的 10 倍，只该在奖池倍数很小时用。
   */
  multiplierBase: "ticket" | "batch";
  /** 中奖 cr 作为临时余额的有效天数。 */
  prizeValidDays: number;
  innerPrizes: InnerPrize[];
  outerPrizes: OuterPrize[];
  milestones: LotteryMilestone[];
}

/**
 * 默认奖池按「单券返还率 ≈ 91%」配平（券价 100 cr）。
 * 内圈权重合计 100、期望 +89 cr；外圈权重合计 100、期望 +102.5 cr，按 12.5% 概率掺入。
 */
export const DEFAULT_LOTTERY_CONFIG: LotteryConfig = {
  enabled: false,
  startAt: "",
  endAt: "",
  ticketPriceCredits: 100,
  outerChancePercent: 12.5,
  multiplierBase: "ticket",
  prizeValidDays: 7,
  innerPrizes: [
    { credits: 60, weight: 25 },
    { credits: 130, weight: 20 },
    { credits: 200, weight: 15 },
    { credits: -60, weight: 20 },
    { credits: -200, weight: 10 },
    { credits: 400, weight: 6 },
    { credits: 1000, weight: 3 },
    { credits: -400, weight: 1 },
  ],
  outerPrizes: [
    { multiplier: 1.5, weight: 30 },
    { multiplier: 0.8, weight: 25 },
    { multiplier: 2.5, weight: 15 },
    { multiplier: -1, weight: 15 },
    { multiplier: -2.5, weight: 8 },
    { multiplier: 5, weight: 4 },
    { multiplier: 10, weight: 2 },
    { multiplier: -5, weight: 1 },
  ],
  milestones: [
    { draws: 10, tickets: 1 },
    { draws: 30, tickets: 3 },
    { draws: 60, tickets: 8 },
  ],
};

function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeInner(value: unknown): InnerPrize[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Partial<InnerPrize>;
      return { credits: Number(item?.credits), weight: Number(item?.weight) };
    })
    .filter((p) => Number.isFinite(p.credits) && Number.isFinite(p.weight) && p.weight > 0);
}

function sanitizeOuter(value: unknown): OuterPrize[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Partial<OuterPrize>;
      return { multiplier: Number(item?.multiplier), weight: Number(item?.weight) };
    })
    .filter((p) => Number.isFinite(p.multiplier) && Number.isFinite(p.weight) && p.weight > 0);
}

function sanitizeMilestones(value: unknown): LotteryMilestone[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Partial<LotteryMilestone>;
      return {
        draws: Math.trunc(Number(item?.draws)),
        tickets: Math.trunc(Number(item?.tickets)),
      };
    })
    .filter((m) => Number.isFinite(m.draws) && m.draws > 0 && Number.isFinite(m.tickets) && m.tickets > 0)
    .sort((a, b) => a.draws - b.draws);
}

/** 脏配置（缺字段、权重全 0、时间串写错）一律退回可用默认值，不让活动页 500。 */
export function sanitizeLotteryConfig(raw: unknown): LotteryConfig {
  const d = DEFAULT_LOTTERY_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<LotteryConfig>;
  const inner = sanitizeInner(it.innerPrizes);
  const outer = sanitizeOuter(it.outerPrizes);
  const chance = Number(it.outerChancePercent);

  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    ticketPriceCredits: round2(positiveNumber(it.ticketPriceCredits, d.ticketPriceCredits)),
    outerChancePercent: Number.isFinite(chance)
      ? Math.min(100, Math.max(0, chance))
      : d.outerChancePercent,
    multiplierBase: it.multiplierBase === "batch" ? "batch" : "ticket",
    prizeValidDays: Math.trunc(positiveNumber(it.prizeValidDays, d.prizeValidDays)),
    // 奖池被清空会让转盘无法开奖，退回默认池子而不是留空数组。
    innerPrizes: inner.length > 0 ? inner : d.innerPrizes,
    outerPrizes: outer.length > 0 ? outer : d.outerPrizes,
    milestones: sanitizeMilestones(it.milestones),
  };
}

export type ActivityStatus = "disabled" | "pending" | "active" | "ended";

export interface ActivityWindow {
  status: ActivityStatus;
  startMs: number | null;
  endMs: number | null;
}

/** 活动窗口状态；起止时间任一无效即视为未开始。 */
export function activityWindow(config: LotteryConfig, now = Date.now()): ActivityWindow {
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

/**
 * 内圈的一个扇区：普通奖品，或通向外圈的「入口」。
 *
 * 扇区角度与实际概率同源于这个数组（`weight` 合计 100），转盘画出来的格子大小就是真实赔率，
 * 不会出现「看着 1/8 却按 12.5% 抽」的错觉。
 */
export interface InnerSector {
  kind: "prize" | "entry";
  weight: number;
  /** kind = prize 时指向 `config.innerPrizes` 的下标；入口扇区为 null。 */
  prizeIndex: number | null;
}

/**
 * 内圈布局：奖品瓜分 `100 - outerChancePercent`，剩下那一块是整个转盘唯一的「外圈入口」。
 * 外圈概率为 0 或外圈没配奖品时不出入口。
 */
export function innerSectorLayout(config: LotteryConfig): InnerSector[] {
  const chance = Math.min(100, Math.max(0, config.outerChancePercent));
  const prizeWeightSum = config.innerPrizes.reduce((sum, p) => sum + p.weight, 0) || 1;
  const prizeShare = config.outerPrizes.length > 0 ? 100 - chance : 100;

  const sectors: InnerSector[] = config.innerPrizes.map((p, i) => ({
    kind: "prize" as const,
    weight: (p.weight / prizeWeightSum) * prizeShare,
    prizeIndex: i,
  }));
  if (prizeShare < 100) sectors.push({ kind: "entry", weight: 100 - prizeShare, prizeIndex: null });
  return sectors;
}

export interface DrawResult {
  /** 最终结算落在哪一圈（账本语义）：内圈奖品，或经入口进外圈。 */
  ring: "inner" | "outer";
  /** 内圈扇区下标（含入口扇区），第一根指针停在它上面。 */
  innerIndex: number;
  /** 外圈扇区下标；没进外圈为 null。 */
  outerIndex: number | null;
  /** 本次结算的 cr 变动，可负。 */
  credits: number;
  /** 外圈倍数；内圈为 null。 */
  multiplier: number | null;
  /** 倍数基数；内圈为 0。 */
  baseCredits: number;
  label: string;
}

/** 一次开奖结果带批次内序号，前端据此定位扇区并展示明细。 */
export interface DrawOutcome extends DrawResult {
  seq: number;
}

function weightedIndex(weights: number[], roll: number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = roll * total;
  for (let i = 0; i < weights.length; i += 1) {
    target -= weights[i];
    if (target < 0) return i;
  }
  return weights.length - 1;
}

export function formatPrizeLabel(value: number): string {
  const n = round2(value);
  return n === 0 ? "谢谢参与" : n > 0 ? `+${n} cr` : `${n} cr`;
}

/**
 * 外圈奖品对外的**实际 cr**（活动页与流水都不给倍数，倍数只是配置里的内部表达）。
 *
 * `drawCount` 是这一次点击抽几回：`multiplierBase = "batch"` 时基数随抽数放大，
 * 所以同一个格子在「抽 1 次」和「抽 10 次」下值不同，界面要分开标。
 */
export function outerPrizeCredits(
  config: LotteryConfig,
  multiplier: number,
  drawCount = 1,
): number {
  const base =
    config.multiplierBase === "batch"
      ? config.ticketPriceCredits * Math.max(1, drawCount)
      : config.ticketPriceCredits;
  return round2(base * multiplier);
}

/**
 * 开一次奖：先在内圈（含入口扇区）落点，落在入口上才进外圈二次开奖。
 * `batchSpendCredits` 只在 `multiplierBase = "batch"` 时参与外圈结算。
 */
export function rollPrize(
  config: LotteryConfig,
  batchSpendCredits: number,
  random: () => number = Math.random,
): DrawResult {
  const layout = innerSectorLayout(config);
  const innerIndex = weightedIndex(layout.map((s) => s.weight), random());
  const sector = layout[innerIndex];

  if (sector?.kind === "prize") {
    const prize = config.innerPrizes[sector.prizeIndex ?? 0];
    const credits = round2(prize.credits);
    return {
      ring: "inner",
      innerIndex,
      outerIndex: null,
      credits,
      multiplier: null,
      baseCredits: 0,
      label: formatPrizeLabel(credits),
    };
  }

  const outerIndex = weightedIndex(config.outerPrizes.map((p) => p.weight), random());
  const prize = config.outerPrizes[outerIndex];
  const base = config.multiplierBase === "batch" ? batchSpendCredits : config.ticketPriceCredits;
  const credits = round2(base * prize.multiplier);
  return {
    ring: "outer",
    innerIndex,
    outerIndex,
    credits,
    multiplier: prize.multiplier,
    baseCredits: base,
    label: formatPrizeLabel(credits),
  };
}

/**
 * 单券期望返还（cr）：内圈/外圈按各自权重与外圈概率加权。
 * 外圈一律按单券价折算，所以 `multiplierBase = "batch"` 时这个数会低估 10 连抽的真实期望
 * （那时每券期望约为它的批次数倍），后台据此提示即可。
 */
export function expectedReturnPerTicket(config: LotteryConfig): number {
  const evOf = <T>(items: T[], weight: (item: T) => number, value: (item: T) => number) => {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    if (total <= 0) return 0;
    return items.reduce((sum, item) => sum + weight(item) * value(item), 0) / total;
  };

  const innerEv = evOf(config.innerPrizes, (p) => p.weight, (p) => p.credits);
  const outerEv = evOf(
    config.outerPrizes,
    (p) => p.weight,
    (p) => config.ticketPriceCredits * p.multiplier,
  );
  const outerChance = Math.min(100, Math.max(0, config.outerChancePercent)) / 100;
  return round2((1 - outerChance) * innerEv + outerChance * outerEv);
}

/** 返还率（%）：期望返还 / 券价，> 100 表示每卖一张券站点净亏。 */
export function returnRatePercent(config: LotteryConfig): number {
  if (config.ticketPriceCredits <= 0) return 0;
  return round2((expectedReturnPerTicket(config) / config.ticketPriceCredits) * 100);
}
