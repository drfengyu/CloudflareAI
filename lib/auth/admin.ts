import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Check if the current user has admin privileges (role >= 10).
 */
export async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return !!currentUser[0] && currentUser[0].role >= 10;
}
