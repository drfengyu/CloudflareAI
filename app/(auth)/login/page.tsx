import { AuthForm } from "@/components/auth/auth-form";
import { getAuthChannels } from "@/lib/settings";

export default async function LoginPage() {
  const channels = await getAuthChannels();
  return <AuthForm mode="login" channels={channels} />;
}
