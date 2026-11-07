import { batchRows, d1Run, db } from "@/lib/db/d1-http";
import { temporaryBalances } from "@/lib/db/schema";
import { TOPUP_TYPE_EXPIRE } from "@/lib/billing/ledger";
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
        journaled: 0,
        message: "No expired temporary balances",
        timestamp: now.toISOString(),
      });
    }

    // 删行前先按行补一笔负数流水：发放时记了收入，过期不记账的话账本永远只有收入。
    // id 固定为 `expire:<临时余额行 id>`，重跑时 INSERT OR IGNORE 不会重复记；
    // 写流水失败就抛出、不进入删行，下一轮 cron 会重试。
    const journalRows = expiredRecords
      .filter((row) => row.amount > 0)
      .map((row) => ({
        id: `expire:${row.id}`,
        userId: row.userId,
        amount: -row.amount,
        type: TOPUP_TYPE_EXPIRE,
        description: `临时余额过期作废${row.description ? `：${row.description}` : ""}`.slice(0, 300),
        createdAt: new Date(row.expiresAt).getTime(),
      }));

    for (const batch of batchRows(journalRows, 6)) {
      await d1Run(
        `INSERT OR IGNORE INTO topup (id, userId, amount, type, description, createdAt)
         VALUES ${batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
        batch.flatMap((row) => [
          row.id,
          row.userId,
          row.amount,
          row.type,
          row.description,
          row.createdAt,
        ]),
      );
    }

    // 只删刚记过账的这批 id：select 与 delete 之间新到期的行留给下一轮，不会漏流水。
    for (const batch of batchRows(
      expiredRecords.map((row) => row.id),
      1,
    )) {
      await d1Run(
        `DELETE FROM temporary_balance WHERE id IN (${batch.map(() => "?").join(",")})`,
        batch,
      );
    }

    console.log(
      `[cleanup-expired-balances] Journaled ${journalRows.length} and deleted ${expiredRecords.length} expired records`,
      expiredRecords.map((r) => ({
        userId: r.userId,
        amount: r.amount,
        expiresAt: new Date(r.expiresAt).toISOString(),
      }))
    );

    return NextResponse.json({
      success: true,
      deleted: expiredRecords.length,
      journaled: journalRows.length,
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
