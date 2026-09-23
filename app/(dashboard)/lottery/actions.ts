"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { lotteryDraws, temporaryBalances, topups } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getLotteryConfig } from "@/lib/lottery/config";
import {
  activityWindow,
  formatPrizeLabel,
  rollPrize,
  TOPUP_TYPE_LOTTERY,
  type DrawOutcome,
  type DrawResult,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import {
  adjustPermanentBalance,
  countDraws,
  countUnusedTickets,
  grantMilestoneTickets,
  grantTemporaryBalance,
  grantTickets,
  lockTicket,
  pickUnusedTicketIds,
  spendCredits,
  unlockTicket,
} from "@/lib/lottery/store";

const MAX_TICKETS_PER_PURCHASE = 100;

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

/** 一次开奖落账后的凭证，失败时按它精确撤销。 */
interface Settlement {
  topupId: string;
  tempId: string | null;
  amount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function windowError(config: LotteryConfig): string | null {
  const { status } = activityWindow(config);
  if (status === "active") return null;
  if (status === "disabled") return "活动未开启";
  if (status === "pending") return "活动尚未开始";
  return "活动已结束";
}

/**
 * 购买抽奖券：单券价 × 张数，先扣临时余额再扣永久余额，总额不足则整笔失败。
 */
export async function buyTickets(
  count: number,
): Promise<ActionResult<{ tickets: number; costCredits: number; ticketsLeft: number }>> {
  try {
    const userId = await requireUser();
    if (!Number.isInteger(count) || count < 1 || count > MAX_TICKETS_PER_PURCHASE) {
      return { success: false, error: `单次最多购买 ${MAX_TICKETS_PER_PURCHASE} 张` };
    }
    if (!checkRateLimit(`lottery-buy:${userId}`, { window: 60_000, limit: 10 })) {
      return { success: false, error: "操作过于频繁，请 1 分钟后再试" };
    }

    const config = await getLotteryConfig();
    const closed = windowError(config);
    if (closed) return { success: false, error: closed };

    const cost = round2(config.ticketPriceCredits * count);
    const spend = await spendCredits(userId, cost);
    if (!spend.ok) {
      return { success: false, error: `${spend.reason}：购买 ${count} 张券需要 ${cost} cr` };
    }

    await grantTickets(userId, count, { source: "buy", priceCredits: config.ticketPriceCredits });
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -cost,
      type: TOPUP_TYPE_LOTTERY,
      description: `购买抽奖券 ${count} 张（${cost} cr）`,
      createdAt: new Date(),
    });

    revalidatePath("/lottery");
    revalidatePath("/wallet");
    return {
      success: true,
      data: { tickets: count, costCredits: cost, ticketsLeft: await countUnusedTickets(userId) },
    };
  } catch (error) {
    console.error("[buyTickets] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "购买失败" };
  }
}

/** 中奖进带过期的临时余额，倒扣直接记在永久余额上（允许变负）。 */
async function settleDraw(
  userId: string,
  config: LotteryConfig,
  outcome: DrawResult,
): Promise<Settlement> {
  const amount = round2(outcome.credits);
  const topupId = crypto.randomUUID();
  // 流水里也只记实际 cr 与落在哪一圈，倍数是配置的内部表达。
  const label = `${outcome.ring === "outer" ? "外圈" : "内圈"} ${formatPrizeLabel(amount)}`;

  await db.insert(topups).values({
    id: topupId,
    userId,
    amount,
    type: TOPUP_TYPE_LOTTERY,
    description: `限时活动抽奖 ${label}`,
    createdAt: new Date(),
  });

  if (amount > 0) {
    const tempId = await grantTemporaryBalance(
      userId,
      amount,
      config.prizeValidDays,
      `限时活动抽奖奖励 ${amount} cr（有效期 ${config.prizeValidDays} 天）`,
    );
    return { topupId, tempId, amount };
  }

  if (amount < 0) await adjustPermanentBalance(userId, amount);
  return { topupId, tempId: null, amount };
}

async function undoSettlement(userId: string, s: Settlement): Promise<void> {
  if (s.tempId) {
    await db.delete(temporaryBalances).where(eq(temporaryBalances.id, s.tempId));
  }
  if (s.amount < 0) await adjustPermanentBalance(userId, -s.amount);
  await db.delete(topups).where(eq(topups.id, s.topupId));
}

/**
 * 转盘开奖。券先整批锁定（防并发双花），再逐次结算；
 * 某次结算失败就撤销那一次并停止，剩下的券原样退回。
 */
export async function drawLottery(
  count: 1 | 10,
): Promise<
  ActionResult<{
    results: DrawOutcome[];
    totalCredits: number;
    ticketsLeft: number;
    totalDraws: number;
    giftedTickets: number;
  }>
> {
  try {
    const userId = await requireUser();
    if (count !== 1 && count !== 10) return { success: false, error: "只能抽 1 次或 10 次" };
    if (!checkRateLimit(`lottery-draw:${userId}`, { window: 60_000, limit: 12 })) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }

    const config = await getLotteryConfig();
    const closed = windowError(config);
    if (closed) return { success: false, error: closed };

    const ticketIds = await pickUnusedTicketIds(userId, count);
    if (ticketIds.length < count) {
      return {
        success: false,
        error: `抽奖券不足：本次需要 ${count} 张，当前可用 ${ticketIds.length} 张`,
      };
    }

    const batchId = crypto.randomUUID();
    const drawIds = ticketIds.map(() => crypto.randomUUID());
    const locked: number[] = [];
    for (let i = 0; i < ticketIds.length; i += 1) {
      if (!(await lockTicket(ticketIds[i], drawIds[i]))) break;
      locked.push(i);
    }
    if (locked.length !== count) {
      for (const i of locked) await unlockTicket(ticketIds[i]);
      return { success: false, error: "抽奖券正在被使用，请稍后重试" };
    }

    const batchSpend = round2(config.ticketPriceCredits * count);
    const results: DrawOutcome[] = [];
    const consumed = new Set<number>();

    for (let i = 0; i < count; i += 1) {
      const outcome = rollPrize(config, batchSpend);
      const amount = round2(outcome.credits);
      let settlement: Settlement | null = null;
      try {
        await db.insert(lotteryDraws).values({
          id: drawIds[i],
          userId,
          batchId,
          seq: i + 1,
          ring: outcome.ring,
          label: outcome.label,
          multiplier: outcome.multiplier,
          deltaCredits: amount,
          baseCredits: outcome.ring === "outer" ? outcome.baseCredits : 0,
          ticketId: ticketIds[i],
          createdAt: new Date(),
        });
        settlement = await settleDraw(userId, config, outcome);
        consumed.add(i);
        results.push({ ...outcome, seq: i + 1 });
      } catch (error) {
        console.error("[drawLottery] 单次开奖失败，撤销该次", error);
        if (settlement) await undoSettlement(userId, settlement);
        await db.delete(lotteryDraws).where(eq(lotteryDraws.id, drawIds[i]));
        break;
      }
    }

    // 没开奖成功的券退回券包。
    for (const i of locked) {
      if (!consumed.has(i)) await unlockTicket(ticketIds[i]);
    }

    if (results.length === 0) {
      return { success: false, error: "开奖失败，本次未消耗抽奖券" };
    }

    const totalDraws = await countDraws(userId);
    let gifted = 0;
    for (const milestone of config.milestones) {
      // 只看这一批跨过的档位；更早的档位由唯一索引兜住不重发。
      const crossed =
        milestone.draws > totalDraws - results.length && milestone.draws <= totalDraws;
      if (!crossed) continue;
      if (await grantMilestoneTickets(userId, milestone.draws, milestone.tickets)) {
        gifted += milestone.tickets;
      }
    }

    revalidatePath("/lottery");
    revalidatePath("/wallet");
    return {
      success: true,
      data: {
        results,
        totalCredits: round2(results.reduce((sum, r) => sum + r.credits, 0)),
        ticketsLeft: await countUnusedTickets(userId),
        totalDraws,
        giftedTickets: gifted,
      },
    };
  } catch (error) {
    console.error("[drawLottery] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "开奖失败" };
  }
}
