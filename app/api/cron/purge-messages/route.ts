import { NextResponse } from "next/server";
import { purgeExpiredMessages } from "@/lib/message/messages";

/**
 * 清理到期的站内信：已读满 3 天、且没有待领取附件的信删掉。
 *
 * 触发：Vercel Cron（见 vercel.json，每天 04:00 UTC），也可带 `Authorization: Bearer $CRON_SECRET` 手动调用。
 * 「读过但还没领」的信不在删除范围内 —— 那等于把用户没来得及领的奖励吞掉。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await purgeExpiredMessages();
    return NextResponse.json({
      success: true,
      deleted,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[purge-messages] failed", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
