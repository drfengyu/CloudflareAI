import { db } from "@/lib/db/d1-http";
import { paymentOrders, topups, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { getEpayConfig, type EpayConfig } from "./epay";

/**
 * 支付订单：创建 / 查询 / 支付后发放余额。
 * 易支付异步回调通知 → 验签 → 发放（写永久余额 + topup 流水 type=5）。
 */

export const PAY_STATUS = {
  PENDING: 0,
  PAID: 1,
  COMPLETED: 2,
  CLOSED: 3,
  ERROR: 9,
} as const;

/** 生成商户订单号：TU + 时间戳 + 随机。 */
export function generateOrderNo(): string {
  const ts = Date.now().toString();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TU${ts}${rand}`;
}

/** 校验充值金额是否在合法范围（按配置）。 */
export async function validateRechargeAmount(amountCny: number): Promise<{
  ok: boolean;
  reason?: string;
  rate?: number;
}> {
  const cfg = await getEpayConfig();
  if (!cfg.enabled) return { ok: false, reason: "在线充值功能未开启" };
  if (!Number.isFinite(amountCny) || amountCny <= 0) {
    return { ok: false, reason: "金额无效" };
  }
  if (amountCny < cfg.minCny) {
    return { ok: false, reason: `单笔最低充值 ¥${cfg.minCny}` };
  }
  if (amountCny > cfg.maxCny) {
    return { ok: false, reason: `单笔最高充值 ¥${cfg.maxCny}` };
  }
  return { ok: true, rate: cfg.rate };
}

/** 创建充值订单（未支付）。 */
export async function createRechargeOrder(
  amountCny: number,
  channel: string,
): Promise<{ orderId: string; orderNo: string; credits: number }> {
  const userId = await requireUser();
  const check = await validateRechargeAmount(amountCny);
  if (!check.ok || check.rate === undefined) {
    throw new Error(check.reason ?? "充值金额校验失败");
  }

  // 金额保留 2 位小数，credits 按汇率锁定（向下取整 2 位）
  const amount = Math.round(amountCny * 100) / 100;
  const credits = Math.floor(amount * check.rate * 100) / 100;
  const orderNo = generateOrderNo();

  await db.insert(paymentOrders).values({
    id: crypto.randomUUID(),
    userId,
    orderNo,
    amountCny: amount,
    credits,
    status: PAY_STATUS.PENDING,
    channel,
    createdAt: new Date(),
  });

  return { orderId: orderNo, orderNo, credits };
}

/** 查询订单（按商户订单号）。 */
export async function getOrderByNo(orderNo: string) {
  const rows = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.orderNo, orderNo))
    .limit(1);
  return rows[0] ?? null;
}

/** 按订单号查用户当前余额（回调发放后校验用）。 */
export async function getUserBalanceForOrder(orderNo: string): Promise<number | null> {
  const order = await getOrderByNo(orderNo);
  if (!order) return null;
  const rows = await db
    .select({ balanceCredits: users.balanceCredits })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);
  return rows[0]?.balanceCredits ?? null;
}

/**
 * 支付成功 → 发放余额（幂等）。
 * 幂等方案：UPDATE ... WHERE orderNo=? AND status=0（D1 单条 SQL 原子）。
 * 随后回查：若 tradeNo 等于本次回调的 tradeNo，说明本回调抢占了该订单，执行发放；
 * 若 tradeNo 是别的值，说明已有其他回调处理过，直接跳过。
 */
export async function settleRechargeOrder(
  orderNo: string,
  tradeNo: string,
  notifyPayload: Record<string, unknown>,
): Promise<{ settled: boolean; orderId?: string; credits?: number; userId?: string }> {
  // 1. 原子抢占：仅当订单仍为「待支付」时置为「已支付」
  await db
    .update(paymentOrders)
    .set({
      status: PAY_STATUS.PAID,
      tradeNo,
      notifyPayload: JSON.stringify(notifyPayload),
      paidAt: new Date(),
    })
    .where(and(eq(paymentOrders.orderNo, orderNo), eq(paymentOrders.status, PAY_STATUS.PENDING)));

  // 2. 回查：判断本次回调是否抢占了订单
  const order = await getOrderByNo(orderNo);
  if (!order) return { settled: false };
  if (order.tradeNo !== tradeNo) {
    // 已被其他回调/渠道处理
    return { settled: false, orderId: order.id, credits: order.credits, userId: order.userId };
  }
  if (order.status !== PAY_STATUS.PAID) {
    // 已发放完成（status=2）：本次是发放中断后的重试回调，跳过
    return { settled: false, orderId: order.id, credits: order.credits, userId: order.userId };
  }

  // 3. 写入永久余额
  await db
    .update(users)
    .set({
      balanceCredits: sql`${users.balanceCredits} + ${order.credits}`,
    })
    .where(eq(users.id, order.userId));

  // 4. 记充值流水（type=5 在线充值）
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId: order.userId,
    amount: order.credits,
    type: 5,
    description: `在线充值 ¥${order.amountCny}（订单 ${orderNo}）`,
    createdAt: new Date(),
  });

  // 5. 完成订单
  await db
    .update(paymentOrders)
    .set({ status: PAY_STATUS.COMPLETED })
    .where(eq(paymentOrders.orderNo, orderNo));

  return { settled: true, orderId: order.id, credits: order.credits, userId: order.userId };
}

/** 关闭订单（超时/手动）。 */
export async function closeOrder(orderNo: string): Promise<void> {
  await db
    .update(paymentOrders)
    .set({ status: PAY_STATUS.CLOSED })
    .where(and(eq(paymentOrders.orderNo, orderNo), eq(paymentOrders.status, PAY_STATUS.PENDING)));
}
