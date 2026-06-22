import { AuthForm } from "@/components/auth/auth-form";
import { getAuthChannels } from "@/lib/settings";

export default async function RegisterPage() {
  const channels = await getAuthChannels();
  return <AuthForm mode="register" channels={channels} />;
}
