"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  WORKSHOP_TIER_COUNT,
  sanitizeWorkshopConfig,
  type WorkshopConfig,
} from "@/lib/workshop/config";
import { formatCredits } from "@/lib/billing/credits";
import { updateWorkshopSettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums";

function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

function ticketCount(cost: number, unit: number) {
  return Math.max(1, Math.round(cost / Math.max(1, unit)));
}

type MilestoneRow = { tier: string; reward: string };

export function WorkshopForm({ initialConfig }: { initialConfig: WorkshopConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [dailyExplores, setDailyExplores] = useState(String(initialConfig.dailyExplores));
  const [exploreCost, setExploreCost] = useState(String(initialConfig.exploreCostCredits));
  const [runMaxSteps, setRunMaxSteps] = useState(String(initialConfig.runMaxSteps));
  const [runMaxEncounters, setRunMaxEncounters] = useState(String(initialConfig.runMaxEncounters));
  const [dailyGyms, setDailyGyms] = useState(String(initialConfig.dailyGyms));
  const [gymCost, setGymCost] = useState(String(initialConfig.gymCostCredits));
  const [couponUnit, setCouponUnit] = useState(String(initialConfig.couponUnitCredits));
  const [validDays, setValidDays] = useState(String(initialConfig.rewardValidDays));
  const [milestones, setMilestones] = useState<MilestoneRow[]>(() =>
    initialConfig.milestones.map((item) => ({ tier: String(item.tier), reward: String(item.reward) })),
  );
  const [loading, setLoading] = useState(false);

  const patchMilestone = (index: number, field: keyof MilestoneRow, value: string) =>
    setMilestones((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const preview = useMemo(
    () =>
      sanitizeWorkshopConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        dailyExplores: Number(dailyExplores),
        exploreCostCredits: Number(exploreCost),
        runMaxSteps: Number(runMaxSteps),
        runMaxEncounters: Number(runMaxEncounters),
        dailyGyms: Number(dailyGyms),
        gymCostCredits: Number(gymCost),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        milestones: milestones.map((row) => ({ tier: Number(row.tier), reward: Number(row.reward) })),
      }),
    [enabled, startAt, endAt, dailyExplores, exploreCost, runMaxSteps, runMaxEncounters, dailyGyms, gymCost, couponUnit, validDays, milestones],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateWorkshopSettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        dailyExplores: Number(dailyExplores),
        exploreCostCredits: Number(exploreCost),
        runMaxSteps: Number(runMaxSteps),
        runMaxEncounters: Number(runMaxEncounters),
        dailyGyms: Number(dailyGyms),
        gymCostCredits: Number(gymCost),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        milestones: milestones.map((row) => ({ tier: Number(row.tier), reward: Number(row.reward) })),
      });
      toast.success("灵宠工坊配置已保存");
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
          id="workshop-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="workshop-enabled" className="text-sm font-medium">
          开启灵宠工坊
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        红白机式养成：开局三选一，探索遇敌、捕捉升级、进化到九阶，三个道馆按徽章顺序解锁更深区域。
        同阶合成保留为加速路线，不花券。修改开始时间等于开启新一轮活动，灵宠与里程碑按新轮次重计。
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
          <label className="mb-1 block text-sm font-medium">每日进图次数</label>
          <input
            type="number"
            min={1}
            step="1"
            value={dailyExplores}
            onChange={(e) => setDailyExplores(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">按北京时间自然日重置</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单次进图票价（cr）</label>
          <input
            type="number"
            step="1"
            value={exploreCost}
            onChange={(e) => setExploreCost(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">必须是券单价的整数倍</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单趟步数上限</label>
          <input
            type="number"
            min={20}
            step="1"
            value={runMaxSteps}
            onChange={(e) => setRunMaxSteps(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">一次进图最多走多少步，走满自动收兵</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单趟遇敌上限</label>
          <input
            type="number"
            min={1}
            step="1"
            value={runMaxEncounters}
            onChange={(e) => setRunMaxEncounters(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">一张图最多摇出多少只野生灵宠</p>
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
          <p className="mt-1 text-xs text-muted-foreground">探索与道馆共用这张券</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每日道馆次数</label>
          <input
            type="number"
            min={1}
            step="1"
            value={dailyGyms}
            onChange={(e) => setDailyGyms(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">三个道馆共用次数</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">单次道馆票价（cr）</label>
          <input
            type="number"
            step="1"
            value={gymCost}
            onChange={(e) => setGymCost(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">胜利额外掉落 2 球 + 2 药水</p>
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
          <p className="mt-1 text-xs text-muted-foreground">里程碑发 tcr，到期作废</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="block text-sm font-medium">里程碑（任意一条线达到即发 tcr）</label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMilestones((prev) => [...prev, { tier: "1", reward: "1" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            加一档
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">阶数 1~{WORKSHOP_TIER_COUNT}，同档位重复只保留第一行。</p>
        <div className="mt-2 space-y-2">
          {milestones.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                第 {index + 1} 档
              </span>
              <input
                type="number"
                min={1}
                max={WORKSHOP_TIER_COUNT}
                step="1"
                value={row.tier}
                onChange={(e) => patchMilestone(index, "tier", e.target.value)}
                placeholder="达到阶数"
                className={FIELD_CLASS}
              />
              <input
                type="number"
                min={0}
                step="1"
                value={row.reward}
                onChange={(e) => patchMilestone(index, "reward", e.target.value)}
                placeholder="tcr"
                className={FIELD_CLASS}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMilestones((prev) => prev.filter((_, i) => i !== index))}
                disabled={milestones.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">
          每日探索 {preview.dailyExplores} 次 · 单次 {formatCredits(preview.exploreCostCredits)} cr（
          {ticketCount(preview.exploreCostCredits, preview.couponUnitCredits)} 张券）· 每日道馆{" "}
          {preview.dailyGyms} 次 · 单次 {formatCredits(preview.gymCostCredits)} cr（
          {ticketCount(preview.gymCostCredits, preview.couponUnitCredits)} 张券）
        </p>
        <p className="mt-1 text-muted-foreground">
          {preview.milestones
            .map((item) => `${item.tier} 阶 ${formatCredits(item.reward)} tcr`)
            .join(" · ") || "未配置里程碑"}
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存灵宠工坊配置"}
      </Button>
    </form>
  );
}
