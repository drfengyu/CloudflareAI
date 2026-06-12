import { db } from "@/lib/db/d1-http";
import { usageLogs, quotas, type UsageLog } from "@/lib/db/schema";
import { desc, eq, gte, and, sql } from "drizzle-orm";

/** 获取用户今日用量统计 */
export async function getTodayUsage(userId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalNeurons: sql<number>`COALESCE(SUM(${usageLogs.neurons}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, todayStart),
      ),
    );

  return rows[0] || { totalCalls: 0, totalNeurons: 0, totalCost: 0 };
}

/** 获取用户本月用量统计 */
export async function getMonthUsage(userId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalNeurons: sql<number>`COALESCE(SUM(${usageLogs.neurons}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, monthStart),
      ),
    );

  return rows[0] || { totalCalls: 0, totalNeurons: 0, totalCost: 0 };
}

/** 获取用户配额 */
export async function getUserQuota(userId: string) {
  const rows = await db
    .select()
    .from(quotas)
    .where(eq(quotas.userId, userId))
    .limit(1);

  return (
    rows[0] || {
      userId,
      dailyNeuronLimit: 10_000,
      monthlyNeuronLimit: null,
    }
  );
}

/** 获取最近 N 条用量记录 */
export async function getRecentUsage(
  userId: string,
  limit = 10,
): Promise<UsageLog[]> {
  return db
    .select()
    .from(usageLogs)
    .where(eq(usageLogs.userId, userId))
    .orderBy(desc(usageLogs.createdAt))
    .limit(limit);
}

/** 分页查询用量记录（历史页） */
export async function queryUsage(input: {
  userId: string;
  page?: number;
  pageSize?: number;
  model?: string;
  task?: string;
}): Promise<{ logs: UsageLog[]; total: number }> {
  const { userId, page = 1, pageSize = 20, model, task } = input;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(usageLogs.userId, userId)];
  if (model) conditions.push(eq(usageLogs.model, model));
  if (task) conditions.push(eq(usageLogs.task, task));

  const where = and(...conditions);

  const [logs, countResult] = await Promise.all([
    db
      .select()
      .from(usageLogs)
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
