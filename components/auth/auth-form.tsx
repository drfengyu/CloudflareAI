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
    <Button type="submit" disabled={pending} className="w-full">
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
    <div className="space-y-6">
      {/* 移动端 Logo */}
      <div className="flex items-center gap-2 lg:hidden">
        <Cpu className="h-6 w-6 text-primary" />
        <span className="font-semibold">Cloudflare AI Console</span>
      </div>

      {/* 玻璃态卡片 + 渐变光晕 */}
      <div className="group relative rounded-2xl border border-border/50 bg-card/80 p-6 shadow-xl shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:border-border/80 hover:shadow-2xl dark:border-white/10 dark:bg-card/60 dark:shadow-black/20">
        {/* 顶部高光渐变 */}
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <h1 className="text-lg font-semibold">
          {isLogin ? "登录" : "创建账户"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLogin ? "欢迎回来" : "用邮箱注册，或使用第三方账号"}
        </p>

        <form action={formAction} className="mt-5 space-y-3">
          {!isLogin && (
            <Field name="name" type="text" label="昵称（可选）" required={false} />
          )}
          <Field name="email" type="email" label="邮箱" />
          <Field name="password" type="password" label="密码" />

          {state.error && (
            <p className="animate-in fade-in slide-in-from-top-1 text-xs text-danger duration-200">
              {state.error}
            </p>
          )}

          <SubmitButton label={isLogin ? "登录" : "注册"} />
        </form>

        <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
          或使用第三方账号
          <span className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border" />
        </div>

        <div className="space-y-2">
          <form action={githubSignIn}>
            <Button
              type="submit"
              variant="outline"
              className="group/btn w-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent hover:shadow-lg"
            >
              <GithubIcon className="h-4 w-4 transition-transform duration-300 group-hover/btn:rotate-12" />
              使用 GitHub 继续
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            className="group/btn w-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent hover:shadow-lg"
            onClick={() => signIn("linuxdo", { callbackUrl: "/dashboard" })}
          >
            <IconLinuxDo className="h-4 w-4 transition-transform duration-300 group-hover/btn:scale-110" />
            使用 LinuxDO 继续
          </Button>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {isLogin ? (
            <>
              还没有账户？{" "}
              <Link
                href="/register"
                className="text-primary transition-colors hover:text-primary/80 hover:underline"
              >
                注册
              </Link>
            </>
          ) : (
            <>
              已有账户？{" "}
              <Link
                href="/login"
                className="text-primary transition-colors hover:text-primary/80 hover:underline"
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
      <span className="mb-1 block text-xs font-medium text-muted-foreground transition-colors duration-200 has-[:focus]:text-foreground">
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
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm shadow-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/40 hover:border-primary/50 focus:border-primary focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)] focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
