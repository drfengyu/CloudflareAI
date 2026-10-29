"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { getUserByEmail, getUserByInviteCode, createCredentialUser } from "@/lib/db/queries";
import { getInviteSettings } from "@/lib/settings";
import { grantInviteRewards } from "@/lib/invite/rewards";
import {
  checkIPRegistrationLimit,
  logRegistration,
  getIPRegistrationCount,
} from "@/lib/auth/rate-limit";
import { isTempEmail } from "@/lib/auth/temp-email-blacklist";

const schema = z.object({
  name: z.string().trim().max(60).optional(),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位"),
  /** 邀请码（注册页从 ?ref= 透传）；非法或失效时按普通注册处理。 */
  ref: z.string().trim().max(64).optional(),
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
    ref: formData.get("ref") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  }

  const { email, password, name, ref } = parsed.data;

  // 检查是否为临时邮箱
  if (isTempEmail(email)) {
    return {
      error: "不支持使用临时邮箱注册，请使用常用邮箱（如 Gmail、Outlook、QQ 邮箱等）",
    };
  }

  // 获取 IP 地址
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";

  // 检查 IP 注册频率限制（24小时内最多3次）
  if (!(await checkIPRegistrationLimit(ip, 24, 3))) {
    const count = await getIPRegistrationCount(ip, 24);
    return {
      error: `该 IP 地址今日注册次数已达上限（${count}/3），请明天再试`,
    };
  }

  // 检查邮箱是否已注册
  if (await getUserByEmail(email)) {
    return { error: "该邮箱已注册" };
  }

  // 邀请归因：邀请码无效、被邀请人是自己、或功能关闭时按普通注册处理。
  const inviter = ref ? await getUserByInviteCode(ref) : undefined;
  const inviteSettings = inviter ? await getInviteSettings() : undefined;
  const invite =
    inviter &&
    inviteSettings?.enabled &&
    inviter.email?.toLowerCase() !== email.toLowerCase()
      ? {
          inviterId: inviter.id,
          inviterReward: inviteSettings.inviterReward,
          inviteeReward: inviteSettings.inviteeReward,
        }
      : undefined;

  // 创建用户
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = await createCredentialUser({
    email,
    passwordHash,
    name,
    invitedBy: invite?.inviterId,
  });

  // 奖励发放失败不影响注册本身：账号已创建，邀请关系仍可从 user.invitedBy 追溯。
  if (invite) {
    try {
      await grantInviteRewards({
        inviterId: invite.inviterId,
        inviteeId: userId,
        inviteeEmail: email,
        inviterReward: invite.inviterReward,
        inviteeReward: invite.inviteeReward,
      });
    } catch (err) {
      console.error("[registerAction] Failed to grant invite rewards:", err);
    }
  }

  // 记录注册日志
  const userAgent = headersList.get("user-agent") || "unknown";
  await logRegistration(ip, email, userAgent);

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
