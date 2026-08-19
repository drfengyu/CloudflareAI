import { db } from "@/lib/db/d1-http";
import { paymentOrders } from "@/lib/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { reconcileOrder } from "@/lib/payment/order";
import { PAY_STATUS } from "@/lib/payment/order";

/**
 * 定期对账：服务端主动查询易支付真实订单状态。
 * - 超时待支付订单 → 逐笔对账（回调丢失时兜底到账）
 * - 超过 maxAge 仍未支付的 → 关闭
 *
 * 触发方式：
 * 1. Vercel Cron Job（生产环境）
 * 2. 手动调用：curl https://your-domain.com/api/cron/reconcile-orders?ageMinutes=30
 *
 * 配置：vercel.json
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const ageMinutes = Math.max(5, Number(url.searchParams.get("ageMinutes")) || 30);
    const cutoff = new Date(Date.now() - ageMinutes * 60_000);

    // 找到待支付且创建时间超过 ageMinutes 的订单
    const pendingOrders = await db
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.status, PAY_STATUS.PENDING),
          lte(paymentOrders.createdAt, cutoff),
        ),
      )
      .limit(50);

    const results: { orderNo: string; action: string }[] = [];

    for (const order of pendingOrders) {
      const res = await reconcileOrder(order.orderNo, { closeMissing: true });
      results.push({
        orderNo: order.orderNo,
        action: res.reconciled
          ? res.orderStatus === PAY_STATUS.COMPLETED
            ? "settled"
            : res.orderStatus === PAY_STATUS.CLOSED
              ? "closed"
              : "pending"
          : `error:${res.reason}`,
      });
    }

    return NextResponse.json({
      success: true,
      scanned: pendingOrders.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[reconcile-orders] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
