import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/debug-token
 * 读取并解码 JWT token（用于调试）
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("authjs.session-token")?.value ||
                        cookieStore.get("__Secure-authjs.session-token")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "No session token found" }, { status: 404 });
    }

    // JWT token 格式: header.payload.signature
    const parts = sessionToken.split(".");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "Invalid JWT format" }, { status: 400 });
    }

    // 解码 payload (base64url)
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    const decoded = JSON.parse(payload);

    return NextResponse.json({
      token: "exists",
      payload: decoded,
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
