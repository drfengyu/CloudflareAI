import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/health
 * 健康检查端点 - 用于诊断部署问题。
 * 状态码对所有调用方一致（全绿 200 / 否则 500），但**响应体只对管理员（role ≥ 10）展开**：
 * 明细含「哪些环境变量已设置」与 D1 报错原文，匿名暴露等于给探测者一张部署结构图。
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    env: {} as Record<string, string>,
    auth: { status: "unknown", error: null as string | null },
    database: { status: "unknown", error: null as string | null },
  };

  // 检查环境变量
  const requiredEnvs = [
    "CF_ACCOUNT_ID",
    "CF_API_TOKEN",
    "CF_D1_DATABASE_ID",
    "CF_KV_NAMESPACE_ID",
    "AUTH_SECRET",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
  ];

  for (const key of requiredEnvs) {
    checks.env[key] = process.env[key] ? "✓ set" : "✗ missing";
  }

  // 检查 Auth.js，顺带取当前会话用于判断是否展开明细
  let sessionUserId: string | undefined;
  try {
    const session = await auth();
    sessionUserId = session?.user?.id;
    checks.auth.status = "ok";
  } catch (err) {
    checks.auth.status = "error";
    checks.auth.error = err instanceof Error ? err.message : String(err);
  }

  // 检查 D1 连接
  try {
    const { env } = await import("@/lib/env");

    // 直接调用 D1 HTTP API
    const res = await fetch(
      `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}/d1/database/${env.cloudflare.d1DatabaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.cloudflare.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: "SELECT 1 as result", params: [] }),
      }
    );

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      checks.database.status = "error";
      checks.database.error = `HTTP ${res.status}: ${JSON.stringify(body)}`;
    } else if (!body.success) {
      checks.database.status = "error";
      checks.database.error = `D1 API error: ${JSON.stringify(body.errors || body)}`;
    } else {
      checks.database.status = "ok";
    }
  } catch (err) {
    checks.database.status = "error";
    checks.database.error = err instanceof Error ? err.message : String(err);
  }

  const allOk =
    checks.auth.status === "ok" &&
    checks.database.status === "ok" &&
    Object.values(checks.env).every(v => v === "✓ set");

  // 明细只给管理员（role ≥ 10）。D1 挂掉时这次查询也会失败，退回精简响应即可，
  // 不该让健康检查本身抛异常。
  let detailed = false;
  if (sessionUserId) {
    try {
      const admin = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, sessionUserId))
        .limit(1);
      detailed = (admin[0]?.role ?? 0) >= 10;
    } catch {
      detailed = false;
    }
  }

  return NextResponse.json(
    detailed ? checks : { status: allOk ? "ok" : "error" },
    { status: allOk ? 200 : 500 },
  );
}
