/**
 * 充值流水里「一次性临时发放」的到期推算，用于钱包页展示过滤。
 *
 * 不能用「对应的 temporary_balance 行还在不在」判断是否过期：消费会删除/扣减
 * 临时余额行（`lib/usage/meter.ts`），当天就被花掉的奖励会立刻从流水里消失。
 * 这里按发放时刻 + 当时的有效天数推算到期时间，与发放时写入的 `expiresAt` 同口径。
 */

import { db } from "@/lib/db/d1-http";
import { options, redemptions } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `topup.type`：1=兑换码、3=签到奖励，两者发的都是会过期的临时余额。 */
const TYPE_REDEEM_CODE = 1;
const TYPE_CHECKIN = 3;

/**
 * 未配置有效天数时的默认值。兑换码走 `wallet/actions.ts` 的「null → 7 天」分支
 * （注意 `schema.ts` 里 `balanceValidDays` 的注释写的是「null = 永久有效」，与
 * 该实现不一致，以实现为准），签到走 `checkin_valid_days` 缺省值。
 */
const DEFAULT_VALID_DAYS = 7;

interface GrantTopupRow {
  type: number;
  createdAt: Date | null;
  redemptionId: string | null;
}

async function readValidDaysOption(key: string): Promise<number> {
  const [row] = await db
    .select({ value: options.value })
    .from(options)
    .where(eq(options.key, key))
    .limit(1);

  const days = parseInt(row?.value ?? "", 10);
  return Number.isFinite(days) && days >= 1 ? days : DEFAULT_VALID_DAYS;
}

/** 过滤掉发放的临时余额已过期的流水行；永久余额型发放（管理员调整、在线充值）不受影响。 */
export async function withoutExpiredGrants<T extends GrantTopupRow>(
  rows: T[],
  now: Date = new Date(),
): Promise<T[]> {
  const grantableRows = rows.filter(
    (row) => row.type === TYPE_REDEEM_CODE || row.type === TYPE_CHECKIN,
  );
  if (grantableRows.length === 0) {
    return rows;
  }

  const checkinValidDays = await readValidDaysOption("checkin_valid_days");

  const redemptionIds = [
    ...new Set(
      grantableRows
        .map((row) => (row.type === TYPE_REDEEM_CODE ? row.redemptionId : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const redemptionRows =
    redemptionIds.length > 0
      ? await db
          .select({
            id: redemptions.id,
            balanceValidDays: redemptions.balanceValidDays,
          })
          .from(redemptions)
          .where(inArray(redemptions.id, redemptionIds))
      : [];
  const validDaysByRedemption = new Map(
    redemptionRows.map((row) => [row.id, row.balanceValidDays ?? DEFAULT_VALID_DAYS]),
  );

  const nowMs = now.getTime();
  return rows.filter((row) => {
    if (row.type !== TYPE_REDEEM_CODE && row.type !== TYPE_CHECKIN) {
      return true;
    }
    if (!row.createdAt) {
      return true;
    }
    const validDays =
      row.type === TYPE_CHECKIN
        ? checkinValidDays
        : validDaysByRedemption.get(row.redemptionId ?? "") ?? DEFAULT_VALID_DAYS;
    return row.createdAt.getTime() + validDays * DAY_MS > nowMs;
  });
}
