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

/** GET /api/channels - List all channels (admin only) */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const allChannels = await db.select().from(channels).all();
  return NextResponse.json({ data: allChannels });
}

/** POST /api/channels - Create a new channel (admin only) */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, name, type, status = 1, config } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "name and type are required" }, { status: 400 });
    }

    const channelId = id || crypto.randomUUID();
    const result = await db
      .insert(channels)
      .values({ id: channelId, name, type, status, config })
      .returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create channel:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
