import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// 查看当前登录用户信息
// GET /api/debug/whoami

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      balanceCredits: users.balanceCredits,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);

  if (!userRows[0]) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const user = userRows[0];
  const roleLabel =
    user.role >= 100
      ? "超级管理员"
      : user.role >= 10
      ? "管理员"
      : "普通用户";

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roleLabel,
    balanceCredits: user.balanceCredits,
    balanceUsd: user.balanceCredits.toFixed(2),
    status: user.status,
    canAccessAdmin: user.role >= 10,
  });
}
