import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

/** GET /api/channels/[channelId] */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId } = await params;
  const row = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!row) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  return NextResponse.json({ data: row });
}

/** PUT /api/channels/[channelId] */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId } = await params;
  const body = await request.json();

  try {
    const result = await db
      .update(channels)
      .set(body)
      .where(eq(channels.id, channelId))
      .returning();
    if (!result.length)
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    return NextResponse.json({ data: result[0] });
  } catch (error) {
    console.error("Failed to update channel:", error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

/** DELETE /api/channels/[channelId] - Soft delete */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { channelId } = await params;
  try {
    const result = await db
      .update(channels)
      .set({ status: 3 })
      .where(eq(channels.id, channelId))
      .returning();
    if (!result.length)
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    return NextResponse.json({ message: "Channel deleted", data: result[0] });
  } catch (error) {
    console.error("Failed to delete channel:", error);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
