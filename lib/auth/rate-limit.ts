import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { registrationLog } from "@/lib/db/schema";

/**
 * 检查 IP 注册频率限制
 * @param ip - IP 地址
 * @param windowHours - 时间窗口（小时），默认 24 小时
 * @param maxCount - 最大注册次数，默认 3 次
 * @returns true 表示未达到限制，可以注册；false 表示已达限制
 */
export async function checkIPRegistrationLimit(
  ip: string,
  windowHours: number = 24,
  maxCount: number = 3
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowHours * 60 * 60 * 1000;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(registrationLog)
    .where(
      and(
        eq(registrationLog.ip, ip),
        gte(registrationLog.createdAt, new Date(windowStart))
      )
    );

  const count = result[0]?.count ?? 0;
  return count < maxCount;
}

/**
 * 记录注册日志
 * @param ip - IP 地址
 * @param email - 邮箱地址
 * @param userAgent - 用户代理字符串
 */
export async function logRegistration(
  ip: string,
  email: string,
  userAgent: string
): Promise<void> {
  await db.insert(registrationLog).values({
    id: crypto.randomUUID(),
    ip,
    email,
    createdAt: new Date(),
    userAgent,
  });
}

/**
 * 获取 IP 最近的注册次数（用于错误提示）
 * @param ip - IP 地址
 * @param windowHours - 时间窗口（小时）
 * @returns 注册次数
 */
export async function getIPRegistrationCount(
  ip: string,
  windowHours: number = 24
): Promise<number> {
  const now = Date.now();
  const windowStart = now - windowHours * 60 * 60 * 1000;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(registrationLog)
    .where(
      and(
        eq(registrationLog.ip, ip),
        gte(registrationLog.createdAt, new Date(windowStart))
      )
    );

  return result[0]?.count ?? 0;
}
