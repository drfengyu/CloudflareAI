"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TRIAL_MAX_FLOORS,
  sanitizeTrialConfig,
  type TrialConfig,
} from "@/lib/trial/config";
import { formatCredits } from "@/lib/billing/credits";
import { updateTrialSettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums";

function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

type TierRow = { correct: string; reward: string };

export function TrialForm({ initialConfig }: { initialConfig: TrialConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [questionCount, setQuestionCount] = useState(String(initialConfig.questionCount));
  const [price, setPrice] = useState(String(initialConfig.runPriceCredits));
  const [couponUnit, setCouponUnit] = useState(String(initialConfig.couponUnitCredits));
  const [validDays, setValidDays] = useState(String(initialConfig.rewardValidDays));
  const [tiers, setTiers] = useState<TierRow[]>(() =>
    initialConfig.tiers.map((tier) => ({ correct: String(tier.correct), reward: String(tier.reward) })),
  );
  const [loading, setLoading] = useState(false);

  const patchTier = (index: number, field: keyof TierRow, value: string) =>
    setTiers((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const preview = useMemo(
    () =>
      sanitizeTrialConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        questionCount: Number(questionCount),
        runPriceCredits: Number(price),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        tiers: tiers.map((row) => ({ correct: Number(row.correct), reward: Number(row.reward) })),
      }),
    [enabled, startAt, endAt, questionCount, price, couponUnit, validDays, tiers],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateTrialSettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        questionCount: Number(questionCount),
        runPriceCredits: Number(price),
        couponUnitCredits: Number(couponUnit),
        rewardValidDays: Number(validDays),
        tiers: tiers.map((row) => ({ correct: Number(row.correct), reward: Number(row.reward) })),
      });
      toast.success("每日试炼配置已保存");
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
          id="trial-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="trial-enabled" className="text-sm font-medium">
          开启每日试炼
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        三国讨逆传（剧情地点、敌将、随机种子）在出城时由服务端生成并落库；等级、金币、装备、武将、图鉴随剧情一直保留，
        收兵只上传编制/购物/战斗指令，由服务端按种子重放判定战果。修改开始时间等于开启新一轮活动，存档与战报按新轮次重计。
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium">每处地方营寨数</label>
          <input
            type="number"
            min={2}
            max={TRIAL_MAX_FLOORS}
            step="1"
            value={questionCount}
            onChange={(e) => setQuestionCount(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            2 ~ {TRIAL_MAX_FLOORS} 座营寨（野战 / 精英，末座为首帅本阵），大地图上可自由挑选攻打顺序
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每次出城军令（cr）</label>
          <input
            type="number"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
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
          <p className="mt-1 text-xs text-muted-foreground">兑换试炼券的单价</p>
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
        <div className="flex items-center justify-between gap-2">
          <label className="block text-sm font-medium">平定一处地方的奖励档位（tcr）</label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTiers((prev) => [...prev, { correct: "1", reward: "1" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            加一档
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          只有拔尽当前地方的全部营寨才发奖；按攻破的营寨数达到的最高档发放，未平定不发。
        </p>
        <div className="mt-2 space-y-2">
          {tiers.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                第 {index + 1} 档
              </span>
              <input
                type="number"
                min={1}
                step="1"
                value={row.correct}
                onChange={(e) => patchTier(index, "correct", e.target.value)}
                placeholder="节点数"
                className={FIELD_CLASS}
              />
              <input
                type="number"
                min={0}
                step="1"
                value={row.reward}
                onChange={(e) => patchTier(index, "reward", e.target.value)}
                placeholder="tcr"
                className={FIELD_CLASS}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTiers((prev) => prev.filter((_, i) => i !== index))}
                disabled={tiers.length <= 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">
          每处地方 {preview.questionCount} 处节点 · 每次出城 {preview.runPriceCredits} cr 军令（
          {Math.max(1, Math.round(preview.runPriceCredits / Math.max(1, preview.couponUnitCredits)))} 张券）
        </p>
        <p className="mt-1 text-muted-foreground">
          {preview.tiers
            .map((tier) => `攻克 ${tier.correct} 处 ${formatCredits(tier.reward)} tcr`)
            .join(" · ")}
          ；平定一处地方的奖励 {formatCredits(preview.tiers[preview.tiers.length - 1]?.reward ?? 0)} tcr。
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存每日试炼配置"}
      </Button>
    </form>
  );
}
