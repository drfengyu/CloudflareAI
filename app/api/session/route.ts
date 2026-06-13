import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/session
 * 调试端点：检查当前用户 session
 */
export async function GET() {
  try {
    const session = await auth();

    return NextResponse.json({
      authenticated: !!session?.user,
      user: session?.user || null,
      expires: session?.expires || null,
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
