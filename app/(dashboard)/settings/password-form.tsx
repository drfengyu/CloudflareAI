"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { changeMyPassword } from "./actions";

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

/** 登录密码：有密码的账号要先验当前密码，LinuxDO / OAuth 注册的账号直接设一个。 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("新密码至少 8 位");
      return;
    }
    if (next !== confirm) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setBusy(true);
    try {
      const { firstTime } = await changeMyPassword({ currentPassword: current, newPassword: next });
      toast.success(firstTime ? "密码已设置，现在可以用邮箱 + 密码登录了" : "密码已修改");
      setCurrent("");
      setNext("");
      setConfirm("");
      // 顶栏铃铛的未读数要跟着这条安全提示变。
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "修改失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{hasPassword ? "修改登录密码" : "设置登录密码"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-sm space-y-3">
          <p className="text-xs text-muted-foreground">
            {hasPassword
              ? "修改成功后会给你自己发一封站内信留痕，其他设备需要用新密码登录。"
              : "你这个账号是第三方授权注册的，还没有密码。设置后即可用邮箱 + 密码登录。"}
          </p>
          {hasPassword ? (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="current-password">
                当前密码
              </label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="new-password">
              新密码
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputClass}
              placeholder="至少 8 位"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="confirm-password">
              确认新密码
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "处理中..." : hasPassword ? "修改密码" : "设置密码"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
