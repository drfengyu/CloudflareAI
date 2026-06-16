"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { updateBasicSettings } from "./actions";
import { toast } from "sonner";

interface SettingsFormProps {
  initialSettings: {
    siteName: string;
    defaultBalanceValidDays: string;
  };
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [siteName, setSiteName] = useState(initialSettings.siteName);
  const [defaultBalanceValidDays, setDefaultBalanceValidDays] = useState(
    initialSettings.defaultBalanceValidDays,
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateBasicSettings({
        siteName,
        defaultBalanceValidDays,
      });
      toast.success("设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">站点名称</label>
        <input
          type="text"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          placeholder="Cloudflare AI Console"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          显示在浏览器标题栏和页面顶部
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          兑换码默认余额有效期（天）
        </label>
        <input
          type="number"
          value={defaultBalanceValidDays}
          onChange={(e) => setDefaultBalanceValidDays(e.target.value)}
          min={1}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          placeholder="365"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          生成兑换码时的默认有效期（充值后余额的过期时间）
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}
