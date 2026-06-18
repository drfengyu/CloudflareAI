import { db } from "@/lib/db/d1-http";
import { usageLogs, users, apiKeys, type UsageLog } from "@/lib/db/schema";
import { desc, eq, gte, and, sql } from "drizzle-orm";

/** 获取用户今日用量统计（Phase C: credits 模型） */
export async function getTodayUsage(userId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${usageLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${usageLogs.outputTokens}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, todayStart),
      ),
    );

  return rows[0] || { totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 };
}

/** 获取用户本月用量统计（Phase C: credits 模型） */
export async function getMonthUsage(userId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${usageLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${usageLogs.outputTokens}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, monthStart),
      ),
    );

  return rows[0] || { totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 };
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

/** 获取最近 N 条用量记录 */
export async function getRecentUsage(
  userId: string,
  limit = 10,
): Promise<(UsageLog & { apiKeyName?: string | null })[]> {
  return db
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
    .where(eq(usageLogs.userId, userId))
    .orderBy(desc(usageLogs.createdAt))
    .limit(limit);
}

/** 按模型统计用量（Phase C: 用于饼图/柱状图） */
export async function getUsageByModel(userId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

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
    .orderBy(desc(sql`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`))
    .limit(10);

  return rows;
}

/** 按日统计用量（Phase C: 用于趋势图） */
export async function getDailyUsage(userId: string, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`,
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
    .groupBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch') ASC`);

  return rows;
}

/** 按小时统计今日用量（Phase C 扩展：用于当天小时趋势图） */
export async function getHourlyUsageToday(userId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      hour: sql<number>`CAST(strftime('%H', ${usageLogs.createdAt} / 1000, 'unixepoch', 'localtime') AS INTEGER)`,
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
    .groupBy(sql`CAST(strftime('%H', ${usageLogs.createdAt} / 1000, 'unixepoch', 'localtime') AS INTEGER)`)
    .orderBy(sql`CAST(strftime('%H', ${usageLogs.createdAt} / 1000, 'unixepoch', 'localtime') AS INTEGER) ASC`);

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
