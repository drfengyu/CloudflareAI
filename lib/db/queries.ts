import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./d1-http";
import { users, quotas, topups, type User } from "./schema";

/** Look up a user by (lowercased) email. */
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0];
}

function newInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** 按邀请码查启用状态的用户；非法格式直接返回 undefined，不查库。 */
export async function getUserByInviteCode(code: string): Promise<User | undefined> {
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z0-9]{6,32}$/.test(normalized)) return undefined;

  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.inviteCode, normalized), eq(users.status, 1)))
    .limit(1);
  return rows[0];
}

/**
 * 返回用户邀请码；老用户（OAuth 注册、迁移前注册）首次访问时补发。
 * 条件更新 `inviteCode IS NULL` 保证并发下只有一次写入生效。
 */
export async function ensureInviteCode(userId: string): Promise<string> {
  const current = await db
    .select({ inviteCode: users.inviteCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (current[0]?.inviteCode) return current[0].inviteCode;

  const code = newInviteCode();
  await db
    .update(users)
    .set({ inviteCode: code })
    .where(and(eq(users.id, userId), isNull(users.inviteCode)));

  const after = await db
    .select({ inviteCode: users.inviteCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return after[0]?.inviteCode ?? code;
}

/**
 * Create an email/password user with a default quota row.
 * Phase B: first user or ADMIN_EMAILS match → role=100 (superadmin).
 */
export async function createCredentialUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
  /** 邀请人用户 ID（携带有效邀请码注册时写入）。 */
  invitedBy?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const email = input.email.toLowerCase();

  // Check if this is the first user
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .limit(1);
  const isFirstUser = (countResult[0]?.count ?? 0) === 0;

  // Check ADMIN_EMAILS env var (comma-separated)
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdminEmail = adminEmails.includes(email);

  // role: 100=superadmin, 10=admin, 1=user
  const role = isFirstUser || isAdminEmail ? 100 : 1;

  // New user welcome bonus: 2000 credits
  const WELCOME_BONUS = 2000;

  await db.insert(users).values({
    id,
    email,
    passwordHash: input.passwordHash,
    name: input.name ?? email.split("@")[0],
    role,
    balanceCredits: WELCOME_BONUS, // Welcome bonus for new users
    status: 1, // 1=enabled
    inviteCode: newInviteCode(),
    invitedBy: input.invitedBy ?? null,
  });

  // Record the welcome bonus as a topup
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId: id,
    amount: WELCOME_BONUS,
    type: 4, // 4=other (welcome bonus)
    description: "新用户注册奖励",
    createdAt: new Date(),
  });

  await db.insert(quotas).values({ userId: id }).onConflictDoNothing();
  return id;
}
