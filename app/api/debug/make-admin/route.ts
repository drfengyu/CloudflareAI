import { NextResponse } from "next/server";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// 临时管理员升级端点（仅开发环境）
// GET /api/debug/make-admin?email=your@email.com

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 仅在开发环境允许
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "仅开发环境可用" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { error: "缺少 email 参数" },
      { status: 400 }
    );
  }

  // 查找用户
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!userRows[0]) {
    return NextResponse.json(
      { error: `用户不存在: ${email}` },
      { status: 404 }
    );
  }

  const user = userRows[0];
  const oldRole = user.role || 1;

  if (oldRole >= 100) {
    return NextResponse.json({
      message: "用户已经是超级管理员",
      email: user.email,
      role: oldRole,
    });
  }

  // 升级为超管
  await db
    .update(users)
    .set({ role: 100 })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    message: "升级成功",
    email: user.email,
    oldRole,
    newRole: 100,
    adminPages: [
      "/admin/users",
      "/admin/redemptions",
      "/admin/settings",
    ],
  });
}
