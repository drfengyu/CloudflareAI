import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { raidenClears, raidenProgress, raidenRuns, users } from "@/lib/db/schema";
import { maskUserLabel } from "@/lib/mask";
import { cnStartOfToday } from "@/lib/date";
import { RAIDEN_STAGES } from "./config";

/** 只读查询：活动页、后台记录页共用。这里的返回值全部是可直接跨 Server/Client 边界的类型。 */

export interface RaidenRunView {
  id: string;
  status: string;
  stage: number;
  score: number;
  revives: number;
  creditsSpent: number;
  startedAt: string;
  endedAt: string | null;
}

const RUN_STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  cleared: "全关通关",
  failed: "阵亡",
  abandoned: "已放弃",
};

export function runStatusLabel(status: string): string {
  return RUN_STATUS_LABEL[status] ?? status;
}

function toRunView(row: {
  id: string;
  status: string;
  stage: number;
  score: number;
  revives: number;
  creditsSpent: number;
  startedAt: Date;
  endedAt: Date | null;
}): RaidenRunView {
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    score: Number(row.score ?? 0),
    revives: Number(row.revives ?? 0),
    creditsSpent: Number(row.creditsSpent ?? 0),
    startedAt: new Date(row.startedAt).toISOString(),
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
  };
}

export interface MyRaidenSummary {
  runsToday: number;
  totalRuns: number;
  bestScore: number;
  firstClears: number;
  totalReward: number;
  stages: {
    stage: number;
    name: string;
    clears: number;
    bestScore: number;
    bestDurationMs: number | null;
    firstClearedAt: string | null;
  }[];
  recentRuns: RaidenRunView[];
}

export async function myRaidenSummary(
  userId: string,
  activityKey: string | null,
): Promise<MyRaidenSummary> {
  const scope = activityKey ? eq(raidenRuns.activityKey, activityKey) : undefined;
  const [progressRows, clearRows, runRows, todayRows] = await Promise.all([
    db
      .select()
      .from(raidenProgress)
      .where(
        activityKey
          ? and(eq(raidenProgress.userId, userId), eq(raidenProgress.activityKey, activityKey))
          : eq(raidenProgress.userId, userId),
      ),
    db
      .select({
        clears: sql<number>`COUNT(*)`,
        firstClears: sql<number>`SUM(CASE WHEN ${raidenClears.kind} = 'first' THEN 1 ELSE 0 END)`,
        totalReward: sql<number>`COALESCE(SUM(${raidenClears.rewardCredits}), 0)`,
      })
      .from(raidenClears)
      .where(
        and(
          eq(raidenClears.userId, userId),
          activityKey ? eq(raidenClears.activityKey, activityKey) : undefined,
        ),
      ),
    db
      .select()
      .from(raidenRuns)
      .where(and(eq(raidenRuns.userId, userId), scope))
      .orderBy(desc(raidenRuns.startedAt))
      .limit(6),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(raidenRuns)
      .where(and(eq(raidenRuns.userId, userId), gte(raidenRuns.startedAt, cnStartOfToday()))),
  ]);

  const bestRows = await db
    .select({ best: sql<number>`COALESCE(MAX(${raidenRuns.score}), 0)`, total: sql<number>`COUNT(*)` })
    .from(raidenRuns)
    .where(and(eq(raidenRuns.userId, userId), scope));

  const progressByStage = new Map(progressRows.map((p) => [p.stageNo, p]));
  return {
    runsToday: Number(todayRows[0]?.n ?? 0),
    totalRuns: Number(bestRows[0]?.total ?? 0),
    bestScore: Number(bestRows[0]?.best ?? 0),
    firstClears: Number(clearRows[0]?.firstClears ?? 0),
    totalReward: Number(clearRows[0]?.totalReward ?? 0),
    stages: RAIDEN_STAGES.map((meta) => {
      const row = progressByStage.get(meta.no);
      return {
        stage: meta.no,
        name: meta.name,
        clears: Number(row?.clears ?? 0),
        bestScore: Number(row?.bestScore ?? 0),
        bestDurationMs: row?.bestDurationMs ?? null,
        firstClearedAt: row?.firstClearedAt ? new Date(row.firstClearedAt).toISOString() : null,
      };
    }),
    recentRuns: runRows.map(toRunView),
  };
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  label: string;
  score: number;
  stage: number;
  clearedAll: boolean;
  isMe: boolean;
}

/** 跨用户排行榜：按人取最高分，避免一个人的多局霸占整张榜。 */
export async function listRaidenLeaderboard(
  activityKey: string,
  currentUserId: string,
  limit = 10,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: raidenRuns.userId,
      score: sql<number>`MAX(${raidenRuns.score})`,
      stage: sql<number>`MAX(${raidenRuns.stage})`,
    })
    .from(raidenRuns)
    .where(
      and(
        eq(raidenRuns.activityKey, activityKey),
        inArray(raidenRuns.status, ["cleared", "failed"]),
        gte(raidenRuns.stage, 1),
      ),
    )
    .groupBy(raidenRuns.userId)
    .orderBy(sql`MAX(${raidenRuns.score}) DESC`)
    .limit(limit);

  if (rows.length === 0) return [];
  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, rows.map((r) => r.userId)));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((row, index) => {
    const user = userMap.get(row.userId);
    const stage = Number(row.stage ?? 0);
    return {
      rank: index + 1,
      userId: row.userId,
      label: maskUserLabel(user?.email ?? null, user?.name ?? null, row.userId),
      score: Number(row.score ?? 0),
      stage,
      clearedAll: stage >= RAIDEN_STAGES.length,
      isMe: row.userId === currentUserId,
    };
  });
}

export interface GlobalRaidenStats {
  runs: number;
  players: number;
  firstClears: number;
  rewardsPaid: number;
}

export async function globalRaidenStats(activityKey: string): Promise<GlobalRaidenStats> {
  const [runAgg, clearAgg] = await Promise.all([
    db
      .select({
        runs: sql<number>`COUNT(*)`,
        players: sql<number>`COUNT(DISTINCT ${raidenRuns.userId})`,
      })
      .from(raidenRuns)
      .where(eq(raidenRuns.activityKey, activityKey)),
    db
      .select({
        firstClears: sql<number>`SUM(CASE WHEN ${raidenClears.kind} = 'first' THEN 1 ELSE 0 END)`,
        rewardsPaid: sql<number>`COALESCE(SUM(${raidenClears.rewardCredits}), 0)`,
      })
      .from(raidenClears)
      .where(eq(raidenClears.activityKey, activityKey)),
  ]);
  return {
    runs: Number(runAgg[0]?.runs ?? 0),
    players: Number(runAgg[0]?.players ?? 0),
    firstClears: Number(clearAgg[0]?.firstClears ?? 0),
    rewardsPaid: Number(clearAgg[0]?.rewardsPaid ?? 0),
  };
}

export interface BigWinRow {
  label: string;
  stageNo: number;
  reward: number;
  createdAt: string;
}

/** 最近的首通播报（跨用户、脱敏）。 */
export async function listRecentFirstClears(
  activityKey: string,
  limit = 6,
): Promise<BigWinRow[]> {
  const rows = await db
    .select({
      userId: raidenClears.userId,
      stageNo: raidenClears.stageNo,
      reward: raidenClears.rewardCredits,
      createdAt: raidenClears.createdAt,
    })
    .from(raidenClears)
    .where(and(eq(raidenClears.activityKey, activityKey), eq(raidenClears.kind, "first")))
    .orderBy(desc(raidenClears.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const userRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, rows.map((r) => r.userId)));
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  return rows.map((row) => {
    const user = userMap.get(row.userId);
    return {
      label: maskUserLabel(user?.email ?? null, user?.name ?? null, row.userId),
      stageNo: row.stageNo,
      reward: Number(row.reward ?? 0),
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
    };
  });
}

// ── 后台记录 ─────────────────────────────────────────────────────────────

export interface AdminRaidenReport {
  runs: number;
  players: number;
  spentCredits: number;
  rewardsPaid: number;
  firstClears: number;
  repeatClears: number;
  stages: { stageNo: number; name: string; clears: number; firstClears: number; rewards: number }[];
  recentRuns: {
    id: string;
    label: string;
    status: string;
    stage: number;
    score: number;
    creditsSpent: number;
    revives: number;
    startedAt: string;
  }[];
}

export async function getAdminRaidenReport(
  activityKey: string,
  start: Date,
  end: Date = new Date(),
): Promise<AdminRaidenReport> {
  const [runAgg, clearAgg, stageRows, recent] = await Promise.all([
    db
      .select({
        runs: sql<number>`COUNT(*)`,
        players: sql<number>`COUNT(DISTINCT ${raidenRuns.userId})`,
        spent: sql<number>`COALESCE(SUM(${raidenRuns.creditsSpent}), 0)`,
      })
      .from(raidenRuns)
      .where(
        and(
          eq(raidenRuns.activityKey, activityKey),
          gte(raidenRuns.startedAt, start),
          lt(raidenRuns.startedAt, end),
        ),
      ),
    db
      .select({
        firstClears: sql<number>`SUM(CASE WHEN ${raidenClears.kind} = 'first' THEN 1 ELSE 0 END)`,
        repeatClears: sql<number>`SUM(CASE WHEN ${raidenClears.kind} = 'repeat' THEN 1 ELSE 0 END)`,
        rewards: sql<number>`COALESCE(SUM(${raidenClears.rewardCredits}), 0)`,
      })
      .from(raidenClears)
      .where(
        and(
          eq(raidenClears.activityKey, activityKey),
          gte(raidenClears.createdAt, start),
          lt(raidenClears.createdAt, end),
        ),
      ),
    db
      .select({
        stageNo: raidenClears.stageNo,
        clears: sql<number>`COUNT(*)`,
        firstClears: sql<number>`SUM(CASE WHEN ${raidenClears.kind} = 'first' THEN 1 ELSE 0 END)`,
        rewards: sql<number>`COALESCE(SUM(${raidenClears.rewardCredits}), 0)`,
      })
      .from(raidenClears)
      .where(
        and(
          eq(raidenClears.activityKey, activityKey),
          gte(raidenClears.createdAt, start),
          lt(raidenClears.createdAt, end),
        ),
      )
      .groupBy(raidenClears.stageNo)
      .orderBy(raidenClears.stageNo),
    db
      .select()
      .from(raidenRuns)
      .where(
        and(
          eq(raidenRuns.activityKey, activityKey),
          gte(raidenRuns.startedAt, start),
          lt(raidenRuns.startedAt, end),
        ),
      )
      .orderBy(desc(raidenRuns.startedAt))
      .limit(50),
  ]);

  const userRows =
    recent.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, recent.map((r) => r.userId)))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return {
    runs: Number(runAgg[0]?.runs ?? 0),
    players: Number(runAgg[0]?.players ?? 0),
    spentCredits: Number(runAgg[0]?.spent ?? 0),
    rewardsPaid: Number(clearAgg[0]?.rewards ?? 0),
    firstClears: Number(clearAgg[0]?.firstClears ?? 0),
    repeatClears: Number(clearAgg[0]?.repeatClears ?? 0),
    stages: RAIDEN_STAGES.map((meta) => {
      const row = stageRows.find((r) => r.stageNo === meta.no);
      return {
        stageNo: meta.no,
        name: meta.name,
        clears: Number(row?.clears ?? 0),
        firstClears: Number(row?.firstClears ?? 0),
        rewards: Number(row?.rewards ?? 0),
      };
    }),
    recentRuns: recent.map((row) => {
      const user = userMap.get(row.userId);
      return {
        id: row.id,
        label: maskUserLabel(user?.email ?? null, user?.name ?? null, row.userId),
        status: row.status,
        stage: Number(row.stage ?? 0),
        score: Number(row.score ?? 0),
        creditsSpent: Number(row.creditsSpent ?? 0),
        revives: Number(row.revives ?? 0),
        startedAt: new Date(row.startedAt).toISOString(),
      };
    }),
  };
}
