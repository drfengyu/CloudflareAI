import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUptimeStatus } from "@/lib/settings/dashboard-info";

/**
 * GET /api/uptime
 * 看板「服务可用性」卡片的数据源：配了外部 Uptime Kuma 地址就代理它，
 * 否则并发自检本站关键端点（见 BUILTIN_UPTIME_TARGETS）。
 * 走客户端调用而非服务端渲染，是为了让慢上游只影响这张卡片，不拖住整个看板页。
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getUptimeStatus(new URL(req.url).origin);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
