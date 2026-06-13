import { eq, sql } from "drizzle-orm";
import { db } from "./d1-http";
import { users, quotas, type User } from "./schema";

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

  await db.insert(users).values({
    id,
    email,
    passwordHash: input.passwordHash,
    name: input.name ?? email.split("@")[0],
    role,
    balanceCredits: 0, // Phase B: start with 0 balance (admin can grant via redemption/topup)
    status: 1, // 1=enabled
  });

  await db.insert(quotas).values({ userId: id }).onConflictDoNothing();
  return id;
}
