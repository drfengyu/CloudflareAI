import { and, eq, gte, sql } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { raidenClears, raidenRuns, temporaryBalances, topups } from "@/lib/db/schema";
import { refundPermanentCredits, spendCredits } from "@/lib/billing/spend";
import { cnStartOfToday } from "@/lib/date";
import {
  describeLoadout,
  loadoutCost,
  RAIDEN_STAGES,
  raidenActivityKey,
  raidenActivityWindow,
  round2,
  sanitizeLoadout,
  stageDurationBounds,
  stageRewardFor,
  startingStats,
  STAGE_SCORE_CAP,
  TOPUP_TYPE_RAIDEN,
  type RaidenConfig,
  type RaidenLoadout,
} from "./config";

/**
 * 雷电行动的写入侧原语。
 *
 * 客户端是游戏状态的唯一来源，服务端只做三件事：按配置收钱、校验「这一局确实开了这么久、
 * 关卡顺序对」、把奖励写进 cr 账本。所有可能重复的写入都用唯一索引或条件更新兜住：
 * 同一局同一关只能结算一次（`uq_raiden_clear_run_stage`），首通只能被一个请求抢到
 * （`raiden_progress` 主键 + INSERT OR IGNORE）。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** 一局超过这个时长就不允许再复活（防止隔天拿旧 runId 继续刷）。 */
const REVIVE_TTL_MS = 2 * 60 * 60 * 1000;

export class RaidenError extends Error {}

function assertActiveWindow(config: RaidenConfig): string {
  const window = raidenActivityWindow(config);
  if (window.status === "disabled") throw new RaidenError("活动未开启");
  if (window.status === "pending") throw new RaidenError("活动尚未开始");
  if (window.status === "ended") throw new RaidenError("活动已结束");
  const key = raidenActivityKey(config);
  if (!key) throw new RaidenError("活动轮次无效");
  return key;
}

/** 今日（北京时间）已出击次数。 */
export async function countRunsToday(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(raidenRuns)
    .where(and(eq(raidenRuns.userId, userId), gte(raidenRuns.startedAt, cnStartOfToday())));
  return Number(rows[0]?.n ?? 0);
}

export interface StartedRun {
  runId: string;
  activityKey: string;
  cost: number;
  loadout: RaidenLoadout;
  starting: { power: number; bombs: number; lives: number; shield: boolean };
  runsToday: number;
  dailyRuns: number;
}

/**
 * 出击：校验活动与每日次数 → 扣装备钱 → 把之前没结束的对局标记放弃 → 建 run。
 *
 * 扣款失败一笔不写；建 run 或记流水失败则退回扣款，不留下「花了钱没开局」的状态。
 */
export async function startRun(
  userId: string,
  rawLoadout: unknown,
  config: RaidenConfig,
): Promise<StartedRun> {
  const activityKey = assertActiveWindow(config);
  const loadout = sanitizeLoadout(config, rawLoadout);
  const cost = loadoutCost(config, loadout);
  const runsToday = await countRunsToday(userId);
  if (runsToday >= config.dailyRuns) {
    throw new RaidenError(`今日出击次数已用完（${config.dailyRuns} 次），明天再来`);
  }

  const spend = await spendCredits(userId, cost);
  if (!spend.ok) {
    throw new RaidenError(`余额不足：本次装备需要 ${cost} cr`);
  }

  const now = new Date();
  const runId = crypto.randomUUID();
  const starting = startingStats(loadout);

  try {
    await d1Run(
      "UPDATE raiden_run SET status = 'abandoned', endedAt = ? WHERE userId = ? AND status = 'active'",
      [now.getTime(), userId],
    );
    await db.insert(raidenRuns).values({
      id: runId,
      userId,
      activityKey,
      status: "active",
      loadout: JSON.stringify(loadout),
      power: starting.power,
      bombs: starting.bombs,
      lives: starting.lives,
      revives: 0,
      creditsSpent: cost,
      stage: 0,
      score: 0,
      startedAt: now,
      lastSettleAt: now,
    });
    if (cost > 0) {
      await db.insert(topups).values({
        id: crypto.randomUUID(),
        userId,
        amount: -cost,
        type: TOPUP_TYPE_RAIDEN,
        description: `雷电行动出击 · ${describeLoadout(config, loadout)}（${cost} cr）`,
        createdAt: now,
      });
    }
  } catch (error) {
    await db.delete(raidenRuns).where(eq(raidenRuns.id, runId)).catch(() => undefined);
    if (cost > 0) {
      await refundPermanentCredits(userId, cost, `雷电行动出击失败退回（${cost} cr）`).catch(() => undefined);
    }
    throw error;
  }

  return {
    runId,
    activityKey,
    cost,
    loadout,
    starting,
    runsToday: runsToday + 1,
    dailyRuns: config.dailyRuns,
  };
}

export interface StageSettlement {
  /** true = 这次提交前就已经结算过（断网重试/连点），没有重复发奖。 */
  already: boolean;
  firstClear: boolean;
  stageNo: number;
  reward: number;
  complete: boolean;
  nextStage: number | null;
  /** 重复奖励被每日封顶裁掉的部分（用于界面提示）。 */
  cappedRepeat: boolean;
}

interface RunRow {
  id: string;
  userId: string;
  activityKey: string | null;
  status: string;
  stage: number;
  score: number;
  lastSettleAt: Date;
}

/**
 * 结算一关：先占住结算流水与首通进度，再推进 run，最后发奖。
 *
 * 任何一步失败都按相反顺序撤销已经写下的东西；钱的写入放最后，是为了让「重试」永远
 * 安全——结算流水还在或已经删掉，客户端重放都不会重复发钱。
 */
export async function completeStage(input: {
  userId: string;
  runId: string;
  stageNo: number;
  score: number;
  durationMs: number;
  config: RaidenConfig;
}): Promise<StageSettlement> {
  const { userId, runId, score, config } = input;
  const activityKey = assertActiveWindow(config);

  const stageNo = Math.trunc(Number(input.stageNo));
  if (!Number.isInteger(stageNo) || stageNo < 1 || stageNo > RAIDEN_STAGES.length) {
    throw new RaidenError("关卡编号无效");
  }
  const safeScore = Math.trunc(Number(score));
  if (!Number.isFinite(safeScore) || safeScore < 0 || safeScore > (STAGE_SCORE_CAP[stageNo] ?? 600_000)) {
    throw new RaidenError("分数异常，无法结算");
  }

  const rows = await db
    .select()
    .from(raidenRuns)
    .where(and(eq(raidenRuns.id, runId), eq(raidenRuns.userId, userId)))
    .limit(1);
  const run = rows[0] as RunRow | undefined;
  if (!run) throw new RaidenError("对局不存在");
  if (run.activityKey !== activityKey) throw new RaidenError("这段对局不属于当前活动");
  if (run.status !== "active") throw new RaidenError("对局已结束，请重新出击");
  if (stageNo !== run.stage + 1) throw new RaidenError("关卡顺序异常，请重新出击");

  const now = new Date();
  const elapsedMs = Math.max(0, now.getTime() - new Date(run.lastSettleAt).getTime());
  const bounds = stageDurationBounds(config);
  // 给网络/浏览器计时留 2 秒余量；正常通关本身约 70~90 秒，不可能在 30 秒内打完。
  if (elapsedMs + 2000 < bounds.minMs) throw new RaidenError("关卡用时异常，无法结算");
  if (elapsedMs > bounds.maxMs) throw new RaidenError("关卡超时，无法结算");

  const clearId = crypto.randomUUID();
  const claim = await d1Run(
    "INSERT OR IGNORE INTO raiden_clear " +
      "(id, userId, runId, activityKey, stageNo, score, kind, rewardCredits, durationMs, createdAt) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'repeat', 0, ?, ?)",
    [clearId, userId, runId, activityKey, stageNo, safeScore, elapsedMs, now.getTime()],
  );
  if (claim.changes !== 1) {
    const existing = await db
      .select({ rewardCredits: raidenClears.rewardCredits, kind: raidenClears.kind })
      .from(raidenClears)
      .where(and(eq(raidenClears.runId, runId), eq(raidenClears.stageNo, stageNo)))
      .limit(1);
    return {
      already: true,
      firstClear: existing[0]?.kind === "first",
      stageNo,
      reward: Number(existing[0]?.rewardCredits ?? 0),
      complete: stageNo === RAIDEN_STAGES.length,
      nextStage: stageNo < RAIDEN_STAGES.length ? stageNo + 1 : null,
      cappedRepeat: false,
    };
  }

  // 抢首通：progress 主键是 (userId, activityKey, stageNo)，只有第一个 INSERT 能命中。
  const progressClaim = await d1Run(
    "INSERT OR IGNORE INTO raiden_progress " +
      "(userId, activityKey, stageNo, firstClearedAt, clears, bestScore, bestDurationMs, updatedAt) " +
      "VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
    [userId, activityKey, stageNo, now.getTime(), safeScore, elapsedMs, now.getTime()],
  );
  const firstClear = progressClaim.changes === 1;
  if (!firstClear) {
    await d1Run(
      "UPDATE raiden_progress SET clears = clears + 1, " +
        "bestScore = CASE WHEN ? > bestScore THEN ? ELSE bestScore END, " +
        "bestDurationMs = CASE WHEN bestDurationMs IS NULL OR ? < bestDurationMs THEN ? ELSE bestDurationMs END, " +
        "updatedAt = ? WHERE userId = ? AND activityKey = ? AND stageNo = ?",
      [safeScore, safeScore, elapsedMs, elapsedMs, now.getTime(), userId, activityKey, stageNo],
    );
  }

  const stageReward = stageRewardFor(config, stageNo);
  let reward = firstClear ? stageReward.firstClear : stageReward.repeat;
  let cappedRepeat = false;
  if (!firstClear && reward > 0) {
    const usedRows = await db
      .select({ total: sql<number>`COALESCE(SUM(${raidenClears.rewardCredits}), 0)` })
      .from(raidenClears)
      .where(
        and(
          eq(raidenClears.userId, userId),
          eq(raidenClears.activityKey, activityKey),
          eq(raidenClears.kind, "repeat"),
          gte(raidenClears.createdAt, cnStartOfToday()),
        ),
      );
    const used = Number(usedRows[0]?.total ?? 0);
    const remaining = Math.max(0, round2(config.repeatDailyCap - used));
    if (reward > remaining) {
      reward = remaining;
      cappedRepeat = true;
    }
  }
  reward = round2(Math.max(0, reward));

  const finalStage = stageNo === RAIDEN_STAGES.length;
  const advanced = await d1Run(
    "UPDATE raiden_run SET stage = ?, score = score + ?, lastSettleAt = ?, status = ?, endedAt = ? " +
      "WHERE id = ? AND userId = ? AND status = 'active' AND stage = ?",
    [
      stageNo,
      safeScore,
      now.getTime(),
      finalStage ? "cleared" : "active",
      finalStage ? now.getTime() : null,
      runId,
      userId,
      run.stage,
    ],
  );
  if (advanced.changes !== 1) {
    await rollbackClearClaim(userId, activityKey, stageNo, clearId, firstClear);
    throw new RaidenError("对局状态已变化，请重新出击");
  }

  const tempRowId = crypto.randomUUID();
  const topupRowId = crypto.randomUUID();
  try {
    if (reward > 0) {
      const expiresAt = new Date(now.getTime() + config.rewardValidDays * DAY_MS);
      const meta = RAIDEN_STAGES[stageNo - 1];
      await db.insert(temporaryBalances).values({
        id: tempRowId,
        userId,
        amount: reward,
        expiresAt,
        description: `雷电行动 ${meta.code}「${meta.name}」${firstClear ? "首通" : "重复通关"}奖励 ${reward} cr（有效期 ${config.rewardValidDays} 天）`,
        createdAt: now,
      });
      await db.insert(topups).values({
        id: topupRowId,
        userId,
        amount: reward,
        type: TOPUP_TYPE_RAIDEN,
        description: `雷电行动 ${meta.code} ${firstClear ? "首通" : "重复通关"}奖励 ${reward} cr`,
        createdAt: now,
      });
    }
    await d1Run("UPDATE raiden_clear SET kind = ?, rewardCredits = ? WHERE id = ?", [
      firstClear ? "first" : "repeat",
      reward,
      clearId,
    ]);
  } catch (error) {
    await db.delete(topups).where(eq(topups.id, topupRowId)).catch(() => undefined);
    await db.delete(temporaryBalances).where(eq(temporaryBalances.id, tempRowId)).catch(() => undefined);
    await d1Run(
      "UPDATE raiden_run SET stage = ?, score = ?, lastSettleAt = ?, status = ?, endedAt = ? WHERE id = ?",
      [
        run.stage,
        run.score,
        new Date(run.lastSettleAt).getTime(),
        run.status,
        null,
        runId,
      ],
    ).catch(() => undefined);
    await rollbackClearClaim(userId, activityKey, stageNo, clearId, firstClear);
    throw error;
  }

  return {
    already: false,
    firstClear,
    stageNo,
    reward,
    complete: finalStage,
    nextStage: finalStage ? null : stageNo + 1,
    cappedRepeat,
  };
}

/** 撤销一次结算占位：删流水；首通连进度行一起删，重复通关只把 clears 减回去。 */
async function rollbackClearClaim(
  userId: string,
  activityKey: string,
  stageNo: number,
  clearId: string,
  firstClear: boolean,
): Promise<void> {
  await d1Run("DELETE FROM raiden_clear WHERE id = ?", [clearId]).catch(() => undefined);
  if (firstClear) {
    await d1Run("DELETE FROM raiden_progress WHERE userId = ? AND activityKey = ? AND stageNo = ?", [
      userId,
      activityKey,
      stageNo,
    ]).catch(() => undefined);
  } else {
    await d1Run(
      "UPDATE raiden_progress SET clears = CASE WHEN clears > 1 THEN clears - 1 ELSE 1 END WHERE userId = ? AND activityKey = ? AND stageNo = ?",
      [userId, activityKey, stageNo],
    ).catch(() => undefined);
  }
}

export interface ReviveResult {
  price: number;
  revives: number;
  maxRevives: number;
}

/** 阵亡后付费复活：先占住复活次数，再扣钱；扣钱失败把次数退回去。 */
export async function reviveRun(
  userId: string,
  runId: string,
  config: RaidenConfig,
): Promise<ReviveResult> {
  const activityKey = assertActiveWindow(config);
  if (config.maxRevives <= 0) throw new RaidenError("本局不支持复活");
  const price = round2(config.revivePriceCredits);

  const rows = await db
    .select({
      status: raidenRuns.status,
      revives: raidenRuns.revives,
      activityKey: raidenRuns.activityKey,
      startedAt: raidenRuns.startedAt,
    })
    .from(raidenRuns)
    .where(and(eq(raidenRuns.id, runId), eq(raidenRuns.userId, userId)))
    .limit(1);
  const run = rows[0];
  if (!run) throw new RaidenError("对局不存在");
  if (run.activityKey !== activityKey) throw new RaidenError("这段对局不属于当前活动");
  if (run.status !== "active") throw new RaidenError("对局已结束");
  if (run.revives >= config.maxRevives) throw new RaidenError("本局复活次数已用完");
  if (Date.now() - new Date(run.startedAt).getTime() > REVIVE_TTL_MS) {
    throw new RaidenError("对局已超时，请重新出击");
  }

  const reserved = await d1Run(
    "UPDATE raiden_run SET revives = revives + 1, creditsSpent = creditsSpent + ? " +
      "WHERE id = ? AND userId = ? AND status = 'active' AND revives < ?",
    [price, runId, userId, config.maxRevives],
  );
  if (reserved.changes !== 1) throw new RaidenError("复活次数已用完");

  const spend = await spendCredits(userId, price);
  if (!spend.ok) {
    await d1Run(
      "UPDATE raiden_run SET revives = revives - 1, creditsSpent = creditsSpent - ? WHERE id = ?",
      [price, runId],
    ).catch(() => undefined);
    throw new RaidenError(`余额不足：复活需要 ${price} cr`);
  }

  const topupId = crypto.randomUUID();
  try {
    await db.insert(topups).values({
      id: topupId,
      userId,
      amount: -price,
      type: TOPUP_TYPE_RAIDEN,
      description: `雷电行动 · 阵亡复活（${price} cr）`,
      createdAt: new Date(),
    });
  } catch (error) {
    await refundPermanentCredits(userId, price, `雷电行动复活失败退回（${price} cr）`).catch(
      () => undefined,
    );
    await d1Run(
      "UPDATE raiden_run SET revives = revives - 1, creditsSpent = creditsSpent - ? WHERE id = ?",
      [price, runId],
    ).catch(() => undefined);
    throw error;
  }

  return { price, revives: run.revives + 1, maxRevives: config.maxRevives };
}

/** 结束一局（阵亡放弃 / 主动退出）。只改状态，不结算任何未通关的分数。 */
export async function endRun(
  userId: string,
  runId: string,
  status: "failed" | "abandoned",
): Promise<boolean> {
  const { changes } = await d1Run(
    "UPDATE raiden_run SET status = ?, endedAt = ? WHERE id = ? AND userId = ? AND status = 'active'",
    [status, Date.now(), runId, userId],
  );
  return changes === 1;
}
