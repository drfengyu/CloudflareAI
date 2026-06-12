import { eq } from "drizzle-orm";
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

/** Create an email/password user with a default quota row. Returns the id. */
export async function createCredentialUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: input.email.toLowerCase(),
    passwordHash: input.passwordHash,
    name: input.name ?? input.email.split("@")[0],
  });
  await db.insert(quotas).values({ userId: id }).onConflictDoNothing();
  return id;
}
