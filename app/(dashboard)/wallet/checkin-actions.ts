"use server";

import { db } from "@/lib/db/d1-http";
import { checkins, users, topups, options } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * 获取签到配置
 */
async function getCheckinSettings(): Promise<{
  enabled: boolean;
  minQuota: number;
  maxQuota: number;
}> {
  const settings = await db
    .select()
    .from(options)
    .where(
      sql`${options.key} IN ('checkin_enabled', 'checkin_min_quota', 'checkin_max_quota')`
    );

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

  return {
    enabled: settingsMap.get("checkin_enabled") === "true",
    minQuota: parseInt(settingsMap.get("checkin_min_quota") ?? "10"),
    maxQuota: parseInt(settingsMap.get("checkin_max_quota") ?? "100"),
  };
}

/**
 * 获取签到状态和历史记录
 */
export async function getCheckinStatus(month: string): Promise<{
  success: boolean;
  data?: {
    enabled: boolean;
    minQuota: number;
    maxQuota: number;
    stats: {
      totalQuota: number;
      totalCheckins: number;
      checkinCount: number;
      checkedInToday: boolean;
      records: Array<{
        checkinDate: string;
        quotaAwarded: number;
      }>;
    };
  };
  message?: string;
}> {
  try {
    const userId = await requireUser();
    const settings = await getCheckinSettings();

    if (!settings.enabled) {
      return {
        success: true,
        data: {
          enabled: false,
          minQuota: settings.minQuota,
          maxQuota: settings.maxQuota,
          stats: {
            totalQuota: 0,
            totalCheckins: 0,
            checkinCount: 0,
            checkedInToday: false,
            records: [],
          },
        },
      };
    }

    // 获取指定月份的签到记录
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const monthRecords = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.userId, userId),
          gte(checkins.checkinDate, startDate),
          lte(checkins.checkinDate, endDate)
        )
      )
      .orderBy(sql`${checkins.checkinDate} DESC`);

    // 检查今天是否已签到
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const checkedToday = monthRecords.some((r) => r.checkinDate === today);

    // 获取累计统计
    const totalStats = await db
      .select({
        count: sql<number>`COUNT(*)`,
        sum: sql<number>`COALESCE(SUM(${checkins.quotaAwarded}), 0)`,
      })
      .from(checkins)
      .where(eq(checkins.userId, userId));

    return {
      success: true,
      data: {
        enabled: true,
        minQuota: settings.minQuota,
        maxQuota: settings.maxQuota,
        stats: {
          totalQuota: totalStats[0]?.sum ?? 0,
          totalCheckins: totalStats[0]?.count ?? 0,
          checkinCount: monthRecords.length,
          checkedInToday: checkedToday,
          records: monthRecords.map((r) => ({
            checkinDate: r.checkinDate,
            quotaAwarded: r.quotaAwarded,
          })),
        },
      },
    };
  } catch (error) {
    console.error("[getCheckinStatus] Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "获取签到状态失败",
    };
  }
}

/**
 * 执行签到
 */
export async function performCheckin(): Promise<{
  success: boolean;
  data?: {
    quotaAwarded: number;
    checkinDate: string;
  };
  message?: string;
}> {
  try {
    const userId = await requireUser();
    const settings = await getCheckinSettings();

    if (!settings.enabled) {
      return { success: false, message: "签到功能未启用" };
    }

    // 检查今天是否已签到
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const existingCheckin = await db
      .select()
      .from(checkins)
      .where(and(eq(checkins.userId, userId), eq(checkins.checkinDate, today)))
      .limit(1);

    if (existingCheckin[0]) {
      return { success: false, message: "今日已签到" };
    }

    // 计算随机奖励额度
    const quotaAwarded =
      settings.minQuota +
      Math.floor(Math.random() * (settings.maxQuota - settings.minQuota + 1));

    const checkinId = crypto.randomUUID();
    const now = new Date();

    try {
      // 步骤1: 插入签到记录（UNIQUE 约束防止并发重复）
      await db.insert(checkins).values({
        id: checkinId,
        userId,
        checkinDate: today,
        quotaAwarded,
        createdAt: now,
      });

      // 步骤2: 增加用户余额
      await db
        .update(users)
        .set({
          balanceCredits: sql`${users.balanceCredits} + ${quotaAwarded}`,
        })
        .where(eq(users.id, userId));

      // 步骤3: 记录 topup 流水
      await db.insert(topups).values({
        id: crypto.randomUUID(),
        userId,
        amount: quotaAwarded,
        type: 3, // 签到充值
        description: `每日签到奖励 ${quotaAwarded} cr`,
        createdAt: now,
      });

      return {
        success: true,
        data: {
          quotaAwarded,
          checkinDate: today,
        },
        message: "签到成功",
      };
    } catch (error) {
      // 如果增加余额或记录流水失败，回滚签到记录
      try {
        await db.delete(checkins).where(eq(checkins.id, checkinId));
      } catch (rollbackError) {
        console.error("[performCheckin] Rollback failed:", rollbackError);
      }
      throw error;
    }
  } catch (error) {
    console.error("[performCheckin] Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "签到失败",
    };
  }
}
