import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUptimeStatus } from "@/lib/settings/dashboard-info";

/**
 * GET /api/uptime
 * 看板「服务可用性」卡片的数据源：按后台配置的 Uptime Kuma 接口现场抓取。
 * 走客户端调用而非服务端渲染，是为了让慢上游只影响这张卡片，不拖住整个看板页。
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getUptimeStatus();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
