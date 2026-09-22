import { db } from "@/lib/db/d1-http";
import { usageLogs, users, apiKeys, channels, type UsageLog } from "@/lib/db/schema";
import { desc, eq, gte, and, sql } from "drizzle-orm";
import { cnStartOfToday, cnLastNDaysStart } from "@/lib/date";

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
 * 时间窗口内的用量汇总（Phase C: credits 模型；下界由调用方给出，一律北京时区日界）。
 * 平均延迟只统计 >0 的记录，避免 0 值把均值拉低。
 */
export async function getUsageSummary(userId: string, since: Date) {
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
        gte(usageLogs.createdAt, since),
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
 * 按模型统计用量（Phase C: 用于饼图/柱状图；含今天在内的 days 个北京日历日）。
 * `orderBy` 决定 Top 10 的取法——按消耗取的前十和按次数取的前十不是同一批模型。
 */
export async function getUsageByModel(
  userId: string,
  days = 30,
  orderBy: "credits" | "calls" = "credits",
) {
  const startDate = cnLastNDaysStart(days);
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
        gte(usageLogs.createdAt, startDate),
      ),
    )
    .groupBy(usageLogs.model)
    .orderBy(desc(orderExpr))
    .limit(10);

  return rows;
}

/** 按渠道统计用量（渠道分布饼图；含今天在内的 days 个北京日历日） */
export async function getUsageByChannel(userId: string, days = 30) {
  const startDate = cnLastNDaysStart(days);

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
        gte(usageLogs.createdAt, startDate),
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

/** 按日统计用量（Phase C: 用于趋势图；日期按中国时区，含今天在内的 days 个日历日） */
export async function getDailyUsage(userId: string, days = 7) {
  const startDate = cnLastNDaysStart(days);

  const rows = await db
    .select({
      date: sql<string>`DATE(${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours')`,
      calls: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, startDate),
      ),
    )
    .groupBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours')`)
    .orderBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours') ASC`);

  return rows;
}

/** 按小时统计今日用量（Phase C 扩展：当天小时趋势图；按中国时区） */
export async function getHourlyUsageToday(userId: string) {
  const todayStart = cnStartOfToday();

  const rows = await db
    .select({
      hour: sql<number>`CAST(strftime('%H', ${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours') AS INTEGER)`,
      calls: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, todayStart),
      ),
    )
    .groupBy(sql`CAST(strftime('%H', ${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours') AS INTEGER)`)
    .orderBy(sql`CAST(strftime('%H', ${usageLogs.createdAt} / 1000, 'unixepoch', '+8 hours') AS INTEGER) ASC`);

  return rows;
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
