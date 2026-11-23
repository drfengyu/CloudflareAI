"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  sanitizeKongmingActivityConfig,
  type KongmingActivityConfig,
} from "@/lib/kongming/activity-config";
import { updateKongmingSettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums";

function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

export function KongmingForm({ initialConfig }: { initialConfig: KongmingActivityConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [couponUnit, setCouponUnit] = useState(String(initialConfig.couponUnitCredits));
  const [goldPerCoupon, setGoldPerCoupon] = useState(String(initialConfig.goldPerCoupon));
  const [maxPerExchange, setMaxPerExchange] = useState(String(initialConfig.maxCouponsPerExchange));
  const [loading, setLoading] = useState(false);

  const preview = useMemo(
    () =>
      sanitizeKongmingActivityConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        couponUnitCredits: Number(couponUnit),
        goldPerCoupon: Number(goldPerCoupon),
        maxCouponsPerExchange: Number(maxPerExchange),
      }),
    [enabled, startAt, endAt, couponUnit, goldPerCoupon, maxPerExchange],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateKongmingSettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        couponUnitCredits: Number(couponUnit),
        goldPerCoupon: Number(goldPerCoupon),
        maxCouponsPerExchange: Number(maxPerExchange),
      });
      toast.success("诸葛孔明传活动配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          id="kongming-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="kongming-enabled" className="text-sm font-medium">
          开启诸葛孔明传活动券
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        活动页先按「1 张 = 券面 cr」购买孔明券，进游戏后可在同页把券换成存档里的金。
        修改开始时间等于开启新一轮：旧券不跨期，需重新兑换。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">开始时间（北京时间）</label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">结束时间（北京时间）</label>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">孔明券单价（cr / 张）</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={couponUnit}
            onChange={(e) => setCouponUnit(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每张券兑换金</label>
          <input
            type="number"
            min="1"
            step="1"
            value={goldPerCoupon}
            onChange={(e) => setGoldPerCoupon(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单次兑换上限（张）</label>
          <input
            type="number"
            min="1"
            step="1"
            value={maxPerExchange}
            onChange={(e) => setMaxPerExchange(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">兑换预览</p>
          <p className="mt-1 tabular-nums">
            1 张 = {preview.couponUnitCredits} cr → {preview.goldPerCoupon} 金
          </p>
          <p className="tabular-nums">
            单次最多 {preview.maxCouponsPerExchange} 张 →{" "}
            {preview.maxCouponsPerExchange * preview.goldPerCoupon} 金
          </p>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存诸葛孔明传活动配置"}
      </Button>
    </form>
  );
}
