import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * POST /api/db-migrate
 * 在 Vercel 上执行 D1 数据库迁移
 *
 * 安全说明：生产环境应该添加认证保护
 */
export async function POST(request: Request) {
  try {
    const { secret } = await request.json();

    // 简单的安全检查（生产环境应该用更强的认证）
    if (secret !== process.env.AUTH_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { env } = await import("@/lib/env");

    // 读取迁移 SQL 文件
    const migrationPath = join(process.cwd(), "drizzle", "migrations.sql");
    let sql: string;

    try {
      sql = readFileSync(migrationPath, "utf-8");
    } catch (err) {
      return NextResponse.json({
        error: "Migration file not found",
        message: "Please generate migrations locally first with: npm run db:generate",
      }, { status: 404 });
    }

    // 分割成单独的语句（忽略空行和注释）
    const statements = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s && !s.startsWith("--") && !s.startsWith("/*"));

    const results = [];
    const errors = [];

    // 逐条执行 SQL 语句
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      try {
        const res = await fetch(
          `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}/d1/database/${env.cloudflare.d1DatabaseId}/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.cloudflare.apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql: stmt, params: [] }),
          }
        );

        const body = await res.json();

        if (!res.ok || !body.success) {
          errors.push({
            statement: i + 1,
            sql: stmt.substring(0, 100),
            error: body.errors || body,
          });
        } else {
          results.push({
            statement: i + 1,
            success: true,
          });
        }
      } catch (err) {
        errors.push({
          statement: i + 1,
          sql: stmt.substring(0, 100),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      total: statements.length,
      executed: results.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
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
