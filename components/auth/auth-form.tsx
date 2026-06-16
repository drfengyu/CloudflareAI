"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Cpu } from "lucide-react";
import {
  loginAction,
  registerAction,
  githubSignIn,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { IconLinuxDo } from "@/components/icons/linuxdo";
import { signIn } from "next-auth/react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.7c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 .8 2.7 1.2 4.1.5.1-.5.4-1.1.7-1.4-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2.1.1 3 .4c2.3-1.6 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg" className="w-full shadow-sm">
      {pending ? "处理中…" : label}
    </Button>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    action,
    {},
  );
  const isLogin = mode === "login";

  return (
    <div className="space-y-8">
      {/* 移动端 Logo */}
      <div className="flex items-center gap-2 lg:hidden">
        <Cpu className="h-6 w-6 text-primary" />
        <span className="font-semibold">Cloudflare AI Console</span>
      </div>

      {/* 简洁卡片 */}
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isLogin ? "登录" : "创建账户"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLogin ? "欢迎回来" : "用邮箱注册，或使用第三方账号"}
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          {!isLogin && (
            <Field name="name" type="text" label="昵称（可选）" required={false} />
          )}
          <Field name="email" type="email" label="邮箱" />
          <Field name="password" type="password" label="密码" />

          {state.error && (
            <p className="animate-in fade-in slide-in-from-top-1 text-sm text-danger duration-200">
              {state.error}
            </p>
          )}

          <SubmitButton label={isLogin ? "登录" : "注册"} />
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          或使用第三方账号
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-3">
          <form action={githubSignIn}>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full"
            >
              <GithubIcon className="h-4 w-4" />
              使用 GitHub 继续
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => signIn("linuxdo", { callbackUrl: "/dashboard" })}
          >
            <IconLinuxDo className="h-4 w-4" />
            使用 LinuxDO 继续
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isLogin ? (
            <>
              还没有账户？{" "}
              <Link
                href="/register"
                className="font-medium text-primary hover:underline"
              >
                注册
              </Link>
            </>
          ) : (
            <>
              已有账户？{" "}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                登录
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Field({
  name,
  type,
  label,
  required = true,
}: {
  name: string;
  type: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={
          type === "password"
            ? name === "password" && required
              ? "current-password"
              : "new-password"
            : type
        }
        placeholder={
          type === "email"
            ? "your@email.com"
            : type === "password"
              ? "••••••••"
              : ""
        }
        className="h-11 w-full rounded-lg border border-border bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/30 hover:border-border/80 focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
