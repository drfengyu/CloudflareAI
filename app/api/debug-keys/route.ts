import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const keys = await db
    .select({
      name: apiKeys.name,
      remainCredits: apiKeys.remainCredits,
    })
    .from(apiKeys)
    .limit(5);

  return Response.json({ keys });
}
