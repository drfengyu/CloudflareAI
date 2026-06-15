import { NextRequest } from "next/server";
import { db } from "@/lib/db/d1-http";
import { apiKeys, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";

/**
 * 临时测试端点：验证数据库 UPDATE 是否生效
 */
export async function GET(req: NextRequest) {
  try {
    // 当前登录用户
    const currentUserId = await requireUser();

    // 查询所有 test- 开头的 key
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        userId: apiKeys.userId,
        remainCredits: apiKeys.remainCredits,
      })
      .from(apiKeys)
      .limit(10);

    // 查询所有用户
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .limit(10);

    return Response.json({
      success: true,
      currentUserId,
      keys,
      allUsers,
    });
  } catch (err) {
    console.error("[test-db] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
