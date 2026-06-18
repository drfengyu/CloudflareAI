import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAdapter } from "@/lib/channels/registry";

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
  { params }: { params: Promise<{ channelId: string }> | { channelId: string } },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const resolved = await params;
  const { channelId } = resolved;

  const row = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!row) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const adapter = getAdapter(row.type || "");
  if (!adapter || !adapter.healthCheck) {
    return NextResponse.json({ ok: false, message: "该渠道类型不支持健康检查" });
  }

  let configObj: Record<string, unknown> = {};
  try {
    configObj = row.config ? JSON.parse(row.config) : {};
  } catch {
    // ignore
  }

  const result = await adapter.healthCheck({ config: configObj });
  return NextResponse.json(result);
}
