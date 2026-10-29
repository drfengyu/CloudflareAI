import { round2 } from "./prize-math";

/**
 * 2026-10-29 新增：抽奖累计统计行（`lottery_user_stats`）的增量口径。
 *
 * 读放大治理：「不限时间」的 COUNT/SUM 加索引也救不了，`/lottery`、看板、管理端
 * 每次加载都要把 `lottery_draw` / `lottery_ticket` 整表扫一遍。改成开奖、买券时把
 * 增量累加到一行，读侧只取一行；口径必须与 `records.ts` 原有的聚合 SQL 完全一致。
 */

/** `scope='all'` 是全量口径；其余 scope 就是活动轮次 startAt 字符串（与 draw.activityKey 同口径）。 */
export const LOTTERY_STATS_ALL_SCOPE = "all";

/** 一行统计的增量；缺省字段按 0 处理，`lastDrawAt` 只做取大。 */
export interface LotteryStatsDelta {
  draws?: number;
  outerHits?: number;
  paidOut?: number;
  clawedBack?: number;
  ticketFace?: number;
  lastDrawAt?: Date | null;
  boughtTickets?: number;
  boughtCredits?: number;
  unusedTickets?: number;
  unusedCredits?: number;
  giftTickets?: number;
  prizeTickets?: number;
}

/** 一注开奖里统计行需要的那几个字段。 */
export interface DrawStatInput {
  ring: "inner" | "outer";
  deltaCredits: number;
  /** 这一注消耗的券面值；免费抽为 0。 */
  ticketCredits: number;
  createdAt: Date;
}

/** 整批开奖的增量：笔数、外圈命中、发放、倒扣、券面、最后一次开奖时间。 */
export function drawStatsDelta(draws: DrawStatInput[]): LotteryStatsDelta {
  const delta: LotteryStatsDelta = {
    draws: draws.length,
    outerHits: 0,
    paidOut: 0,
    clawedBack: 0,
    ticketFace: 0,
    lastDrawAt: null,
  };
  for (const draw of draws) {
    if (draw.ring === "outer") delta.outerHits = (delta.outerHits ?? 0) + 1;
    if (draw.deltaCredits > 0) delta.paidOut = round2((delta.paidOut ?? 0) + draw.deltaCredits);
    else if (draw.deltaCredits < 0) delta.clawedBack = round2((delta.clawedBack ?? 0) - draw.deltaCredits);
    delta.ticketFace = round2((delta.ticketFace ?? 0) + Math.max(0, draw.ticketCredits));
    if (!delta.lastDrawAt || draw.createdAt > delta.lastDrawAt) delta.lastDrawAt = draw.createdAt;
  }
  return delta;
}

/** 发券的增量：买入同时计入「未开奖券」；赠送/抽中只记张数。券面值按单张价格累计。 */
export function ticketStatsDelta(input: {
  source: "buy" | "gift" | "prize";
  count: number;
  priceCredits?: number;
}): LotteryStatsDelta {
  if (input.count <= 0) return {};
  if (input.source === "buy") {
    const face = round2((input.priceCredits ?? 0) * input.count);
    return { boughtTickets: input.count, boughtCredits: face, unusedTickets: input.count, unusedCredits: face };
  }
  if (input.source === "gift") return { giftTickets: input.count };
  return { prizeTickets: input.count };
}

/** 消耗掉已买的券：券包里的「未开奖券」减掉这些张数与面值；赠券/抽中券不进这个口径。 */
export function consumedTicketsDelta(buyTickets: number, buyFace: number): LotteryStatsDelta {
  if (buyTickets <= 0) return {};
  return { unusedTickets: -buyTickets, unusedCredits: -round2(buyFace) };
}

/** 合并多个增量；只做同字段相加（lastDrawAt 取较晚的一个）。 */
export function mergeStatsDeltas(...deltas: LotteryStatsDelta[]): LotteryStatsDelta {
  const merged: LotteryStatsDelta = {};
  for (const delta of deltas) {
    for (const [key, value] of Object.entries(delta) as [keyof LotteryStatsDelta, number | Date | null | undefined][]) {
      if (value == null) continue;
      if (key === "lastDrawAt") {
        const at = value as Date;
        if (!merged.lastDrawAt || at > merged.lastDrawAt) merged.lastDrawAt = at;
        continue;
      }
      merged[key] = round2(((merged[key] as number | undefined) ?? 0) + (value as number));
    }
  }
  return merged;
}

/** 回滚用：所有数值取反。`lastDrawAt` 不在增量里表达，回滚后由 SQL 重算。 */
export function negateStatsDelta(delta: LotteryStatsDelta): LotteryStatsDelta {
  const negated: LotteryStatsDelta = {};
  for (const [key, value] of Object.entries(delta) as [keyof LotteryStatsDelta, number | Date | null | undefined][]) {
    if (key === "lastDrawAt" || value == null) continue;
    negated[key] = -(value as number);
  }
  return negated;
}
