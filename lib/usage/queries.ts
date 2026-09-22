import { db } from "@/lib/db/d1-http";
import { usageLogs, users, apiKeys, channels, type UsageLog } from "@/lib/db/schema";
import { desc, eq, gte, lt, and, sql } from "drizzle-orm";
import type { BucketGranularity } from "@/lib/date";

/**
 * 看板统计窗口：左闭右开 [start, end)。
 * 由调用方（页面）算好传入，查询层不碰时钟，也不再用「N 天」这种含今天的相对口径。
 */
export interface UsageWindow {
  start: Date;
  end: Date;
}

const EMPTY_SUMMARY = {
  totalCalls: 0,
  successCalls: 0,
  errorCalls: 0,
  totalCredits: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  avgLatencyMs: null as number | null,
};

/**
 * 窗口内的用量汇总（Phase C: credits 模型）。
 * 平均延迟只统计 >0 的记录，避免 0 值把均值拉低。
 */
export async function getUsageSummary(userId: string, win: UsageWindow) {
  const rows = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      successCalls: sql<number>`COALESCE(SUM(CASE WHEN ${usageLogs.status} = 'ok' THEN 1 ELSE 0 END), 0)`,
      errorCalls: sql<number>`COALESCE(SUM(CASE WHEN ${usageLogs.status} = 'error' THEN 1 ELSE 0 END), 0)`,
      totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${usageLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${usageLogs.outputTokens}), 0)`,
      avgLatencyMs: sql<number | null>`AVG(CASE WHEN ${usageLogs.latencyMs} > 0 THEN ${usageLogs.latencyMs} END)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, win.start),
        lt(usageLogs.createdAt, win.end),
      ),
    );

  return rows[0] || EMPTY_SUMMARY;
}

/** 历史累计消耗（刻意不受看板时间窗口影响——「历史消耗」就该是全生命周期）。 */
export async function getLifetimeUsage(userId: string) {
  const rows = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(eq(usageLogs.userId, userId));

  return rows[0] || { totalCalls: 0, totalCredits: 0 };
}

/** 获取用户余额（Phase C: credits 模型，取代旧的 quota） */
export async function getUserBalance(userId: string) {
  const rows = await db
    .select({ balanceCredits: users.balanceCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.balanceCredits ?? 0;
}

/**
 * 按模型统计用量（Phase C: 用于柱状图 / 排行表）。
 * `orderBy` 决定 Top 10 的取法——按消耗取的前十和按次数取的前十不是同一批模型。
 */
export async function getUsageByModel(
  userId: string,
  win: UsageWindow,
  orderBy: "credits" | "calls" = "credits",
) {
  const orderExpr =
    orderBy === "calls"
      ? sql`COUNT(*)`
      : sql`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`;

  const rows = await db
    .select({
      model: usageLogs.model,
      calls: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, win.start),
        lt(usageLogs.createdAt, win.end),
      ),
    )
    .groupBy(usageLogs.model)
    .orderBy(desc(orderExpr))
    .limit(10);

  return rows;
}

/** 按渠道统计用量（渠道分布饼图） */
export async function getUsageByChannel(userId: string, win: UsageWindow) {
  const rows = await db
    .select({
      channelId: usageLogs.channelId,
      channel: usageLogs.channel,
      channelName: channels.name,
      calls: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .leftJoin(channels, eq(usageLogs.channelId, channels.id))
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, win.start),
        lt(usageLogs.createdAt, win.end),
      ),
    )
    .groupBy(usageLogs.channelId)
    .orderBy(desc(sql`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`))
    .limit(8);

  return rows.map((r) => {
    const name =
      r.channelName ??
      (r.channel === "web"
        ? "站内 Playground"
        : r.channel === "openai"
          ? "OpenAI 客户端"
          : r.channel === "anthropic"
            ? "Anthropic 客户端"
            : "未绑定渠道");
    return {
      channelId: r.channelId,
      name,
      calls: r.calls,
      credits: r.credits,
    };
  });
}

/**
 * 按小时 / 按天聚合用量趋势（「消耗分布」与「调用趋势」两条线共用一次查询）。
 * 桶键按北京时间：按天 `YYYY-MM-DD`，按小时 `YYYY-MM-DD HH:00`，
 * 与 `cnBucketKeys` 生成的键一致，页面据此把稀疏结果补零成连续曲线。
 */
export async function getUsageTrend(
  userId: string,
  win: UsageWindow,
  granularity: BucketGranularity,
) {
  const bucket =
    granularity === "day"
      ? sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours')`
      : sql`strftime('%Y-%m-%d %H:00', ${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours')`;

  return db
    .select({
      bucket: sql<string>`${bucket}`,
      calls: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, win.start),
        lt(usageLogs.createdAt, win.end),
      ),
    )
    .groupBy(bucket)
    .orderBy(sql`${bucket} ASC`);
}

/** 分页查询用量记录（历史页） */
export async function queryUsage(input: {
  userId: string;
  page?: number;
  pageSize?: number;
  model?: string;
  task?: string;
}): Promise<{ logs: (UsageLog & { apiKeyName?: string | null })[]; total: number }> {
  const { userId, page = 1, pageSize = 20, model, task } = input;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(usageLogs.userId, userId)];
  if (model) conditions.push(eq(usageLogs.model, model));
  if (task) conditions.push(eq(usageLogs.task, task));

  const where = and(...conditions);

  const [logs, countResult] = await Promise.all([
    db
      .select({
        id: usageLogs.id,
        userId: usageLogs.userId,
        apiKeyId: usageLogs.apiKeyId,
        model: usageLogs.model,
        task: usageLogs.task,
        source: usageLogs.source,
        channel: usageLogs.channel,
        channelId: usageLogs.channelId,
        inputTokens: usageLogs.inputTokens,
        outputTokens: usageLogs.outputTokens,
        neurons: usageLogs.neurons,
        creditsUsed: usageLogs.creditsUsed,
        costUsd: usageLogs.costUsd,
        status: usageLogs.status,
        errorReason: usageLogs.errorReason,
        latencyMs: usageLogs.latencyMs,
        createdAt: usageLogs.createdAt,
        apiKeyName: apiKeys.name,
      })
      .from(usageLogs)
      .leftJoin(apiKeys, eq(usageLogs.apiKeyId, apiKeys.id))
      .where(where)
      .orderBy(desc(usageLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(usageLogs)
      .where(where),
  ]);

  return { logs, total: countResult[0]?.count || 0 };
}
