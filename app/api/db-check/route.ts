import { NextResponse } from "next/server";

/**
 * GET /api/db-check
 * 检查 D1 数据库表结构
 */
export async function GET() {
  try {
    const { env } = await import("@/lib/env");

    // 查询 SQLite 的表结构
    const res = await fetch(
      `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}/d1/database/${env.cloudflare.d1DatabaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.cloudflare.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
          params: [],
        }),
      }
    );

    const body = await res.json();

    if (!res.ok || !body.success) {
      return NextResponse.json(
        {
          error: "Failed to query database",
          details: body,
        },
        { status: 500 }
      );
    }

    const tables = body.result?.[0]?.results || [];

    // 检查必需的表
    const requiredTables = ["user", "account", "session", "usage_log", "api_key", "quota"];
    const existingTables = tables.map((t: { name: string }) => t.name);
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    const status = missingTables.length === 0 ? "ok" : "missing_tables";

    return NextResponse.json({
      status,
      tables: existingTables,
      required: requiredTables,
      missing: missingTables,
      message:
        missingTables.length === 0
          ? "All required tables exist"
          : `Missing tables: ${missingTables.join(", ")}. Run migrations to create them.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
