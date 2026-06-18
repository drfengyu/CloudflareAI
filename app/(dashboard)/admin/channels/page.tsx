import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ChannelsClient } from "./ChannelsClient";
import { redirect } from "next/navigation";

export default async function ChannelsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  const initialChannels = await db.select().from(channels);
  return <ChannelsClient initialChannels={initialChannels} />;
}
