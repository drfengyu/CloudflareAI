"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface SettingsFormProps {
  initialSettings: {
    priceMultiplierHosted: string;
    priceMultiplierProxied: string;
  };
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [hosted, setHosted] = useState(initialSettings.priceMultiplierHosted);
  const [proxied, setProxied] = useState(initialSettings.priceMultiplierProxied);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // TODO: 实现保存逻辑（Server Action）
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setLoading(false);
    alert("设置已保存（TODO: 实现后端逻辑）");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Hosted 模型倍率
        </label>
        <input
          type="number"
          value={hosted}
          onChange={(e) => setHosted(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          placeholder="1000"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          消耗平台神经元配额的模型，建议 1000 倍以上
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Proxied 模型倍率
        </label>
        <input
          type="number"
          value={proxied}
          onChange={(e) => setProxied(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          placeholder="1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          第三方计费模型，建议 1 倍（按实际价格）
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}
