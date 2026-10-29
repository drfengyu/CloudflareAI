import { AuthForm } from "@/components/auth/auth-form";
import { getAuthChannels } from "@/lib/settings";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const [channels, params] = await Promise.all([
    getAuthChannels(),
    searchParams,
  ]);
  const ref = typeof params.ref === "string" ? params.ref : undefined;
  return <AuthForm mode="register" channels={channels} inviteCode={ref} />;
}
