import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/debug-session
 * 完整的 session 调试信息（包括 token 内容）
 */
export async function GET() {
  try {
    const session = await auth();

    // 读取原始 token（从 cookie）
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("authjs.session-token")?.value ||
                        cookieStore.get("__Secure-authjs.session-token")?.value;

    return NextResponse.json({
      authenticated: !!session?.user,
      session: session,
      sessionToken: sessionToken ? "exists" : "missing",
      cookies: Array.from(cookieStore.getAll()).map(c => c.name),
    }, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
