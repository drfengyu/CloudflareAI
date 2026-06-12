"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getUserByEmail, createCredentialUser } from "@/lib/db/queries";

const schema = z.object({
  name: z.string().trim().max(60).optional(),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位"),
});

export interface AuthActionState {
  error?: string;
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = schema.safeParse({
    name: formData.get("name") || undefined,
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  }

  const { email, password, name } = parsed.data;
  if (await getUserByEmail(email)) {
    return { error: "该邮箱已注册" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await createCredentialUser({ email, passwordHash, name });

  // signIn throws a redirect on success (caught by Next).
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return {};
}

export async function githubSignIn() {
  await signIn("github", { redirectTo: "/dashboard" });
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "邮箱或密码错误" };
    }
    throw err; // re-throw redirect
  }
}
