"use server";

import { db } from "@/lib/db/d1-http";
import { checkins, topups, options, temporaryBalances } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { cnDateString, shiftDateString } from "@/lib/date";

interface CheckinSettings {
  enabled: boolean;
  minQuota: number;
  maxQuota: number;
  validDays: number;
  streakEnabled: boolean;
  streakDays: number;
  streakReward: number;
}

/**
 * 获取签到配置
 */
async function getCheckinSettings(): Promise<CheckinSettings> {
  const settings = await db
    .select()
    .from(options)
    .where(
      sql`${options.key} IN ('checkin_enabled', 'checkin_min_quota', 'checkin_max_quota', 'checkin_valid_days', 'checkin_streak_enabled', 'checkin_streak_days', 'checkin_streak_reward')`
    );

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

  const streakDays = parseInt(settingsMap.get("checkin_streak_days") ?? "7");
  const streakReward = parseFloat(settingsMap.get("checkin_streak_reward") ?? "200");

  return {
    enabled: settingsMap.get("checkin_enabled") === "true",
    minQuota: parseFloat(settingsMap.get("checkin_min_quota") ?? "0.01"),
    maxQuota: parseFloat(settingsMap.get("checkin_max_quota") ?? "0.1"),
    validDays: parseInt(settingsMap.get("checkin_valid_days") ?? "7"),
    // 2026-10-29 新增：连签奖励。开关默认开启，天数/额度非法时回退默认值。
    streakEnabled: settingsMap.get("checkin_streak_enabled") !== "false",
    streakDays: Number.isFinite(streakDays) && streakDays >= 2 ? streakDays : 7,
    streakReward:
      Number.isFinite(streakReward) && streakReward >= 0 ? streakReward : 200,
  };
}

/**
 * 当前连签天数与今日是否已签。
 * 今天已签则从今天往回数，否则从昨天往回数（今天还没签不算断签）。
 * 只查最近 366 天，避免历史记录无限增长后每次加载都全表扫。
 */
async function readStreak(
  userId: string,
  today: string,
): Promise<{ streak: number; checkedToday: boolean }> {
  const rows = await db
    .select({ checkinDate: checkins.checkinDate })
    .from(checkins)
    .where(
      and(
        eq(checkins.userId, userId),
        gte(checkins.checkinDate, shiftDateString(today, -365)),
      ),
    )
    .orderBy(sql`${checkins.checkinDate} DESC`);

  const dates = new Set(rows.map((r) => r.checkinDate));
  const checkedToday = dates.has(today);

  let cursor = checkedToday ? today : shiftDateString(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDateString(cursor, -1);
  }

  return { streak, checkedToday };
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
    streakEnabled: boolean;
    streakDays: number;
    streakReward: number;
    stats: {
      totalQuota: number;
      totalCheckins: number;
      checkinCount: number;
      checkedInToday: boolean;
      streak: number;
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
          streakEnabled: settings.streakEnabled,
          streakDays: settings.streakDays,
          streakReward: settings.streakReward,
          stats: {
            totalQuota: 0,
            totalCheckins: 0,
            checkinCount: 0,
            checkedInToday: false,
            streak: 0,
            records: [],
          },
        },
      };
    }

    // 获取指定月份的签到记录
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const today = cnDateString();

    const [monthRecords, totalStats, streakState] = await Promise.all([
      db
        .select()
        .from(checkins)
        .where(
          and(
            eq(checkins.userId, userId),
            gte(checkins.checkinDate, startDate),
            lte(checkins.checkinDate, endDate)
          )
        )
        .orderBy(sql`${checkins.checkinDate} DESC`),
      db
        .select({
          count: sql<number>`COUNT(*)`,
          sum: sql<number>`COALESCE(SUM(${checkins.quotaAwarded}), 0)`,
        })
        .from(checkins)
        .where(eq(checkins.userId, userId)),
      readStreak(userId, today),
    ]);

    return {
      success: true,
      data: {
        enabled: true,
        minQuota: settings.minQuota,
        maxQuota: settings.maxQuota,
        streakEnabled: settings.streakEnabled,
        streakDays: settings.streakDays,
        streakReward: settings.streakReward,
        stats: {
          totalQuota: totalStats[0]?.sum ?? 0,
          totalCheckins: totalStats[0]?.count ?? 0,
          checkinCount: monthRecords.length,
          checkedInToday: streakState.checkedToday,
          streak: streakState.streak,
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
    baseQuota: number;
    streakBonus: number;
    streak: number;
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

    // 北京自然日（签到 / 连签都按北京时间切日）
    const today = cnDateString();
    const { streak: priorStreak, checkedToday } = await readStreak(userId, today);

    if (checkedToday) {
      return { success: false, message: "今日已签到" };
    }

    const streak = priorStreak + 1;

    // 计算随机奖励额度（支持小数）
    const range = settings.maxQuota - settings.minQuota;
    const baseQuota = settings.minQuota + Math.random() * range;

    // 连签奖励：每满 N 天在当日奖励之外额外发一次
    const streakBonus =
      settings.streakEnabled && settings.streakReward > 0 && streak % settings.streakDays === 0
        ? settings.streakReward
        : 0;
    const quotaAwarded = baseQuota + streakBonus;

    const checkinId = crypto.randomUUID();
    const now = new Date();
    // 签到奖励有效期：从配置读取
    const expiresAt = new Date(Date.now() + settings.validDays * 24 * 60 * 60 * 1000);
    const bonusText =
      streakBonus > 0
        ? `，含连签 ${streak} 天额外奖励 ${streakBonus.toFixed(2)} cr`
        : "";

    try {
      // 步骤1: 插入签到记录（UNIQUE 约束防止并发重复）
      await db.insert(checkins).values({
        id: checkinId,
        userId,
        checkinDate: today,
        quotaAwarded,
        createdAt: now,
      });

      // 步骤2: 插入临时余额
      await db.insert(temporaryBalances).values({
        id: crypto.randomUUID(),
        userId,
        amount: quotaAwarded,
        expiresAt,
        description: `每日签到奖励 ${baseQuota.toFixed(4)} cr${bonusText}（有效期 ${settings.validDays} 天）`,
        createdAt: now,
      });

      // 步骤3: 记录 topup 流水
      await db.insert(topups).values({
        id: crypto.randomUUID(),
        userId,
        amount: quotaAwarded,
        type: 3, // 签到充值
        description: `每日签到奖励 ${baseQuota.toFixed(4)} cr${bonusText}（有效期至 ${expiresAt.toLocaleDateString()}）`,
        createdAt: now,
      });

      return {
        success: true,
        data: {
          quotaAwarded,
          baseQuota,
          streakBonus,
          streak,
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
