import { eq, sql } from "drizzle-orm";
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

/**
 * Create an email/password user with a default quota row.
 * Phase B: first user or ADMIN_EMAILS match → role=100 (superadmin).
 */
export async function createCredentialUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
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
