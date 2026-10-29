/**
 * 钱包「充值记录」的可见性条件（含 userId 与起始时间）。
 *
 * 活动（抽奖）流水 type=6 整类不进钱包：买券/倒扣属于活动账目，中奖发放另有
 * 「我的活动记录」可查。剩下的发放里只有兑换码(type=1)与签到(type=3)会过期，
 * 管理员充值(type=2)、在线充值(type=5)等是永久余额，一律保留。
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
import { TOPUP_PAGE_SIZE, serializeTopup } from "@/lib/billing/topup-view";
import { desc, eq, sql, type SQL } from "drizzle-orm";

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

export async function walletTopupWhere(
  userId: string,
  since: Date,
  now: Date,
): Promise<SQL> {
  const checkinValidDays = await readValidDaysOption("checkin_valid_days");

  const redemptionValidDays = sql`COALESCE((SELECT ${redemptions.balanceValidDays} FROM ${redemptions} WHERE ${redemptions.id} = ${topups.redemptionId}), ${DEFAULT_VALID_DAYS})`;
  const validDays = sql`CASE ${topups.type} WHEN 1 THEN ${redemptionValidDays} ELSE ${checkinValidDays} END`;

  return sql`${topups.userId} = ${userId} AND ${topups.type} <> 6 AND ${topups.createdAt} >= ${since.getTime()} AND (${topups.type} NOT IN (1, 3) OR ${topups.createdAt} > ${now.getTime()} - ${DAY_MS} * ${validDays})`;
}

/**
 * 按可见性条件读取一页充值流水。多取一条探测是否还有下一页，省一次 COUNT。
 * 首屏由 wallet 页取第 1 页，卡片内翻页由 `listMyTopups` 复用同一入口。
 */
export async function listWalletTopupPage(where: SQL, page: number) {
  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);

  const rows = await db
    .select()
    .from(topups)
    .where(where)
    .orderBy(desc(topups.createdAt))
    .limit(TOPUP_PAGE_SIZE + 1)
    .offset((safePage - 1) * TOPUP_PAGE_SIZE);

  return {
    records: rows.slice(0, TOPUP_PAGE_SIZE).map(serializeTopup),
    hasNext: rows.length > TOPUP_PAGE_SIZE,
  };
}
