/**
 * 钱包「充值记录」里的一次性临时发放到期过滤。
 *
 * 不能用「对应的 temporary_balance 行还在不在」判断是否过期：消费会删除/扣减
 * 临时余额行（`lib/usage/meter.ts`），当天就被花掉的奖励会立刻从流水里消失。
 * 这里按发放时刻 + 当时的有效天数推算到期时间，与发放时写入的 `expiresAt` 同口径。
 *
 * 过滤下沉到 SQL：分页的 LIMIT/OFFSET 要作用在「可见行」上，若先取一页再在内存里
 * 剔除过期行，每页会不满 10 条。
 */

import { db } from "@/lib/db/d1-http";
import { options, redemptions, topups } from "@/lib/db/schema";
import { LOTTERY_CONFIG_KEY } from "@/lib/lottery/prize-math";
import { eq, sql, type SQL } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 未配置有效天数时的默认值。兑换码走 `wallet/actions.ts` 的「null → 7 天」分支
 * （注意 `schema.ts` 里 `balanceValidDays` 的注释写的是「null = 永久有效」，与
 * 该实现不一致，以实现为准），签到走 `checkin_valid_days` 缺省值。
 */
const DEFAULT_VALID_DAYS = 7;

async function readValidDaysOption(key: string): Promise<number> {
  const [row] = await db
    .select({ value: options.value })
    .from(options)
    .where(eq(options.key, key))
    .limit(1);

  const days = parseInt(row?.value ?? "", 10);
  return Number.isFinite(days) && days >= 1 ? days : DEFAULT_VALID_DAYS;
}

/**
 * 抽奖中奖的有效天数取自 `lottery_config.prizeValidDays`。
 * 与签到同一口径：按「发放时刻 + 当时的配置值」推算，管理员事后改配置不影响已发奖励的显示判定。
 */
async function readLotteryPrizeValidDays(): Promise<number> {
  const [row] = await db
    .select({ value: options.value })
    .from(options)
    .where(eq(options.key, LOTTERY_CONFIG_KEY))
    .limit(1);
  try {
    const parsed = JSON.parse(String(row?.value)) as { prizeValidDays?: unknown };
    const days = Number(parsed?.prizeValidDays);
    return Number.isFinite(days) && days >= 1 ? Math.trunc(days) : DEFAULT_VALID_DAYS;
  } catch {
    return DEFAULT_VALID_DAYS;
  }
}

/**
 * 生成「只看未过期发放」的 WHERE 条件（已含 userId 与起始时间）。
 *
 * 会过期的只有发放行：兑换码、签到、抽奖中奖（type=6 的正数）。抽奖的倒扣与买券
 * 是负数流水，管理员调整与在线充值是永久余额，它们一律保留。
 */
export async function visibleTopupWhere(
  userId: string,
  since: Date,
  now: Date,
): Promise<SQL> {
  const [checkinValidDays, lotteryValidDays] = await Promise.all([
    readValidDaysOption("checkin_valid_days"),
    readLotteryPrizeValidDays(),
  ]);

  const isGrant = sql`(${topups.type} IN (1, 3) OR (${topups.type} = 6 AND ${topups.amount} > 0))`;
  const redemptionValidDays = sql`COALESCE((SELECT ${redemptions.balanceValidDays} FROM ${redemptions} WHERE ${redemptions.id} = ${topups.redemptionId}), ${DEFAULT_VALID_DAYS})`;
  const validDays = sql`CASE ${topups.type} WHEN 1 THEN ${redemptionValidDays} WHEN 3 THEN ${checkinValidDays} ELSE ${lotteryValidDays} END`;

  return sql`${topups.userId} = ${userId} AND ${topups.createdAt} >= ${since.getTime()} AND (NOT ${isGrant} OR ${topups.createdAt} > ${now.getTime()} - ${DAY_MS} * ${validDays})`;
}
