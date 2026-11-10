"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  couponNameFor,
  couponTicketBalance,
  grantCouponToRound,
  payWithCoupon,
  refundCouponPayment,
  revokeCouponCredits,
  type CouponPayment,
} from "@/lib/activity/coupons";
import { getLotteryConfig } from "@/lib/lottery/config";
import {
  activityWindow,
  calculateLuckyChance,
  couponCreditsForReward,
  couponTicketsForReward,
  currentActivityKey,
  formatPrizeLabel,
  rollPrize,
  TOPUP_TYPE_LOTTERY,
  type DrawOutcome,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import {
  adjustPermanentBalance,
  applyDrawStats,
  beijingDayKey,
  buildTemporaryPrizeRow,
  claimMilestoneGrant,
  clawbackCredits,
  countConsecutiveMisses,
  countDraws,
  deleteDrawsByIds,
  deleteMilestoneGrants,
  deleteTemporaryBalancesByIds,
  deleteTopupsByIds,
  hasUsedFreeDrawToday,
  insertDrawRows,
  insertTemporaryBalanceRows,
  insertTopupRows,
  refundClawback,
  revertDrawStats,
  type ClawbackReceipt,
} from "@/lib/lottery/store";
import { drawStatsDelta, type LotteryStatsDelta } from "@/lib/lottery/stats";
import { lotteryDraws, temporaryBalances, topups } from "@/lib/db/schema";
import {
  DRAW_RECORD_PAGE_SIZE,
  listDrawRecords,
  lotteryBalance,
  type DrawRecord,
} from "@/lib/lottery/records";

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

/** 一整批开奖在内存里算好的行；写库按表批量落，失败按 id 整批撤。 */
interface DrawBatchPlan {
  results: DrawOutcome[];
  drawRows: DrawRow[];
  topupRows: TopupRow[];
  tempRows: TempRow[];
  /** 本批落到永久余额上的正数净额（目前只有「永久余额」奖型）。倒扣不进这里，见 clawbackTotal。 */
  permanentDelta: number;
  /** 本批倒扣合计（正数）。结算时先吃未过期的临时余额，剩下的才落到本金上。 */
  clawbackTotal: number;
  /** 本批抽中的赠券张数。 */
  prizeTickets: number;
  /** 本批计入累计统计行的增量（笔数/外圈/发放/倒扣/券面/最后开奖时间）。 */
  stats: LotteryStatsDelta;
}

/**
 * 逐注开奖只算随机数与账目，不碰数据库：一次 10 连抽的写入因此能压成「每表一条语句」，
 * 而不是每注各打两三次 D1 HTTP 往返（那是原先 7~10 秒的来源）。
 *
 * `ticketFaces` 是逐注消耗的券面值（免费抽那一注传 0），写进 lottery_draw.ticketCredits
 * 供按窗口对账，同时计入累计统计行。付费一律活动券直付，不再关联抽奖券，ticketId 恒为 null。
 */
function planDrawBatch(
  userId: string,
  config: LotteryConfig,
  count: number,
  batchId: string,
  ticketFaces: number[],
  activityKey: string | null,
  /** 免费抽那一批写当天的北京日期（唯一索引挡重复领）；花钱抽传 null。 */
  freeDrawDate: string | null,
): DrawBatchPlan {
  const batchSpend = round2(config.ticketPriceCredits * count);
  const results: DrawOutcome[] = [];
  const drawRows: DrawRow[] = [];
  const topupRows: TopupRow[] = [];
  const tempRows: TempRow[] = [];
  let permanentDelta = 0;
  let clawbackTotal = 0;
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
      ticketId: null,
      ticketCredits: ticketFaces[i] ?? 0,
      activityKey,
      freeDrawDate,
      createdAt,
    });
    results.push({ ...outcome, seq: i + 1 });
    prizeTickets += outcome.grantTickets;

    // 赠券档不产生 cr 变动，也就不写流水（否则钱包里会躺一条「+3 张券 0 cr」的噪声行）。
    if (amount === 0) continue;

    // 流水里也只记实际 cr 与落在哪一圈，倍数是配置的内部表达；永久余额标注「永久」。
    const ringLabel = outcome.ring === "outer" ? "外圈" : "内圈";
    const permanentTag = outcome.balanceType === "permanent" ? "（永久）" : "";
    const label = `${ringLabel} ${formatPrizeLabel(amount)}${permanentTag}`;
    topupRows.push({
      id: crypto.randomUUID(),
      userId,
      amount,
      type: TOPUP_TYPE_LOTTERY,
      description: `幸运转盘抽奖 ${label}`,
      createdAt,
    });

    if (amount > 0 && outcome.balanceType === "permanent") {
      // 永久余额奖品：直接进永久余额，不过期。
      permanentDelta = round2(permanentDelta + amount);
    } else if (amount > 0) {
      // 普通正数奖品：发带过期的临时余额。
      tempRows.push(
        buildTemporaryPrizeRow(
          userId,
          amount,
          config.prizeValidDays,
          `幸运转盘抽奖奖励 ${amount} cr（有效期 ${config.prizeValidDays} 天）`,
        ),
      );
    } else {
      // 倒扣：先累计到本批，结算时先吃未过期的临时余额、不够再扣本金（见 clawbackCredits）。
      clawbackTotal = round2(clawbackTotal - amount);
    }
  }

  return {
    results,
    drawRows,
    topupRows,
    tempRows,
    permanentDelta,
    clawbackTotal,
    prizeTickets,
    stats: drawStatsDelta(
      drawRows.map((row, index) => ({
        ring: row.ring,
        deltaCredits: Number(row.deltaCredits),
        ticketCredits: ticketFaces[index] ?? 0,
        createdAt: row.createdAt ?? new Date(),
      })),
    ),
  };
}

/**
 * 整批撤销：这一批的行、发出去的活动券、净额扣款全部退回，付费券原样回券包。
 * 没有事务可依赖，所以逐表按 id 删；本身再失败只记日志，人工按 batchId 与流水核对。
 *
 * `appliedStats` 记录累计统计行有没有加过：加过就按同一份增量反向扣回（开奖时间重算）。
 * `milestoneClaimIds` 是本批刚占下的累抽档位，删掉后这些档位下次还能再发；
 * `couponGrantsToRevoke` 是已成功发出的活动券面值（cr），按轮次条件扣回。
 */
async function compensateDrawBatch(
  userId: string,
  activityKey: string | null,
  plan: DrawBatchPlan,
  milestoneClaimIds: string[],
  couponGrantsToRevoke: number[],
  /** 本批用活动券直付的部分；没有就是 null。 */
  couponPayment: CouponPayment | null,
  /** 已经发生的倒扣回收；没执行到就传 null。 */
  clawback: ClawbackReceipt | null,
  appliedStats: { draw: boolean },
): Promise<void> {
  try {
    await Promise.all([
      deleteDrawsByIds(rowIds(plan.drawRows)),
      deleteTopupsByIds(rowIds(plan.topupRows)),
      deleteTemporaryBalancesByIds(rowIds(plan.tempRows)),
      deleteMilestoneGrants(milestoneClaimIds),
      couponPayment ? refundCouponPayment(couponPayment) : Promise.resolve(),
      plan.permanentDelta !== 0
        ? adjustPermanentBalance(userId, -plan.permanentDelta)
        : Promise.resolve(),
      ...(activityKey
        ? couponGrantsToRevoke.map((amount) =>
            revokeCouponCredits(userId, "lottery", activityKey, amount),
          )
        : []),
    ]);
    if (appliedStats.draw) await revertDrawStats(userId, activityKey, plan.stats);
    // 退回倒扣要排在删临时余额之后：那批中奖行会被删掉，先加回再删就白加一场。
    if (clawback) await refundClawback(userId, clawback);
  } catch (rollbackError) {
    console.error("[drawLottery] 整批回滚失败，需人工核对", rollbackError);
  }
}

/**
 * 转盘开奖：先在内存里把整批结果算完，再一波并发写库。
 *
 * 付费只扣当期活动券（`payWithCoupon` 一条条件 UPDATE 挡住并发双花），不再有锁券步骤；
 * 写库失败就整批撤销、付费券原样退回，所以这一批要么全落账要么全不落
 * （回滚粒度是整批，不是逐注——逐注保留需要每注一次往返，正是慢的根源）。
 *
 * 赠券档与累抽档位都发**活动券**：配置里的张数是「抽奖等价」（1 = 一次抽奖价值 = 单券价 cr），
 * 实发按券价折算成活动券面值入账。`useFreeDraw=true` 且 count=1 且今日未用过免费抽时不消耗券。
 * 服务端自己查 `hasUsedFreeDrawToday` 验证，前端无法通过重复传参作弊。
 */
export async function drawLottery(
  count: 1 | 10,
  useFreeDraw = false,
): Promise<
  ActionResult<{
    results: DrawOutcome[];
    totalCredits: number;
    /** 本批抽中赠券档折算后的活动券张数。 */
    prizeTickets: number;
    /** 开奖后当期活动券可用整张数（按本批收支推算，省一次往返）。 */
    couponTicketsLeft: number;
    totalDraws: number;
    /** 累抽档位赠送的活动券张数。 */
    giftedTickets: number;
    freeDrawUsed: boolean;
    /** 本次是否触发了保底（外圈概率临时提升）。 */
    luckyBoosted: boolean;
    /** 本次实际使用的外圈概率（%），含保底提升。 */
    luckyChancePercent: number;
  }>
> {
  try {
    const userId = await requireUser();
    if (count !== 1 && count !== 10) return { success: false, error: "只能抽 1 次或 10 次" };
    if (!(await checkRateLimit(`lottery-draw:${userId}`, { window: 60_000, limit: 12 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }

    // 免费抽只对单抽生效，且服务端自己验证今日是否已用过。
    // 「今天」= 今天的北京日期：先查（免费的快速路径），查不到再退回按时间窗口的老判据
    // （迁移前产生的记录没有 freeDrawDate，否则当天已抽过的人还能再白嫖一次）。
    const freeDrawDay = beijingDayKey();
    const freeDrawEligible =
      useFreeDraw && count === 1 && !(await hasUsedFreeDrawToday(userId, freeDrawDay));

    // 一波并发读：当期活动券余量、本批之前的累计次数、连续未中大奖次数（保底用）。
    // countDraws / countConsecutiveMisses 按当前活动轮次过滤，新活动战绩重计、保底重置。
    const config = await getLotteryConfig();
    const activityKey = currentActivityKey(config);
    const [couponBefore, drawsBefore, consecutiveMisses] = await Promise.all([
      couponTicketBalance(userId, "lottery", activityKey, config.couponUnitCredits),
      countDraws(userId, activityKey),
      countConsecutiveMisses(userId, 30, activityKey),
    ]);

    const closed = windowError(config);
    if (closed) return { success: false, error: closed };
    if (!activityKey) return { success: false, error: "活动轮次无效" };
    const couponName = couponNameFor("lottery", activityKey);

    // 付费：免费抽不扣券；否则整批按单券价用当期活动券直付（整张口径，不会出现半张）。
    const paidCount = freeDrawEligible ? 0 : count;
    let couponPayment: CouponPayment | null = null;
    if (paidCount > 0) {
      const paid = await payWithCoupon(
        userId,
        "lottery",
        activityKey,
        round2(paidCount * config.ticketPriceCredits),
        config.couponUnitCredits,
      );
      if (!paid.ok) return { success: false, error: paid.reason };
      couponPayment = paid.payment;
    }

    // 保底：连续未中大奖达阈值后，外圈概率线性提升（每多 1 次未中 +0.5%，上限 35%）。
    // 只覆盖 outerChancePercent，奖品金额与券价不动；中一次外圈正档后计数自然清零。
    const luckyChancePercent = calculateLuckyChance(consecutiveMisses, config.outerChancePercent);
    const luckyBoosted = luckyChancePercent > config.outerChancePercent;
    const effectiveConfig: LotteryConfig = luckyBoosted
      ? { ...config, outerChancePercent: luckyChancePercent }
      : config;

    // 免费抽那一注券面记 0；活动券直付的每注按单券价记券面，写进 ticketCredits 供对账。
    const ticketFaces = freeDrawEligible
      ? [0]
      : Array.from({ length: count }, () => config.ticketPriceCredits);

    const batchId = crypto.randomUUID();
    const plan = planDrawBatch(
      userId,
      effectiveConfig,
      count,
      batchId,
      ticketFaces,
      activityKey,
      freeDrawEligible ? freeDrawDay : null,
    );

    const totalDraws = drawsBefore + count;
    // 本批刚占下的累抽档位与已成功发出的活动券面值，撤销时按它们收回。
    const milestoneClaimIds: string[] = [];
    const couponGrantsToRevoke: number[] = [];
    let giftedTickets = 0;
    // 只看这一批跨过的档位；更早的档位撞唯一索引（claim 返回 null），视作已领过，不牵连整批。
    const milestoneGrants = config.milestones
      .filter((milestone) => milestone.draws > totalDraws - count && milestone.draws <= totalDraws)
      .map(async (milestone) => {
        const claimId = await claimMilestoneGrant(userId, activityKey, milestone.draws, milestone.tickets);
        if (!claimId) return;
        milestoneClaimIds.push(claimId);
        const amount = couponCreditsForReward(config, milestone.tickets);
        await grantCouponToRound(userId, "lottery", activityKey, couponName, amount);
        couponGrantsToRevoke.push(amount);
        giftedTickets += couponTicketsForReward(config, milestone.tickets);
      });

    // 抽中赠券档：把本批合计的抽奖等价张数一次性折算成活动券面值入账。
    const prizeGrant =
      plan.prizeTickets > 0
        ? (async () => {
            const amount = couponCreditsForReward(config, plan.prizeTickets);
            await grantCouponToRound(userId, "lottery", activityKey, couponName, amount);
            couponGrantsToRevoke.push(amount);
          })()
        : Promise.resolve();

    // 本批倒扣实际扣了哪里，回滚时按它退回。
    let clawbackReceipt: ClawbackReceipt | null = null;
    let drawStatsApplied = false;

    // 每个写入操作打标签，失败时能精准定位是哪一步炸了
    const writeTasks: Array<{ label: string; promise: Promise<unknown> }> = [
      { label: "insertDrawRows", promise: insertDrawRows(plan.drawRows) },
      { label: "insertTopupRows", promise: insertTopupRows(plan.topupRows) },
      { label: "insertTemporaryBalanceRows", promise: insertTemporaryBalanceRows(plan.tempRows) },
      {
        label: "adjustPermanentBalance",
        promise: plan.permanentDelta !== 0 ? adjustPermanentBalance(userId, plan.permanentDelta) : Promise.resolve(),
      },
      {
        // 倒扣：先吃他手里未过期的临时余额（最早到期的先扣），不够的部分才落到本金。
        // 本批刚发的中奖行按 id 排除，免得同一次写入里「刚发给他就当场扣走」。
        label: "clawbackCredits",
        promise:
          plan.clawbackTotal > 0
            ? clawbackCredits(userId, plan.clawbackTotal, rowIds(plan.tempRows)).then((receipt) => {
                clawbackReceipt = receipt;
              })
            : Promise.resolve(),
      },
      { label: "prizeGrant", promise: prizeGrant },
      ...milestoneGrants.map((p, i) => ({ label: `milestoneGrant_${i}`, promise: p })),
      {
        label: "drawStats",
        promise: applyDrawStats(userId, activityKey, plan.stats).then(() => {
          drawStatsApplied = true;
        }),
      },
    ];

    const settled = await Promise.allSettled(writeTasks.map((t) => t.promise));

    const failureIndex = settled.findIndex((r) => r.status === "rejected");
    if (failureIndex >= 0) {
      const failedTask = writeTasks[failureIndex];
      const reason = (settled[failureIndex] as PromiseRejectedResult).reason;
      console.error(
        `[drawLottery] 写入失败 step=${failedTask.label}`,
        reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
      );
      await compensateDrawBatch(
        userId,
        activityKey,
        plan,
        milestoneClaimIds,
        couponGrantsToRevoke,
        couponPayment,
        clawbackReceipt,
        { draw: drawStatsApplied },
      );
      // 免费抽撞唯一索引 = 今天这一发已经领过了（并发或连点），不是故障，说人话回去。
      if (freeDrawEligible && failedTask.label === "insertDrawRows" && isUniqueConflict(reason)) {
        return { success: false, error: "今日免费抽已使用，明天再来" };
      }
      const detail = reason instanceof Error ? reason.message : String(reason);
      return { success: false, error: `开奖失败（${failedTask.label}）：${detail}` };
    }

    const prizeCouponTickets = couponTicketsForReward(config, plan.prizeTickets);
    revalidatePath("/lottery");
    revalidatePath("/wallet");
    return {
      success: true,
      data: {
        results: plan.results,
        totalCredits: round2(plan.results.reduce((sum, r) => sum + r.credits, 0)),
        // 这一批抽中的赠券（奖池档）折算成活动券张数，与累抽档位送的券分开报。
        prizeTickets: prizeCouponTickets,
        // 券包余量按本批收支算出来，省掉写入后的一次往返：
        // 基线 − 付费扣掉的整张 + 抽中赠券 + 累抽赠送。
        couponTicketsLeft:
          couponBefore - (couponPayment?.tickets ?? 0) + prizeCouponTickets + giftedTickets,
        totalDraws,
        giftedTickets,
        freeDrawUsed: freeDrawEligible,
        luckyBoosted,
        luckyChancePercent,
      },
    };
  } catch (error) {
    console.error("[drawLottery] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "开奖失败" };
  }
}

/**
 * 「我的活动记录」的局部翻页数据：与首屏同一活动轮次口径。
 * 总条数直接取累计统计行的 draws（当期口径就是统计行本身），省掉一次明细 COUNT。
 */
export async function listMyActivityRecords(
  page: number,
): Promise<{ records: DrawRecord[]; totalRecords: number; totalPages: number }> {
  const userId = await requireUser();
  const config = await getLotteryConfig();
  const activityKey = currentActivityKey(config);
  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);

  const [records, myStats, currentStats] = await Promise.all([
    listDrawRecords({
      userId,
      limit: DRAW_RECORD_PAGE_SIZE,
      offset: (safePage - 1) * DRAW_RECORD_PAGE_SIZE,
      activityKey,
    }),
    lotteryBalance({ userId }),
    activityKey ? lotteryBalance({ userId, activityKey }) : Promise.resolve(null),
  ]);

  const totalRecords = (activityKey ? currentStats?.draws : myStats.draws) ?? 0;
  return {
    records,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / DRAW_RECORD_PAGE_SIZE)),
  };
}

/** 档位赠券的唯一索引冲突是「这一档早领过了」，不是故障，不该拖垮整批。 */
function isUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Drizzle 包装后的错误：message 可能是 "Failed query: ..."，
  // 原始 SQLite 错误可能在 cause.message 里，或者整个对象 toString 里。
  const parts = [
    error.message,
    error.cause instanceof Error ? error.cause.message : "",
    typeof error.cause === "object" && error.cause !== null ? String((error.cause as Record<string, unknown>).message ?? "") : "",
  ];
  const combined = parts.join(" ");
  return /UNIQUE constraint failed/i.test(combined) || /unique/i.test(combined) && /constraint/i.test(combined);
}
