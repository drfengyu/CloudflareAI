import { NextResponse } from "next/server";
import { auth } from "@/auth";

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
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
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
        body: JSON.stringify({ sql: "SELECT 1 as check", params: [] }),
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

  return NextResponse.json(checks, {
    status: allOk ? 200 : 500
  });
}
