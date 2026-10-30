"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  loadoutCost,
  RAIDEN_ITEMS,
  RAIDEN_STAGES,
  sanitizeRaidenConfig,
  type RaidenConfig,
  type RaidenItemKey,
} from "@/lib/raiden/config";
import { updateRaidenSettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

/** datetime-local 用 `T` 分隔，落库换回空格（与公告、转盘时间同一约定）。 */
function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

interface NumberFieldRow {
  key: keyof NumberFields;
  label: string;
  hint: string;
  min: number;
  max: number;
}
interface NumberFields {
  dailyRuns: string;
  rewardValidDays: string;
  repeatDailyCap: string;
  revivePriceCredits: string;
  maxRevives: string;
  minStageSeconds: string;
  maxStageSeconds: string;
}

const NUMBER_FIELDS: NumberFieldRow[] = [
  {
    key: "dailyRuns",
    label: "每日出击次数",
    hint: "按北京时间自然日重置",
    min: 1,
    max: 100,
  },
  {
    key: "rewardValidDays",
    label: "奖励有效期（天）",
    hint: "通关奖励进临时余额",
    min: 1,
    max: 3650,
  },
  {
    key: "repeatDailyCap",
    label: "重复奖励每日封顶（cr）",
    hint: "首通不受此限，0 = 关闭重复奖励",
    min: 0,
    max: 1_000_000,
  },
  {
    key: "revivePriceCredits",
    label: "复活价格（cr）",
    hint: "阵亡后原地复活的价格",
    min: 1,
    max: 1_000_000,
  },
  {
    key: "maxRevives",
    label: "单局最多复活次数",
    hint: "0 = 本局不支持复活",
    min: 0,
    max: 10,
  },
  {
    key: "minStageSeconds",
    label: "单关最短用时（秒）",
    hint: "服务端结算下限，防瞬通",
    min: 5,
    max: 600,
  },
  {
    key: "maxStageSeconds",
    label: "单关最长用时（秒）",
    hint: "超过则结算失败",
    min: 120,
    max: 7200,
  },
];

export function RaidenForm({ initialConfig }: { initialConfig: RaidenConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [numbers, setNumbers] = useState<NumberFields>(() => ({
    dailyRuns: String(initialConfig.dailyRuns),
    rewardValidDays: String(initialConfig.rewardValidDays),
    repeatDailyCap: String(initialConfig.repeatDailyCap),
    revivePriceCredits: String(initialConfig.revivePriceCredits),
    maxRevives: String(initialConfig.maxRevives),
    minStageSeconds: String(initialConfig.minStageSeconds),
    maxStageSeconds: String(initialConfig.maxStageSeconds),
  }));
  const [items, setItems] = useState<Record<RaidenItemKey, { price: string; max: string }>>(
    () => ({
      weapon: {
        price: String(initialConfig.items.weapon.price),
        max: String(initialConfig.items.weapon.max),
      },
      bomb: {
        price: String(initialConfig.items.bomb.price),
        max: String(initialConfig.items.bomb.max),
      },
      shield: {
        price: String(initialConfig.items.shield.price),
        max: String(initialConfig.items.shield.max),
      },
      life: {
        price: String(initialConfig.items.life.price),
        max: String(initialConfig.items.life.max),
      },
    }),
  );
  const [stages, setStages] = useState(() =>
    [1, 2, 3].map((no) => {
      const row = initialConfig.stages.find((s) => s.stage === no);
      return {
        firstClear: String(row?.firstClear ?? 0),
        repeat: String(row?.repeat ?? 0),
      };
    }),
  );
  const [loading, setLoading] = useState(false);

  const setField = (key: keyof NumberFields, value: string) =>
    setNumbers((prev) => ({ ...prev, [key]: value }));
  const patchItem = (key: RaidenItemKey, next: Partial<{ price: string; max: string }>) =>
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
  const patchStage = (index: number, next: Partial<{ firstClear: string; repeat: string }>) =>
    setStages((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));

  /** 表单当前值的规范化版本：填到一半的非法数字退回默认值，下方摘要不会显示 NaN。 */
  const preview = useMemo(
    () =>
      sanitizeRaidenConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        dailyRuns: Number(numbers.dailyRuns),
        rewardValidDays: Number(numbers.rewardValidDays),
        repeatDailyCap: Number(numbers.repeatDailyCap),
        revivePriceCredits: Number(numbers.revivePriceCredits),
        maxRevives: Number(numbers.maxRevives),
        minStageSeconds: Number(numbers.minStageSeconds),
        maxStageSeconds: Number(numbers.maxStageSeconds),
        items: Object.fromEntries(
          RAIDEN_ITEMS.map((item) => [
            item.key,
            { price: Number(items[item.key].price), max: Number(items[item.key].max) },
          ]),
        ),
        stages: stages.map((row, i) => ({
          stage: i + 1,
          firstClear: Number(row.firstClear),
          repeat: Number(row.repeat),
        })),
      }),
    [enabled, startAt, endAt, numbers, items, stages],
  );

  const fullCost = loadoutCost(preview, {
    weapon: preview.items.weapon.max,
    bomb: preview.items.bomb.max,
    shield: preview.items.shield.max > 0,
    life: preview.items.life.max,
  });
  const firstClearTotal = preview.stages.reduce((sum, s) => sum + s.firstClear, 0);
  const repeatTotal = preview.stages.reduce((sum, s) => sum + s.repeat, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateRaidenSettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        dailyRuns: Number(numbers.dailyRuns),
        rewardValidDays: Number(numbers.rewardValidDays),
        repeatDailyCap: Number(numbers.repeatDailyCap),
        revivePriceCredits: Number(numbers.revivePriceCredits),
        maxRevives: Number(numbers.maxRevives),
        minStageSeconds: Number(numbers.minStageSeconds),
        maxStageSeconds: Number(numbers.maxStageSeconds),
        items: {
          weapon: { price: Number(items.weapon.price), max: Number(items.weapon.max) },
          bomb: { price: Number(items.bomb.price), max: Number(items.bomb.max) },
          shield: { price: Number(items.shield.price), max: Number(items.shield.max) },
          life: { price: Number(items.life.price), max: Number(items.life.max) },
        },
        stages: stages.map((row, i) => ({
          stage: i + 1,
          firstClear: Number(row.firstClear),
          repeat: Number(row.repeat),
        })),
      });
      toast.success("雷电行动配置已保存");
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
          id="raiden-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="raiden-enabled" className="text-sm font-medium">
          开启雷电行动
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        关闭后活动页只显示「活动未开启」；已通关的进度与奖励不受影响。修改开始时间等于开启新一轮活动，
        首通进度按新轮次重新计算。
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
        {NUMBER_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-sm font-medium">{field.label}</label>
            <input
              type="number"
              min={field.min}
              max={field.max}
              step="1"
              value={numbers[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
              className={FIELD_CLASS}
            />
            <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">道具商店（cr）</p>
        <p className="text-xs text-muted-foreground">
          用户在出击前用 cr 购买装备，服务端按同一份配置计价。超过引擎上限（火力 10 / 炸弹 10 /
          护盾 1 / 备用机体 10）的值会被自动裁剪。
        </p>
        {RAIDEN_ITEMS.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <div className="min-w-40 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs text-muted-foreground">价格（cr）</label>
              <input
                type="number"
                min={1}
                step="1"
                value={items[item.key].price}
                onChange={(e) => patchItem(item.key, { price: e.target.value })}
                className={FIELD_CLASS}
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs text-muted-foreground">单局上限</label>
              <input
                type="number"
                min={0}
                max={item.kind === "toggle" ? 1 : 10}
                step="1"
                value={items[item.key].max}
                onChange={(e) => patchItem(item.key, { max: e.target.value })}
                className={FIELD_CLASS}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">关卡奖励（cr）</p>
        <p className="text-xs text-muted-foreground">
          首通奖励每个活动轮次每关只发一次；重复通关奖励每天合计不超过上方的每日封顶。
          奖励全部进临时余额，到期时间按「奖励有效期」计算。
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-1">关卡</span>
          <span className="w-40">首通奖励</span>
          <span className="w-40">重复通关</span>
        </div>
        {RAIDEN_STAGES.map((meta, index) => (
          <div key={meta.no} className="flex items-center gap-2">
            <span className="flex-1 text-sm">
              {meta.code} · {meta.name}
              <span className="ml-2 text-xs text-muted-foreground">BOSS：{meta.boss}</span>
            </span>
            <input
              type="number"
              min={0}
              step="1"
              value={stages[index].firstClear}
              onChange={(e) => patchStage(index, { firstClear: e.target.value })}
              className={`${FIELD_CLASS} w-40`}
            />
            <input
              type="number"
              min={0}
              step="1"
              value={stages[index].repeat}
              onChange={(e) => patchStage(index, { repeat: e.target.value })}
              className={`${FIELD_CLASS} w-40`}
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">
          满配出击 {fullCost} cr · 三关首通合计 {firstClearTotal} cr · 三关重复通关合计 {repeatTotal} cr
        </p>
        <p className="mt-1 text-muted-foreground">
          每日 {preview.dailyRuns} 次出击 × 满配 {fullCost} cr = 最多回收 {preview.dailyRuns * fullCost} cr
          的装备消耗；重复奖励封顶 {preview.repeatDailyCap} cr/天。复活 {preview.revivePriceCredits} cr/次、
          最多 {preview.maxRevives} 次。结算时会校验单关用时在 {preview.minStageSeconds} ~{" "}
          {preview.maxStageSeconds} 秒之间。
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存雷电行动配置"}
      </Button>
    </form>
  );
}
