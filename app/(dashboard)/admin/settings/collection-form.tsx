"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  COLLECTION_SETS,
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
  const [dailyBoxes, setDailyBoxes] = useState(String(initialConfig.dailyBoxes));
  const [openCost, setOpenCost] = useState(String(initialConfig.openCostCredits));
  const [couponUnit, setCouponUnit] = useState(String(initialConfig.couponUnitCredits));
  const [validDays, setValidDays] = useState(String(initialConfig.rewardValidDays));
  const [duplicateDust, setDuplicateDust] = useState(String(initialConfig.duplicateDust));
  const [dustPerItem, setDustPerItem] = useState(String(initialConfig.dustPerItem));
  const [setRewards, setSetRewards] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      COLLECTION_SETS.map((set) => [
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
        dailyBoxes: Number(dailyBoxes),
        openCostCredits: Number(openCost),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        duplicateDust: Number(duplicateDust),
        dustPerItem: Number(dustPerItem),
        setRewards: COLLECTION_SETS.map((set) => ({
          set: set.key,
          reward: Number(setRewards[set.key] ?? 0),
        })),
      }),
    [
      enabled,
      startAt,
      endAt,
      dailyBoxes,
      openCost,
      couponUnit,
      validDays,
      duplicateDust,
      dustPerItem,
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
        dailyBoxes: Number(dailyBoxes),
        openCostCredits: Number(openCost),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        duplicateDust: Number(duplicateDust),
        dustPerItem: Number(dustPerItem),
        setRewards: COLLECTION_SETS.map((set) => ({
          set: set.key,
          reward: Number(setRewards[set.key] ?? 0),
        })),
      });
      toast.success("星匣图鉴配置已保存");
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
          开启星匣图鉴
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        三个星匣各 6 件藏品，开匣先等概率选星匣再按权重抽藏品；重复折算星尘，星尘可定向补缺。
        修改开始时间等于开启新一轮活动，图鉴与集齐奖励按新轮次重计。
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
          <label className="mb-1 block text-sm font-medium">每日开匣次数</label>
          <input
            type="number"
            min={1}
            step="1"
            value={dailyBoxes}
            onChange={(e) => setDailyBoxes(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">按北京时间自然日重置</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单次开匣票价（cr）</label>
          <input
            type="number"
            step="1"
            value={openCost}
            onChange={(e) => setOpenCost(e.target.value)}
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
          <p className="mt-1 text-xs text-muted-foreground">兑换星匣券的单价</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">重复藏品折算星尘</label>
          <input
            type="number"
            min={0}
            step="1"
            value={duplicateDust}
            onChange={(e) => setDuplicateDust(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">抽到已收录藏品时给多少星尘</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">定向兑换所需星尘</label>
          <input
            type="number"
            min={1}
            step="1"
            value={dustPerItem}
            onChange={(e) => setDustPerItem(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">换一件指定未收录藏品</p>
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
          <p className="mt-1 text-xs text-muted-foreground">集齐奖励发 tcr，到期作废</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">集齐奖励（tcr）</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {COLLECTION_SETS.map((set) => (
            <div key={set.key}>
              <label className="mb-1 block text-xs text-muted-foreground">
                {set.name}（{set.items.length} 件）
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
          每日 {preview.dailyBoxes} 次 · 单次 {preview.openCostCredits} cr（
          {Math.max(1, Math.round(preview.openCostCredits / Math.max(1, preview.couponUnitCredits)))} 张券）·
          重复 +{preview.duplicateDust} 星尘 · 定向 {preview.dustPerItem} 星尘
        </p>
        <p className="mt-1 text-muted-foreground">
          集齐奖励：
          {preview.setRewards
            .map((item) => {
              const set = COLLECTION_SETS.find((entry) => entry.key === item.set);
              return `${set?.name ?? item.set} ${item.reward} tcr`;
            })
            .join(" · ")}
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存星匣图鉴配置"}
      </Button>
    </form>
  );
}
