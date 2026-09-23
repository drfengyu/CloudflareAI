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

/**
 * 内圈奖品：固定加/减 cr（绝对值，可为负）。
 *
 * 绝对值是**有意的**：券价因此成为独立杠杆——奖池不动、把券价调高，返还率就往下走。
 * 若内圈也按「倍率 × 券价」存，两圈会同步缩放，返还率被奖池形状钉死，调价格改不了利润率。
 * 后台表单提供「按券价等比重算内圈」按钮，需要联动时显式点一下。
 */
export interface InnerPrize {
  credits: number;
  weight: number;
}

/** 外圈奖品分两类：按倍数结算 cr，或直接赠送抽奖券。 */
export type OuterPrizeKind = "credits" | "tickets";

export interface OuterPrize {
  /** credits=`multiplier`×基数 cr；tickets=直接发 `tickets` 张券，不产生 cr 变动。 */
  kind: OuterPrizeKind;
  /** kind=credits 时生效，可为负（倒扣）。 */
  multiplier: number;
  /** kind=tickets 时生效，赠送张数。 */
  tickets: number;
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
 * 默认奖池：内圈绝对 cr + 外圈倍率，按**单券价 100 cr** 配平到返还率 ≈ 91.1%。
 *
 * 两级分工刻意拉开：内圈是「小得小失」的主战场（正档厚、负档浅），
 * 外圈才是倍数层——但外圈正档一旦低于内圈天花板就没有"进阶感"，所以调奖池时
 * 两边要一起看，改完以后台那行「内圈 / 外圈 / 单券综合期望 + 返还率」为准。
 * 换券价时记得重算内圈（后台有等比重算按钮），否则返还率会随价格上下漂。
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
    { credits: 200, weight: 12 },
    { credits: 150, weight: 14 },
    { credits: 120, weight: 14 },
    { credits: 90, weight: 16 },
    { credits: 60, weight: 16 },
    { credits: 40, weight: 12 },
    { credits: -30, weight: 12 },
    { credits: -80, weight: 8 },
  ],
  outerPrizes: [
    { kind: "credits", multiplier: 1.5, tickets: 0, weight: 14 },
    { kind: "credits", multiplier: 2, tickets: 0, weight: 16 },
    { kind: "credits", multiplier: 2.5, tickets: 0, weight: 12 },
    { kind: "credits", multiplier: 3, tickets: 0, weight: 10 },
    { kind: "credits", multiplier: 4, tickets: 0, weight: 7 },
    { kind: "credits", multiplier: 5, tickets: 0, weight: 6 },
    { kind: "credits", multiplier: 8, tickets: 0, weight: 2 },
    { kind: "credits", multiplier: 12, tickets: 0, weight: 1 },
    { kind: "credits", multiplier: 20, tickets: 0, weight: 0.5 },
    { kind: "tickets", multiplier: 0, tickets: 1, weight: 12 },
    { kind: "tickets", multiplier: 0, tickets: 2, weight: 7 },
    { kind: "tickets", multiplier: 0, tickets: 3, weight: 3 },
    { kind: "tickets", multiplier: 0, tickets: 5, weight: 1 },
    { kind: "credits", multiplier: -0.8, tickets: 0, weight: 14 },
    { kind: "credits", multiplier: -1, tickets: 0, weight: 9 },
    { kind: "credits", multiplier: -1.2, tickets: 0, weight: 5 },
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

function sanitizeInner(value: unknown, ticketPrice: number): InnerPrize[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Partial<InnerPrize> & { multiplier?: number };
      const credits = Number(item?.credits);
      const multiplier = Number(item?.multiplier);
      return {
        // multiplier 写法只短暂存在过一版；按当次券价折回绝对 cr，历史配置照样能读。
        credits: Number.isFinite(credits)
          ? credits
          : Number.isFinite(multiplier)
            ? round2(multiplier * ticketPrice)
            : NaN,
        weight: Number(item?.weight),
      };
    })
    .filter((p) => Number.isFinite(p.credits) && Number.isFinite(p.weight) && p.weight > 0);
}

function sanitizeOuter(value: unknown): OuterPrize[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Partial<OuterPrize>;
      const weight = Number(item?.weight);
      const tickets = Math.trunc(Number(item?.tickets));
      // 旧配置里没有 kind：一律按 cr 倍数解释，线上已有的奖池原样可用。
      if (item?.kind === "tickets") {
        return { kind: "tickets" as const, multiplier: 0, tickets: tickets > 0 ? tickets : 1, weight };
      }
      return { kind: "credits" as const, multiplier: Number(item?.multiplier), tickets: 0, weight };
    })
    .filter(
      (p) =>
        Number.isFinite(p.weight) &&
        p.weight > 0 &&
        (p.kind === "tickets" ? p.tickets > 0 : Number.isFinite(p.multiplier)),
    );
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
  const price = round2(positiveNumber(it.ticketPriceCredits, d.ticketPriceCredits));
  const inner = sanitizeInner(it.innerPrizes, price);
  const outer = sanitizeOuter(it.outerPrizes);
  const chance = Number(it.outerChancePercent);

  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    ticketPriceCredits: price,
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
  /** 本次抽中的抽奖券张数（外圈赠券档）；0 = 不发券。 */
  grantTickets: number;
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

/** 赠券档的文案：不给 cr，只给次数，所以不套 cr 的格式。 */
export function formatTicketLabel(tickets: number): string {
  return `+${Math.trunc(tickets)} 张券`;
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
      grantTickets: 0,
      label: formatPrizeLabel(credits),
    };
  }

  const outerIndex = weightedIndex(config.outerPrizes.map((p) => p.weight), random());
  const prize = config.outerPrizes[outerIndex];

  // 赠券档：不动 cr 账，只往券包里加张数，所以没有倍数也没有基数。
  if (prize.kind === "tickets") {
    return {
      ring: "outer",
      innerIndex,
      outerIndex,
      credits: 0,
      multiplier: null,
      baseCredits: 0,
      grantTickets: prize.tickets,
      label: formatTicketLabel(prize.tickets),
    };
  }

  const base = config.multiplierBase === "batch" ? batchSpendCredits : config.ticketPriceCredits;
  const credits = round2(base * prize.multiplier);
  return {
    ring: "outer",
    innerIndex,
    outerIndex,
    credits,
    multiplier: prize.multiplier,
    baseCredits: base,
    grantTickets: 0,
    label: formatPrizeLabel(credits),
  };
}

function weightedAverage<T>(
  items: T[],
  weight: (item: T) => number,
  value: (item: T) => number,
): number {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return 0;
  return items.reduce((sum, item) => sum + weight(item) * value(item), 0) / total;
}

/** 一档外圈奖品对返还率的记账价值（cr）：赠券按券价折算，cr 档按倍数 × 券价。 */
function outerPrizeValue(config: LotteryConfig, prize: OuterPrize): number {
  return prize.kind === "tickets"
    ? prize.tickets * config.ticketPriceCredits
    : config.ticketPriceCredits * prize.multiplier;
}

/** 只看内圈的期望（cr/次），不含外圈。 */
export function innerExpectation(config: LotteryConfig): number {
  return round2(weightedAverage(config.innerPrizes, (p) => p.weight, (p) => p.credits));
}

/** 只看外圈的期望（cr/次），赠券档按券价折算成 cr。 */
export function outerExpectation(config: LotteryConfig): number {
  return round2(weightedAverage(config.outerPrizes, (p) => p.weight, (p) => outerPrizeValue(config, p)));
}

/** 期望返还的完整拆解，后台表单按当前输入实时重算。 */
export interface LotteryExpectation {
  /** 内圈期望（cr/次）。 */
  innerCredits: number;
  /** 外圈期望（cr/次），只有从入口进来才兑现。 */
  outerCredits: number;
  /** 单券综合期望（cr）。 */
  perTicket: number;
  /** 返还率（%），> 100 即每卖一张券站点净亏。 */
  returnRate: number;
  /** 站点每券净收益（cr），= 券价 − 期望返还。 */
  houseEdge: number;
}

/**
 * 把两圈的期望与综合返还率一次算齐。
 *
 * 内圈是绝对 cr、外圈是倍率 × 券价，所以**券价是独立的利润率杠杆**：券价调高，
 * 外圈那 12.5% 分支同步放大，但内圈不动，综合返还率就往下走。后台表单按当前输入
 * 实时重算这几行，改券价 / 改外圈概率 / 改任一圈的数值或权重都会立刻反映出来。
 */
export function lotteryExpectation(config: LotteryConfig): LotteryExpectation {
  const outerChance = Math.min(100, Math.max(0, config.outerChancePercent)) / 100;
  const perTicket = round2(
    (1 - outerChance) * innerExpectation(config) + outerChance * outerExpectation(config),
  );
  const price = config.ticketPriceCredits;
  return {
    innerCredits: innerExpectation(config),
    outerCredits: outerExpectation(config),
    perTicket,
    returnRate: price > 0 ? round2((perTicket / price) * 100) : 0,
    houseEdge: round2(price - perTicket),
  };
}

/**
 * 单券期望返还（cr）：内圈/外圈按各自权重与外圈概率加权。
 * 赠券档按**券价**折算——它值一次开奖的机会，那机会的期望就是券价量级，
 * 所以把它计入返还率既不是高估也不是精确值，而是可比的口径（真实成本略低于券价，
 * 因为发出去的券本身还要再按返还率打折）。
 *
 * 外圈一律按单券价折算，所以 `multiplierBase = "batch"` 时这个数会低估 10 连抽的真实期望
 * （那时每券期望约为它的批次数倍），后台据此提示即可。
 */
export function expectedReturnPerTicket(config: LotteryConfig): number {
  return lotteryExpectation(config).perTicket;
}

/** 返还率（%）：期望返还 / 券价，> 100 表示每卖一张券站点净亏。 */
export function returnRatePercent(config: LotteryConfig): number {
  return lotteryExpectation(config).returnRate;
}
