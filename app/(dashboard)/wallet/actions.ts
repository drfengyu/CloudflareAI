"use server";

import { db } from "@/lib/db/d1-http";
import { redemptions, topups, temporaryBalances } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getEpayConfig, buildEpayPayUrl } from "@/lib/payment/epay";
import { createRechargeOrder } from "@/lib/payment/order";

export async function redeemCode(code: string) {
  const currentUserId = await requireUser();

  // 查找兑换码
  const codeRows = await db
    .select()
    .from(redemptions)
    .where(eq(redemptions.code, code.toUpperCase().trim()))
    .limit(1);

  if (!codeRows[0]) {
    throw new Error("兑换码不存在");
  }

  const redemption = codeRows[0];

  // 检查是否已使用完
  const maxUses = redemption.maxUses ?? Infinity;
  if (redemption.usedCount >= maxUses) {
    throw new Error("兑换码已用完");
  }

  // 检查兑换码本身是否过期
  if (redemption.expiresAt && new Date(redemption.expiresAt) < new Date()) {
    throw new Error("兑换码已过期");
  }

  // 计算余额过期时间
  let balanceExpiresAt: Date;
  if (redemption.balanceValidDays) {
    balanceExpiresAt = new Date(Date.now() + redemption.balanceValidDays * 24 * 60 * 60 * 1000);
  } else {
    // 默认 7 天
    balanceExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const now = new Date();

  // 插入临时余额
  await db.insert(temporaryBalances).values({
    id: crypto.randomUUID(),
    userId: currentUserId,
    amount: redemption.quota,
    expiresAt: balanceExpiresAt,
    redemptionId: redemption.id,
    description: `兑换码充值: ${code}`,
    createdAt: now,
  });

  // 更新兑换码使用次数和使用者
  await db
    .update(redemptions)
    .set({
      usedCount: redemption.usedCount + 1,
      usedUserId: currentUserId,
      redeemedAt: now,
    })
    .where(eq(redemptions.id, redemption.id));

  // 记录充值流水
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId: currentUserId,
    amount: redemption.quota,
    type: 1, // 兑换码充值
    description: `兑换码充值: ${code} (有效期至 ${balanceExpiresAt.toLocaleDateString()})`,
    redemptionId: redemption.id,
    createdAt: now,
  });

  revalidatePath("/wallet");
  return {
    success: true,
    amount: redemption.quota,
    expiresAt: balanceExpiresAt,
  };
}

/**
 * 创建在线充值订单并返回易支付收银台跳转 URL。
 * 返回 { payUrl }，客户端 window.location.href 跳转；或 { error }。
 */
export async function createPayOrder(amountCny: number, channel: string) {
  const cfg = await getEpayConfig();
  if (!cfg.enabled) {
    throw new Error("在线充值功能未开启");
  }

  const { orderNo, credits } = await createRechargeOrder(amountCny, channel);

  // 用当前请求的 host 构造回调/回跳地址（支持本地与生产）
  const host = (await headers()).get("host") || "localhost:3000";
  const protocol = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const notifyUrl = `${origin}/api/pay/epay/notify`;
  const returnUrl = `${origin}/wallet?paid=1`;

  const built = buildEpayPayUrl(
    cfg,
    { orderNo, amountCny, channel },
    notifyUrl,
    returnUrl,
  );

  if (!built) {
    throw new Error("支付网关配置不完整，请联系管理员");
  }

  return { payUrl: built.url, orderNo, credits };
}
