import { db } from "@/lib/db/d1-http";
import { temporaryBalances } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * 定期清理过期的临时余额
 *
 * 触发方式：
 * 1. Vercel Cron Job（生产环境）
 * 2. 手动调用：curl https://your-domain.com/api/cron/cleanup-expired-balances
 *
 * 配置：vercel.json
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-expired-balances",
 *     "schedule": "0 2 * * *"  // 每天凌晨 2 点（UTC）
 *   }]
 * }
 */
export async function GET(request: Request) {
  try {
    // 验证 Cron Secret（可选，增强安全性）
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const now = new Date();
    const nowMs = now.getTime();

    console.log(`[cleanup-expired-balances] Starting cleanup at ${now.toISOString()}`);

    // 查询即将删除的记录（用于日志）
    const expiredRecords = await db
      .select()
      .from(temporaryBalances)
      .where(sql`${temporaryBalances.expiresAt} <= ${nowMs}`);

    if (expiredRecords.length === 0) {
      console.log("[cleanup-expired-balances] No expired records found");
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "No expired temporary balances",
        timestamp: now.toISOString(),
      });
    }

    // 删除过期记录
    const result = await db
      .delete(temporaryBalances)
      .where(sql`${temporaryBalances.expiresAt} <= ${nowMs}`);

    console.log(
      `[cleanup-expired-balances] Deleted ${expiredRecords.length} expired records`,
      expiredRecords.map((r) => ({
        userId: r.userId,
        amount: r.amount,
        expiresAt: new Date(r.expiresAt).toISOString(),
      }))
    );

    return NextResponse.json({
      success: true,
      deleted: expiredRecords.length,
      message: `Cleaned up ${expiredRecords.length} expired temporary balance(s)`,
      timestamp: now.toISOString(),
      details: expiredRecords.map((r) => ({
        userId: r.userId,
        amount: r.amount,
        expiresAt: new Date(r.expiresAt).toISOString(),
        description: r.description,
      })),
    });
  } catch (error) {
    console.error("[cleanup-expired-balances] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// 支持 POST 请求（某些 Cron 服务使用 POST）
export async function POST(request: Request) {
  return GET(request);
}
