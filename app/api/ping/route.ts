import { NextResponse } from "next/server";

/**
 * GET /api/ping
 * 简单的测试端点 - 验证应用基本运行
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    message: "Cloudflare AI Console is running"
  });
}
