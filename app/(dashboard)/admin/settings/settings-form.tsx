"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { updateBasicSettings, updatePricingSettings } from "./actions";
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

interface PricingSettingsFormProps {
  initialSettings: {
    baseMultiplier: string;
    adjustThreshold: string;
    adjustMultiplierLow: string;
    adjustMultiplierHigh: string;
    defaultPricePerMillion: string;
  };
}

export function PricingSettingsForm({ initialSettings }: PricingSettingsFormProps) {
  const [baseMultiplier, setBaseMultiplier] = useState(initialSettings.baseMultiplier);
  const [adjustThreshold, setAdjustThreshold] = useState(initialSettings.adjustThreshold);
  const [adjustMultiplierLow, setAdjustMultiplierLow] = useState(initialSettings.adjustMultiplierLow);
  const [adjustMultiplierHigh, setAdjustMultiplierHigh] = useState(initialSettings.adjustMultiplierHigh);
  const [defaultPricePerMillion, setDefaultPricePerMillion] = useState(initialSettings.defaultPricePerMillion);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updatePricingSettings({
        baseMultiplier,
        adjustThreshold,
        adjustMultiplierLow,
        adjustMultiplierHigh,
        defaultPricePerMillion,
      });
      toast.success("定价设置已保存，正在重新同步模型价格表...", { duration: 3000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">基础倍率策略</h3>

        <div>
          <label className="block text-sm font-medium mb-1">
            基础倍率 (BASE_MULTIPLIER)
          </label>
          <input
            type="number"
            value={baseMultiplier}
            onChange={(e) => setBaseMultiplier(e.target.value)}
            min={1}
            step={1}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            placeholder="1000"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Cloudflare 官方价格的基础倍率（默认 1000）
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs text-muted-foreground">
            <strong>当前策略：</strong>所有模型价格先 ×{baseMultiplier}（基础倍率），
            然后根据价格区间应用调整倍率
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">价格调整规则</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              价格阈值 ($/1M tokens)
            </label>
            <input
              type="number"
              value={adjustThreshold}
              onChange={(e) => setAdjustThreshold(e.target.value)}
              min={0}
              step={1}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              placeholder="100"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              分界线，低于此价格应用低价倍率
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              低价倍率 (&lt; 阈值)
            </label>
            <input
              type="number"
              value={adjustMultiplierLow}
              onChange={(e) => setAdjustMultiplierLow(e.target.value)}
              min={0.01}
              step={0.1}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              placeholder="5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              基础价 &lt; ${adjustThreshold} 时的倍率
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            高价倍率 (≥ 阈值)
          </label>
          <input
            type="number"
            value={adjustMultiplierHigh}
            onChange={(e) => setAdjustMultiplierHigh(e.target.value)}
            min={0.01}
            step={0.1}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            placeholder="1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            基础价 ≥ ${adjustThreshold} 时的倍率（通常为 1，不再加价）
          </p>
        </div>

        <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-950/20 p-4">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            <strong>示例：</strong>某模型官方价 $0.01/1M tokens
            <br />→ 基础价 = $0.01 × {baseMultiplier} = ${parseFloat(baseMultiplier) * 0.01}
            <br />→ ${parseFloat(baseMultiplier) * 0.01} &lt; ${adjustThreshold}，应用低价倍率 ×{adjustMultiplierLow}
            <br />→ 最终价 = ${parseFloat(baseMultiplier) * 0.01} × {adjustMultiplierLow} = ${parseFloat(baseMultiplier) * 0.01 * parseFloat(adjustMultiplierLow)}/1M tokens
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">兜底价格</h3>

        <div>
          <label className="block text-sm font-medium mb-1">
            无定价模型默认价格 ($/1M tokens)
          </label>
          <input
            type="number"
            value={defaultPricePerMillion}
            onChange={(e) => setDefaultPricePerMillion(e.target.value)}
            min={0}
            step={1}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            placeholder="100"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            当模型在 Cloudflare catalog 中无定价信息时使用
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : "保存并重新同步价格表"}
        </Button>
        <p className="text-xs text-muted-foreground">
          保存后将自动重新计算所有模型价格（保留已有的自定义倍率）
        </p>
      </div>
    </form>
  );
}
