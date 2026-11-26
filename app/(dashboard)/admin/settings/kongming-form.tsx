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
  const [couponGoldOffers, setCouponGoldOffers] = useState(
    initialConfig.couponGoldOffers.map((item) => ({ tickets: String(item.tickets), gold: String(item.gold) })),
  );
  const [goldPerTcr, setGoldPerTcr] = useState(String(initialConfig.goldPerTcr));
  const [goldTcrOffers, setGoldTcrOffers] = useState(
    initialConfig.goldTcrOffers.map((item) => ({ gold: String(item.gold), tcr: String(item.tcr) })),
  );
  const [dailyGold, setDailyGold] = useState(String(initialConfig.maxGoldPerTcrDaily));
  const [tcrValidDays, setTcrValidDays] = useState(String(initialConfig.tcrValidDays));
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
        couponGoldOffers: couponGoldOffers.map((item) => ({
          tickets: Number(item.tickets),
          gold: Number(item.gold),
        })),
        goldPerTcr: Number(goldPerTcr),
        goldTcrOffers: goldTcrOffers.map((item) => ({
          gold: Number(item.gold),
          tcr: Number(item.tcr),
        })),
        maxGoldPerTcrDaily: Number(dailyGold),
        tcrValidDays: Number(tcrValidDays),
      }),
    [
      enabled,
      startAt,
      endAt,
      couponUnit,
      goldPerCoupon,
      maxPerExchange,
      couponGoldOffers,
      goldPerTcr,
      goldTcrOffers,
      dailyGold,
      tcrValidDays,
    ],
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
        couponGoldOffers: couponGoldOffers.map((item) => ({
          tickets: Number(item.tickets),
          gold: Number(item.gold),
        })),
        goldPerTcr: Number(goldPerTcr),
        goldTcrOffers: goldTcrOffers.map((item) => ({
          gold: Number(item.gold),
          tcr: Number(item.tcr),
        })),
        maxGoldPerTcrDaily: Number(dailyGold),
        tcrValidDays: Number(tcrValidDays),
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
        券房改成了武器店式柜台：第一栏消耗孔明券换游戏金，第二栏用游戏金换 tcr。
        两栏各三档，默认按基准值 ×1 / ×5 / ×25；单日金换 tcr 上限按三档金额配置。
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
          <label className="mb-1 block text-sm font-medium">单次购券上限（张）</label>
          <input
            type="number"
            min="1"
            step="1"
            value={maxPerExchange}
            onChange={(e) => setMaxPerExchange(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每张券基准金</label>
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
          <label className="mb-1 block text-sm font-medium">金换 tcr 汇率（金 / 1 tcr）</label>
          <input
            type="number"
            min="1"
            step="1"
            value={goldPerTcr}
            onChange={(e) => setGoldPerTcr(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每日金换 tcr 上限（金）</label>
          <input
            type="number"
            min="0"
            step="1"
            value={dailyGold}
            onChange={(e) => setDailyGold(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">tcr 有效天数</label>
          <input
            type="number"
            min="1"
            step="1"
            value={tcrValidDays}
            onChange={(e) => setTcrValidDays(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">第一栏 · 活动券换金</p>
        {couponGoldOffers.map((item, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">孔明券（张）</label>
              <input
                type="number"
                min="1"
                step="1"
                value={item.tickets}
                onChange={(e) =>
                  setCouponGoldOffers((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, tickets: e.target.value } : row)),
                  )
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">到账金</label>
              <input
                type="number"
                min="1"
                step="1"
                value={item.gold}
                onChange={(e) =>
                  setCouponGoldOffers((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, gold: e.target.value } : row)),
                  )
                }
                className={FIELD_CLASS}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">第二栏 · 金换 tcr</p>
        {goldTcrOffers.map((item, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">消耗金</label>
              <input
                type="number"
                min="1"
                step="1"
                value={item.gold}
                onChange={(e) =>
                  setGoldTcrOffers((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, gold: e.target.value } : row)),
                  )
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">到账 tcr</label>
              <input
                type="number"
                min="1"
                step="1"
                value={item.tcr}
                onChange={(e) =>
                  setGoldTcrOffers((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, tcr: e.target.value } : row)),
                  )
                }
                className={FIELD_CLASS}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">兑换预览</p>
        <p className="mt-1 tabular-nums">
          1 张 = {preview.couponUnitCredits} cr；三档券价：
          {preview.couponGoldOffers.map((item) => `${item.tickets} 张→${item.gold} 金`).join(" / ")}
        </p>
        <p className="tabular-nums">
          三档金换 tcr：
          {preview.goldTcrOffers.map((item) => `${item.gold} 金→${item.tcr} tcr`).join(" / ")}
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存诸葛孔明传活动配置"}
      </Button>
    </form>
  );
}
