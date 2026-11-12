import { and, desc, eq, gte, sql } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { trialRuns } from "@/lib/db/schema";
import { payWithCoupon, refundCouponPayment } from "@/lib/activity/coupons";
import { grantTempCredits } from "@/lib/activity/rewards";
import { cnStartOfToday } from "@/lib/date";
import {
  TOPUP_TYPE_TRIAL,
  trialActivityKey,
  trialActivityWindow,
  trialRewardFor,
  trialTimeBounds,
  type TrialConfig,
} from "./config";
import {
  generateTrialDungeon,
  parseTrialDungeon,
  simulateTrialDungeon,
  type TrialDungeon,
} from "./dungeon";

/**
 * 每日试炼的写入侧：一次挑战 = 一行 `trial_run`。
 *
 * 浮游城地图（层数 + 房间 + 随机种子）在开局时落库，交卷只上交
 * 每帧按键掩码；服务端用 `lib/trial/dungeon.ts` 按 60Hz 确定性重放，
 * 判分靠「状态从 active 改到 scored」的条件更新保证只发一次奖，
 * 断网重试拿到的都是同一次结果。
 */

export class TrialError extends Error {}

function assertActiveWindow(config: TrialConfig): string {
  const window = trialActivityWindow(config);
  if (window.status === "disabled") throw new TrialError("活动未开启");
  if (window.status === "pending") throw new TrialError("活动尚未开始");
  if (window.status === "ended") throw new TrialError("活动已结束");
  const key = trialActivityKey(config);
  if (!key) throw new TrialError("活动轮次无效");
  return key;
}

export async function countTrialRunsToday(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(trialRuns)
    .where(and(eq(trialRuns.userId, userId), gte(trialRuns.startedAt, cnStartOfToday())));
  return Number(rows[0]?.n ?? 0);
}

export interface ActiveTrialRun {
  runId: string;
  dungeon: TrialDungeon;
  startedAt: number;
  expiresAt: number;
}

interface TrialRunRow {
  id: string;
  activityKey: string;
  status: string;
  questions: string;
  questionCount: number;
  correct: number;
  rewardCredits: number;
  startedAt: Date;
  submittedAt: Date | null;
}

/** 还没交卷的一局；超时的由页面提示，不在这里自动结算。 */
export async function findActiveTrialRun(
  userId: string,
  activityKey: string | null,
  config: TrialConfig,
): Promise<ActiveTrialRun | null> {
  if (!activityKey) return null;
  const rows = await db
    .select({
      id: trialRuns.id,
      activityKey: trialRuns.activityKey,
      questions: trialRuns.questions,
      startedAt: trialRuns.startedAt,
    })
    .from(trialRuns)
    .where(
      and(
        eq(trialRuns.userId, userId),
        eq(trialRuns.activityKey, activityKey),
        eq(trialRuns.status, "active"),
      ),
    )
    .orderBy(desc(trialRuns.startedAt))
    .limit(1);
  const run = rows[0];
  if (!run) return null;
  const dungeon = parseTrialDungeon(run.questions);
  if (!dungeon) return null;
  const startedAt = new Date(run.startedAt).getTime();
  return {
    runId: run.id,
    dungeon,
    startedAt,
    expiresAt: startedAt + config.timeLimitSeconds * 1000,
  };
}

export interface StartedTrial {
  runId: string;
  dungeon: TrialDungeon;
  startedAt: number;
  expiresAt: number;
  runsToday: number;
  dailyRuns: number;
  priceCredits: number;
}

/**
 * 开局：校验活动与每日次数 → 扣券 → 生成地下城落库。
 *
 * 已经有一局没交卷时直接复用，不再扣第二次券；券不足一笔不写。
 * 旧版对局（JSON 版本不是 5）就地换成新地图，同样不再扣券。
 */
export async function startTrialRun(userId: string, config: TrialConfig): Promise<StartedTrial> {
  const activityKey = assertActiveWindow(config);
  const existing = await findActiveTrialRun(userId, activityKey, config);
  if (existing) {
    return {
      ...existing,
      runsToday: await countTrialRunsToday(userId),
      dailyRuns: config.dailyRuns,
      priceCredits: config.runPriceCredits,
    };
  }

  const now = new Date();
  const dungeon = generateTrialDungeon(config.questionCount);

  const stale = await db
    .select({ id: trialRuns.id })
    .from(trialRuns)
    .where(
      and(
        eq(trialRuns.userId, userId),
        eq(trialRuns.activityKey, activityKey),
        eq(trialRuns.status, "active"),
      ),
    )
    .orderBy(desc(trialRuns.startedAt))
    .limit(1);
  if (stale[0]) {
    await d1Run(
      `UPDATE trial_run SET questions = ?, questionCount = ?, correct = 0, durationMs = 0, startedAt = ?
        WHERE id = ? AND userId = ? AND status = 'active'`,
      [JSON.stringify(dungeon), dungeon.floors.length, now, stale[0].id, userId],
    );
    return {
      runId: stale[0].id,
      dungeon,
      startedAt: now.getTime(),
      expiresAt: now.getTime() + config.timeLimitSeconds * 1000,
      runsToday: await countTrialRunsToday(userId),
      dailyRuns: config.dailyRuns,
      priceCredits: config.runPriceCredits,
    };
  }

  const runsToday = await countTrialRunsToday(userId);
  if (runsToday >= config.dailyRuns) {
    throw new TrialError(`今日挑战次数已用完（${config.dailyRuns} 次），明天再来`);
  }

  const paid = await payWithCoupon(
    userId,
    "trial",
    activityKey,
    config.runPriceCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new TrialError(paid.reason);

  const runId = crypto.randomUUID();
  try {
    await db.insert(trialRuns).values({
      id: runId,
      userId,
      activityKey,
      status: "active",
      questions: JSON.stringify(dungeon),
      questionCount: dungeon.floors.length,
      startedAt: now,
    });
  } catch (error) {
    await db.delete(trialRuns).where(eq(trialRuns.id, runId)).catch(() => undefined);
    await refundCouponPayment(paid.payment);
    throw error;
  }

  return {
    runId,
    dungeon,
    startedAt: now.getTime(),
    expiresAt: now.getTime() + config.timeLimitSeconds * 1000,
    runsToday: runsToday + 1,
    dailyRuns: config.dailyRuns,
    priceCredits: config.runPriceCredits,
  };
}

export interface TrialSettlement {
  /** true = 这一局之前已经交过（重试），没有重复发奖。 */
  already: boolean;
  /** true = 超过限时，按 0 波处理。 */
  expired: boolean;
  floorsCleared: number;
  totalFloors: number;
  reward: number;
  durationMs: number;
  heroHp: number;
  victory: boolean;
}

/**
 * 交卷：先条件更新占住这一局，再发奖；发奖失败把状态改回 active 让用户能重交。
 * 活动结束后仍允许交卷——只要这一局属于当前轮次，按开局时的价格结算。
 */
export async function submitTrialRun(input: {
  userId: string;
  runId: string;
  actions: unknown[];
  config: TrialConfig;
}): Promise<TrialSettlement> {
  const activityKey = trialActivityKey(input.config);
  if (!activityKey) throw new TrialError("活动轮次无效");

  const rows = await db
    .select()
    .from(trialRuns)
    .where(and(eq(trialRuns.id, input.runId), eq(trialRuns.userId, input.userId)))
    .limit(1);
  const run = rows[0] as TrialRunRow | undefined;
  if (!run) throw new TrialError("挑战不存在");
  if (run.activityKey !== activityKey) throw new TrialError("这局挑战不属于当前活动");

  if (run.status !== "active") {
    return {
      already: true,
      expired: run.status === "expired",
      floorsCleared: run.correct,
      totalFloors: run.questionCount,
      reward: Number(run.rewardCredits ?? 0),
      durationMs: 0,
      heroHp: 0,
      victory: run.status === "scored" && run.correct >= run.questionCount,
    };
  }

  const dungeon = parseTrialDungeon(run.questions);
  if (!dungeon) throw new TrialError("地下城数据异常，请重新开始");

  const now = Date.now();
  const startedAt = new Date(run.startedAt).getTime();
  const durationMs = Math.max(0, now - startedAt);
  const result = simulateTrialDungeon(dungeon, Array.isArray(input.actions) ? input.actions : []);
  const bounds = trialTimeBounds(input.config);
  const expired = durationMs > bounds.maxMs;
  const suspiciouslyFast = durationMs < bounds.minMs;
  const floorsCleared =
    expired || suspiciouslyFast ? 0 : Math.min(result.floorsCleared, dungeon.floors.length);
  const reward = expired ? 0 : trialRewardFor(input.config, floorsCleared);
  const status = expired ? "expired" : "scored";

  const claimed = await d1Run(
    `UPDATE trial_run SET status = ?, correct = ?, durationMs = ?, rewardCredits = ?, submittedAt = ?
      WHERE id = ? AND userId = ? AND status = 'active'`,
    [status, floorsCleared, durationMs, reward, now, input.runId, input.userId],
  );
  if (claimed.changes !== 1) {
    const latest = await db
      .select({
        status: trialRuns.status,
        correct: trialRuns.correct,
        questionCount: trialRuns.questionCount,
        rewardCredits: trialRuns.rewardCredits,
        durationMs: trialRuns.durationMs,
      })
      .from(trialRuns)
      .where(eq(trialRuns.id, input.runId))
      .limit(1);
    const settled = latest[0];
    return {
      already: true,
      expired: settled?.status === "expired",
      floorsCleared: Number(settled?.correct ?? 0),
      totalFloors: Number(settled?.questionCount ?? dungeon.floors.length),
      reward: Number(settled?.rewardCredits ?? 0),
      durationMs: Number(settled?.durationMs ?? 0),
      heroHp: 0,
      victory:
        settled?.status === "scored" &&
        Number(settled?.correct ?? 0) >= Number(settled?.questionCount ?? 0),
    };
  }

  if (reward > 0) {
    try {
      await grantTempCredits({
        userId: input.userId,
        amount: reward,
        topupType: TOPUP_TYPE_TRIAL,
        description: `每日试炼 通关 ${floorsCleared}/${dungeon.floors.length} 层奖励`,
        validDays: input.config.rewardValidDays,
      });
    } catch (error) {
      await d1Run(
        "UPDATE trial_run SET status = 'active', submittedAt = NULL WHERE id = ? AND status = ?",
        [input.runId, status],
      ).catch(() => undefined);
      throw error;
    }
  }

  return {
    already: false,
    expired,
    floorsCleared,
    totalFloors: dungeon.floors.length,
    reward,
    durationMs,
    heroHp: result.heroHp,
    victory: floorsCleared >= dungeon.floors.length,
  };
}

export interface TrialHistoryRow {
  id: string;
  /** 通关波数（沿用旧列名）。 */
  correct: number;
  /** 总波数。 */
  questionCount: number;
  reward: number;
  startedAt: Date;
  status: string;
}

/** 本活动最近的挑战记录（含超时未交卷）。 */
export async function listTrialRuns(
  userId: string,
  activityKey: string | null,
  limit = 10,
): Promise<TrialHistoryRow[]> {
  if (!activityKey) return [];
  const rows = await db
    .select({
      id: trialRuns.id,
      correct: trialRuns.correct,
      questionCount: trialRuns.questionCount,
      rewardCredits: trialRuns.rewardCredits,
      startedAt: trialRuns.startedAt,
      status: trialRuns.status,
    })
    .from(trialRuns)
    .where(and(eq(trialRuns.userId, userId), eq(trialRuns.activityKey, activityKey)))
    .orderBy(desc(trialRuns.startedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    correct: Number(row.correct),
    questionCount: Number(row.questionCount),
    reward: Number(row.rewardCredits),
    startedAt: new Date(row.startedAt),
    status: row.status,
  }));
}
