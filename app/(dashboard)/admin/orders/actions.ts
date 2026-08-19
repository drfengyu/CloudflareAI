"use server";

import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";
import { closeOrder, reconcileOrder } from "@/lib/payment/order";

async function assertAdmin(): Promise<string> {
  const currentUserId = await requireUser();
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);
  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }
  return currentUserId;
}

/** 管理端手动对账（查询易支付真实状态 + 补发）。 */
export async function adminReconcileOrder(orderNo: string) {
  await assertAdmin();
  const result = await reconcileOrder(orderNo);
  revalidatePath("/admin/orders");
  if (!result.reconciled) {
    throw new Error(result.reason ?? "对账失败");
  }
  return { success: true, orderStatus: result.orderStatus };
}

/** 管理端手动关闭待支付订单。 */
export async function adminCloseOrder(orderNo: string) {
  await assertAdmin();
  await closeOrder(orderNo);
  revalidatePath("/admin/orders");
  return { success: true };
}
