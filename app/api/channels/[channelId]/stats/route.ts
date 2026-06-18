import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, usageLogs, users } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return !!currentUser[0] && currentUser[0].role >= 10;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId } = await params;

  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Total stats
  const totals = await db
    .select({
      totalCalls: sql<number>`count(*)`,
      totalCredits: sql<number>`coalesce(sum(${usageLogs.creditsUsed}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${usageLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${usageLogs.outputTokens}), 0)`,
      successCalls: sql<number>`sum(case when ${usageLogs.status} = 'ok' then 1 else 0 end)`,
      errorCalls: sql<number>`sum(case when ${usageLogs.status} = 'error' then 1 else 0 end)`,
    })
    .from(usageLogs)
    .where(eq(usageLogs.channelId, channelId));

  // Daily usage for last 30 days
  const dailyUsage = await db
    .select({
      date: sql<string>`date(${usageLogs.createdAt} / 1000, 'unixepoch')`,
      calls: sql<number>`count(*)`,
      credits: sql<number>`coalesce(sum(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(eq(usageLogs.channelId, channelId))
    .groupBy(sql`date(${usageLogs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(desc(sql`date(${usageLogs.createdAt} / 1000, 'unixepoch')`))
    .limit(30);

  // Top models by call count
  const topModels = await db
    .select({
      model: usageLogs.model,
      callCount: sql<number>`count(*)`,
      creditsUsed: sql<number>`coalesce(sum(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(eq(usageLogs.channelId, channelId))
    .groupBy(usageLogs.model)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  // Recent errors
  const recentErrors = await db
    .select({
      id: usageLogs.id,
      model: usageLogs.model,
      errorReason: usageLogs.errorReason,
      createdAt: usageLogs.createdAt,
    })
    .from(usageLogs)
    .where(eq(usageLogs.channelId, channelId) && eq(usageLogs.status, "error"))
    .orderBy(desc(usageLogs.createdAt))
    .limit(10);

  return NextResponse.json({
    data: {
      totals: totals[0] || {
        totalCalls: 0,
        totalCredits: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        successCalls: 0,
        errorCalls: 0,
      },
      dailyUsage,
      topModels,
      recentErrors,
    },
  });
}
