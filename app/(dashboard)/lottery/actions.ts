"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getLotteryConfig } from "@/lib/lottery/config";
import {
  activityWindow,
  formatPrizeLabel,
  rollPrize,
  TOPUP_TYPE_LOTTERY,
  type DrawOutcome,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import {
  adjustPermanentBalance,
  buildTemporaryPrizeRow,
  countDraws,
  countUnusedTickets,
  deleteDrawsByIds,
  deleteTemporaryBalancesByIds,
  deleteTickets,
  deleteTopupsByIds,
  grantTickets,
  insertDrawRows,
  insertTemporaryBalanceRows,
  insertTopupRows,
  lockTickets,
  pickUnusedTicketIds,
  spendCredits,
  unlockTickets,
} from "@/lib/lottery/store";
import { lotteryDraws, temporaryBalances, topups } from "@/lib/db/schema";

const MAX_TICKETS_PER_PURCHASE = 100;

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

type DrawRow = typeof lotteryDraws.$inferInsert;
type TopupRow = typeof topups.$inferInsert;
type TempRow = typeof temporaryBalances.$inferInsert;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rowIds(rows: { id?: string | null }[]): string[] {
  return rows.map((row) => row.id).filter((id): id is string => Boolean(id));
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

    // D1 没有事务，钱已经扣走了；发券或记流水再失败就必须把券收回、把钱退回，
    // 否则用户付了 cr 却拿不到券（退回走永久余额，比原路退回只多不少）。
    let issued: string[] = [];
    try {
      issued = await grantTickets(userId, count, {
        source: "buy",
        priceCredits: config.ticketPriceCredits,
      });
      await insertTopupRows([
        {
          id: crypto.randomUUID(),
          userId,
          amount: -cost,
          type: TOPUP_TYPE_LOTTERY,
          description: `购买抽奖券 ${count} 张（${cost} cr）`,
          createdAt: new Date(),
        },
      ]);
    } catch (error) {
      console.error("[buyTickets] 发券失败，退回扣款", error);
      await compensatePurchase(userId, issued, cost);
      return { success: false, error: "发券失败，扣款已退回，请稍后再试" };
    }

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

/**
 * 买券失败的资金回滚：收回已发出的券，把扣掉的 cr 退回永久余额并补一条流水。
 * 本身再失败就只记日志——钱在用户余额里，不会凭空消失，人工按流水核对即可。
 */
async function compensatePurchase(userId: string, issued: string[], cost: number): Promise<void> {
  try {
    await deleteTickets(issued);
    await adjustPermanentBalance(userId, cost);
    await insertTopupRows([
      {
        id: crypto.randomUUID(),
        userId,
        amount: cost,
        // 退回的是永久余额，不能记成 type=6：钱包会把正向的 6 类流水当带过期的奖励，到期即隐藏。
        type: 2,
        description: `购买抽奖券失败退回（${cost} cr）`,
        createdAt: new Date(),
      },
    ]);
  } catch (rollbackError) {
    console.error("[buyTickets] 退回扣款失败，需人工核对", rollbackError);
  }
}

/** 一整批开奖在内存里算好的行；写库按表批量落，失败按 id 整批撤。 */
interface DrawBatchPlan {
  results: DrawOutcome[];
  drawRows: DrawRow[];
  topupRows: TopupRow[];
  tempRows: TempRow[];
  /** 本批倒扣合计（负数）。中奖走带过期的临时余额，不并进这个净额。 */
  permanentDelta: number;
  /** 本批抽中的赠券张数。 */
  prizeTickets: number;
}

/**
 * 逐注开奖只算随机数与账目，不碰数据库：一次 10 连抽的写入因此能压成「每表一条语句」，
 * 而不是每注各打两三次 D1 HTTP 往返（那是原先 7~10 秒的来源）。
 */
function planDrawBatch(
  userId: string,
  config: LotteryConfig,
  count: number,
  batchId: string,
  ticketIds: string[],
): DrawBatchPlan {
  const batchSpend = round2(config.ticketPriceCredits * count);
  const results: DrawOutcome[] = [];
  const drawRows: DrawRow[] = [];
  const topupRows: TopupRow[] = [];
  const tempRows: TempRow[] = [];
  let permanentDelta = 0;
  let prizeTickets = 0;

  for (let i = 0; i < count; i += 1) {
    const outcome = rollPrize(config, batchSpend);
    const amount = round2(outcome.credits);
    const createdAt = new Date();
    const drawId = crypto.randomUUID();

    drawRows.push({
      id: drawId,
      userId,
      batchId,
      seq: i + 1,
      ring: outcome.ring,
      label: outcome.label,
      multiplier: outcome.multiplier,
      deltaCredits: amount,
      baseCredits: outcome.ring === "outer" ? outcome.baseCredits : 0,
      grantTickets: outcome.grantTickets,
      ticketId: ticketIds[i],
      createdAt,
    });
    results.push({ ...outcome, seq: i + 1 });
    prizeTickets += outcome.grantTickets;

    // 赠券档不产生 cr 变动，也就不写流水（否则钱包里会躺一条「+3 张券 0 cr」的噪声行）。
    if (amount === 0) continue;

    // 流水里也只记实际 cr 与落在哪一圈，倍数是配置的内部表达。
    const label = `${outcome.ring === "outer" ? "外圈" : "内圈"} ${formatPrizeLabel(amount)}`;
    topupRows.push({
      id: crypto.randomUUID(),
      userId,
      amount,
      type: TOPUP_TYPE_LOTTERY,
      description: `限时活动抽奖 ${label}`,
      createdAt,
    });

    if (amount > 0) {
      tempRows.push(
        buildTemporaryPrizeRow(
          userId,
          amount,
          config.prizeValidDays,
          `限时活动抽奖奖励 ${amount} cr（有效期 ${config.prizeValidDays} 天）`,
        ),
      );
    } else {
      permanentDelta = round2(permanentDelta + amount);
    }
  }

  return { results, drawRows, topupRows, tempRows, permanentDelta, prizeTickets };
}

/**
 * 整批撤销：这一批的行、发出去的券、净额扣款全部退回，券原样回券包。
 * 没有事务可依赖，所以逐表按 id 删；本身再失败只记日志，人工按 batchId 与流水核对。
 */
async function compensateDrawBatch(
  userId: string,
  plan: DrawBatchPlan,
  issuedTicketIds: string[],
  lockedTicketIds: string[],
): Promise<void> {
  try {
    await Promise.all([
      deleteDrawsByIds(rowIds(plan.drawRows)),
      deleteTopupsByIds(rowIds(plan.topupRows)),
      deleteTemporaryBalancesByIds(rowIds(plan.tempRows)),
      deleteTickets(issuedTicketIds),
      unlockTickets(lockedTicketIds),
      plan.permanentDelta !== 0
        ? adjustPermanentBalance(userId, -plan.permanentDelta)
        : Promise.resolve(),
    ]);
  } catch (rollbackError) {
    console.error("[drawLottery] 整批回滚失败，需人工核对", rollbackError);
  }
}

/**
 * 转盘开奖：先在内存里把整批结果算完，再一波并发写库。
 *
 * 券整批锁定挡住并发双花；写库失败就整批撤销、券原样退回，所以这一批要么全落账
 * 要么全不落（回滚粒度是整批，不是逐注——逐注保留需要每注一次往返，正是慢的根源）。
 */
export async function drawLottery(
  count: 1 | 10,
): Promise<
  ActionResult<{
    results: DrawOutcome[];
    totalCredits: number;
    prizeTickets: number;
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

    // 一波并发读：活动窗口、可用券、券包余量与本批之前的累计次数。
    const [config, ticketIds, ticketsBefore, drawsBefore] = await Promise.all([
      getLotteryConfig(),
      pickUnusedTicketIds(userId, count),
      countUnusedTickets(userId),
      countDraws(userId),
    ]);

    const closed = windowError(config);
    if (closed) return { success: false, error: closed };
    if (ticketIds.length < count) {
      return {
        success: false,
        error: `抽奖券不足：本次需要 ${count} 张，当前可用 ${ticketIds.length} 张`,
      };
    }

    const batchId = crypto.randomUUID();
    const plan = planDrawBatch(userId, config, count, batchId, ticketIds);

    if (!(await lockTickets(ticketIds, rowIds(plan.drawRows)))) {
      await unlockTickets(ticketIds);
      return { success: false, error: "抽奖券正在被使用，请稍后重试" };
    }

    // 本批发出去的券（抽中的赠券档 + 档位赠送），撤销时按 id 收回。
    const issuedTicketIds: string[] = [];

    const totalDraws = drawsBefore + count;
    let giftedTickets = 0;
    // 只看这一批跨过的档位；更早的档位撞唯一索引，视作已领过，不牵连整批。
    const milestoneGrants = config.milestones
      .filter((milestone) => milestone.draws > totalDraws - count && milestone.draws <= totalDraws)
      .map(async (milestone) => {
        try {
          const ids = await grantTickets(userId, milestone.tickets, {
            source: "gift",
            milestoneDraws: milestone.draws,
          });
          giftedTickets += ids.length;
          issuedTicketIds.push(...ids);
        } catch (error) {
          if (!isUniqueConflict(error)) throw error;
        }
      });

    const prizeGrant =
      plan.prizeTickets > 0
        ? grantTickets(userId, plan.prizeTickets, { source: "prize" }).then((ids) => {
            issuedTicketIds.push(...ids);
            return ids;
          })
        : Promise.resolve();

    const settled = await Promise.allSettled([
      insertDrawRows(plan.drawRows),
      insertTopupRows(plan.topupRows),
      insertTemporaryBalanceRows(plan.tempRows),
      plan.permanentDelta !== 0
        ? adjustPermanentBalance(userId, plan.permanentDelta)
        : Promise.resolve(),
      prizeGrant,
      ...milestoneGrants,
    ]);

    const failure = settled.find((result): result is PromiseRejectedResult =>
      result.status === "rejected",
    );
    if (failure) {
      console.error("[drawLottery] 整批开奖写入失败，整批撤销", failure.reason);
      await compensateDrawBatch(userId, plan, issuedTicketIds, ticketIds);
      return { success: false, error: "开奖失败，本次未消耗抽奖券，请稍后再试" };
    }

    revalidatePath("/lottery");
    revalidatePath("/wallet");
    return {
      success: true,
      data: {
        results: plan.results,
        totalCredits: round2(plan.results.reduce((sum, r) => sum + r.credits, 0)),
        // 这一批抽中的赠券（奖池档），与累抽档位送的券分开报，前端两句话分开提示。
        prizeTickets: plan.prizeTickets,
        // 券包余量按本批收支算出来，省掉写入后的一次往返。
        ticketsLeft: ticketsBefore - count + plan.prizeTickets + giftedTickets,
        totalDraws,
        giftedTickets,
      },
    };
  } catch (error) {
    console.error("[drawLottery] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "开奖失败" };
  }
}

/** 档位赠券的唯一索引冲突是「这一档早领过了」，不是故障，不该拖垮整批。 */
function isUniqueConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
