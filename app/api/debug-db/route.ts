import { NextResponse } from "next/server";
import { db } from "@/lib/db/d1-http";

/**
 * GET /api/debug-db
 * 查询数据库中的用户和账户
 */
export async function GET() {
  try {
    const users = await db.query.users.findMany({
      limit: 10,
    });

    const accounts = await db.query.accounts.findMany({
      limit: 10,
    });

    return NextResponse.json({
      usersCount: users.length,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        hasPassword: !!u.passwordHash,
      })),
      accountsCount: accounts.length,
      accounts: accounts.map(a => ({
        userId: a.userId,
        provider: a.provider,
        providerAccountId: a.providerAccountId,
      })),
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
