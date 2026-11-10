import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { topups } from "@/lib/db/schema";
import { COUPON_TOPUP_TYPE } from "@/lib/activity/coupons";
import { TOPUP_TYPE_LOTTERY } from "@/lib/lottery/prize-math";
import { TOPUP_TYPE_RAIDEN } from "@/lib/raiden/config";
import { TOPUP_TYPE_FLIP } from "@/lib/flip/config";

/**
 * 限时活动的账本类型：6/11/12 是历史玩法流水（v0.33.0 之前的直付），
 * v0.33.0 起玩法只扣活动券，货币支出统一记在 type=15 的兑换/礼包流水上。
 */
const ACTIVITIES = [
  { type: TOPUP_TYPE_LOTTERY, name: "幸运转盘" },
  { type: TOPUP_TYPE_RAIDEN, name: "雷电行动" },
  { type: TOPUP_TYPE_FLIP, name: "翻牌夺宝" },
  { type: COUPON_TOPUP_TYPE, name: "活动券兑换" },
] as const;

export interface ActivitySpendPoint {
  name: string;
  /** 这段时间为该活动花掉的 cr（买券 / 装备复活 / 票价），恒为非负。 */
  spent: number;
  /** 从该活动拿到的 cr（中奖 / 通关奖励），恒为非负。 */
  earned: number;
  /** 玩家视角净收支：`earned − spent`，为负就是这一段时间玩亏了。 */
  net: number;
}

const spentExpr = sql`COALESCE(SUM(CASE WHEN ${topups.amount} < 0 THEN -${topups.amount} ELSE 0 END), 0)`;
const earnedExpr = sql`COALESCE(SUM(CASE WHEN ${topups.amount} > 0 THEN ${topups.amount} ELSE 0 END), 0)`;

/**
 * 某个用户在时间窗内、三个限时活动各自的消耗与回报。
 *
 * 一条聚合拿齐，不按活动各查一次；口径直接读账本，这样每个玩法的扣费与发奖改动都会自动反映到图上，
 * 不需要三处各自维护一份「怎么算消耗」。D1 不接受带聚合的 ORDER BY，所以补零与排序都放在 JS 里。
 */
export async function getActivitySpend(
  userId: string,
  win: { start: Date; end: Date },
): Promise<ActivitySpendPoint[]> {
  const rows = await db
    .select({ type: topups.type, spent: spentExpr, earned: earnedExpr })
    .from(topups)
    .where(
      and(
        eq(topups.userId, userId),
        inArray(topups.type, ACTIVITIES.map((a) => a.type)),
        gte(topups.createdAt, win.start),
        lt(topups.createdAt, win.end),
      ),
    )
    .groupBy(topups.type);

  const byType = new Map(rows.map((row) => [Number(row.type), row]));
  return ACTIVITIES.map(({ type, name }) => {
    const row = byType.get(type);
    const spent = Number(row?.spent ?? 0);
    const earned = Number(row?.earned ?? 0);
    return { name, spent, earned, net: Math.round((earned - spent) * 100) / 100 };
  });
}
