"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CONSTELLATIONS,
  sanitizeCollectionConfig,
  type CollectionConfig,
} from "@/lib/collection/config";
import { updateCollectionSettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums";

function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

export function CollectionForm({ initialConfig }: { initialConfig: CollectionConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [dailyObserves, setDailyObserves] = useState(String(initialConfig.dailyObserves));
  const [observeCost, setObserveCost] = useState(String(initialConfig.observeCostCredits));
  const [couponUnit, setCouponUnit] = useState(String(initialConfig.couponUnitCredits));
  const [validDays, setValidDays] = useState(String(initialConfig.rewardValidDays));
  const [resonanceReward, setResonanceReward] = useState(String(initialConfig.resonanceReward));
  const [setRewards, setSetRewards] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CONSTELLATIONS.map((set) => [
        set.key,
        String(initialConfig.setRewards.find((item) => item.set === set.key)?.reward ?? 0),
      ]),
    ),
  );
  const [loading, setLoading] = useState(false);

  const preview = useMemo(
    () =>
      sanitizeCollectionConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        dailyObserves: Number(dailyObserves),
        observeCostCredits: Number(observeCost),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        resonanceReward: Number(resonanceReward),
        setRewards: CONSTELLATIONS.map((set) => ({
          set: set.key,
          reward: Number(setRewards[set.key] ?? 0),
        })),
      }),
    [
      enabled,
      startAt,
      endAt,
      dailyObserves,
      observeCost,
      couponUnit,
      validDays,
      resonanceReward,
      setRewards,
    ],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateCollectionSettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        dailyObserves: Number(dailyObserves),
        observeCostCredits: Number(observeCost),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        resonanceReward: Number(resonanceReward),
        setRewards: CONSTELLATIONS.map((set) => ({
          set: set.key,
          reward: Number(setRewards[set.key] ?? 0),
        })),
      });
      toast.success("星图共鸣配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <input
          id="collection-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="collection-enabled" className="text-sm font-medium">
          开启星图共鸣
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        三张星座各 9 个星位：观星得到「颜色 + 亮度」星石，嵌入同色且亮度足够的星位点亮它，相邻星位都亮
        自动连线；整张星座点亮发一次 tcr，并可按天对每座已完成星座共鸣领奖。修改开始时间等于开启新一轮
        活动，星石、星辉与已点亮星位按新轮次重计。
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">每日观星次数</label>
          <input
            type="number"
            min={1}
            step="1"
            value={dailyObserves}
            onChange={(e) => setDailyObserves(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">按北京时间自然日重置</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单次观星票价（cr）</label>
          <input
            type="number"
            step="1"
            value={observeCost}
            onChange={(e) => setObserveCost(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">必须是券单价的整数倍</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">1 张活动券 = cr</label>
          <input
            type="number"
            min={1}
            step="1"
            value={couponUnit}
            onChange={(e) => setCouponUnit(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">兑换星图券的单价</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每日共鸣（tcr / 座）</label>
          <input
            type="number"
            min={0}
            step="1"
            value={resonanceReward}
            onChange={(e) => setResonanceReward(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">每座已完成星座每天可领一次</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">奖励有效期（天）</label>
          <input
            type="number"
            step="1"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">奖励发 tcr，到期作废</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">完成星座奖励（tcr）</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {CONSTELLATIONS.map((set) => (
            <div key={set.key}>
              <label className="mb-1 block text-xs text-muted-foreground">
                {set.name}（{set.nodes.length} 个星位）
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={setRewards[set.key] ?? "0"}
                onChange={(e) =>
                  setSetRewards((prev) => ({ ...prev, [set.key]: e.target.value }))
                }
                className={FIELD_CLASS}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">
          每日 {preview.dailyObserves} 次观星 · 单次 {preview.observeCostCredits} cr（
          {Math.max(1, Math.round(preview.observeCostCredits / Math.max(1, preview.couponUnitCredits)))} 张券）·
          每日共鸣 {preview.resonanceReward} tcr / 座
        </p>
        <p className="mt-1 text-muted-foreground">
          完成奖励：
          {preview.setRewards
            .map((item) => {
              const set = CONSTELLATIONS.find((entry) => entry.key === item.set);
              return `${set?.name ?? item.set} ${item.reward} tcr`;
            })
            .join(" · ")}
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存星图共鸣配置"}
      </Button>
    </form>
  );
}
