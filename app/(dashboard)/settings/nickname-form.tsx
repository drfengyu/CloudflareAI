"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { changeMyNickname } from "./actions";

export function NicknameForm({ initialName }: { initialName: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await changeMyNickname({ name });
      setName(result.name);
      toast.success("昵称已更新");
      // 顶栏昵称来自会话，服务端动作里已同步刷新。
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
        <CardTitle className="text-base">修改昵称</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-sm space-y-3">
          <p className="text-xs text-muted-foreground">
            显示在顶栏和看板问候里，最多 20 个字符；留空无法保存。
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="nickname">
              昵称
            </label>
            <input
              id="nickname"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              maxLength={20}
              placeholder="输入新昵称"
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            {busy ? "保存中..." : "保存昵称"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
