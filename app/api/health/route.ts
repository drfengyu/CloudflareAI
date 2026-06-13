import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

/**
 * GET /api/health
 * 健康检查端点 - 用于诊断部署问题
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
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ];

  for (const key of requiredEnvs) {
    checks.env[key] = process.env[key] ? "✓ set" : "✗ missing";
  }

  // 检查 Auth.js
  try {
    await auth();
    checks.auth.status = "ok";
  } catch (err) {
    checks.auth.status = "error";
    checks.auth.error = err instanceof Error ? err.message : String(err);
  }

  // 检查 D1 连接
  try {
    const { db } = await import("@/lib/db/d1-http");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    checks.database.status = "ok";
  } catch (err) {
    checks.database.status = "error";
    checks.database.error = err instanceof Error ? err.message : String(err);
  }

  const allOk =
    checks.auth.status === "ok" &&
    checks.database.status === "ok" &&
    Object.values(checks.env).every(v => v === "✓ set");

  return NextResponse.json(checks, {
    status: allOk ? 200 : 500
  });
}
