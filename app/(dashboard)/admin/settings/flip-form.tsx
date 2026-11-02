"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FLIP_CARD_COUNT,
  FLIP_MAX_REWARD,
  flipExpectation,
  sanitizeFlipConfig,
  type FlipConfig,
} from "@/lib/flip/config";
import { updateFlipSettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums";

/** datetime-local 用 `T` 分隔，落库换回空格（与公告、转盘、雷电同一约定）。 */
function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

export function FlipForm({ initialConfig }: { initialConfig: FlipConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [price, setPrice] = useState(String(initialConfig.roundPriceCredits));
  const [validDays, setValidDays] = useState(String(initialConfig.rewardValidDays));
  const [dailyRounds, setDailyRounds] = useState(String(initialConfig.dailyRounds));
  const [cards, setCards] = useState<string[]>(() =>
    Array.from({ length: FLIP_CARD_COUNT }, (_, index) => String(initialConfig.cardRewards[index] ?? 0)),
  );
  const [loading, setLoading] = useState(false);

  const patchCard = (index: number, value: string) =>
    setCards((prev) => prev.map((row, i) => (i === index ? value : row)));

  /** 表单当前值的规范化版本：填到一半的非法数字退回默认值，下方摘要不会显示 NaN。 */
  const preview = useMemo(
    () =>
      sanitizeFlipConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        roundPriceCredits: Number(price),
        rewardValidDays: Number(validDays),
        dailyRounds: Number(dailyRounds),
        cardRewards: cards,
      }),
    [enabled, startAt, endAt, price, validDays, dailyRounds, cards],
  );
  const expectation = flipExpectation(preview);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateFlipSettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        roundPriceCredits: Number(price),
        rewardValidDays: Number(validDays),
        dailyRounds: Number(dailyRounds),
        cardRewards: cards.map((value) => Number(value)),
      });
      toast.success("翻牌夺宝配置已保存");
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
          id="flip-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="flip-enabled" className="text-sm font-medium">
          开启翻牌夺宝
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        关闭后活动页只显示「活动未开启」，已经翻完的牌局记录不受影响。修改开始时间等于开启新一轮活动，
        个人战绩与全站统计按新轮次重计。
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">每局票价（cr）</label>
          <input
            type="number"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">翻开一张牌要付的 cr</p>
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
          <p className="mt-1 text-xs text-muted-foreground">中奖 cr 进临时余额，到期作废</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">每日开局上限（局）</label>
          <input
            type="number"
            step="1"
            value={dailyRounds}
            onChange={(e) => setDailyRounds(e.target.value)}
            className={FIELD_CLASS}
          />
          <p className="mt-1 text-xs text-muted-foreground">按北京时间自然日重置</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">牌桌奖项（cr，共 {FLIP_CARD_COUNT} 张）</label>
        <p className="mt-1 text-xs text-muted-foreground">
          每格就是牌桌上第几张牌的金额，0 = 空牌。开局时服务端把这 {FLIP_CARD_COUNT}
          格洗乱后落到位置上，所以格子的先后顺序不影响赔率。上限 {FLIP_MAX_REWARD} cr。
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                第 {index + 1} 张
              </span>
              <input
                type="number"
                step="1"
                value={value}
                onChange={(e) => patchCard(index, e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">
          奖项合计 {expectation.boardTotal} cr · 每局期望 {expectation.expectedPerRound} cr · 返还率{" "}
          {expectation.returnRatePercent}% · 站点每局净回收 {expectation.houseEdge} cr
        </p>
        <p className="mt-1 text-muted-foreground">
          期望 = 合计 ÷ {FLIP_CARD_COUNT}，是精确值而不是模拟值：每局都从完整的一副牌里翻一张。
          牌桌上 {expectation.winningCards} 张有奖，中奖概率 {expectation.hitChancePercent}%。
          每日上限 {preview.dailyRounds} 局，最多回收{" "}
          {Math.round(preview.dailyRounds * preview.roundPriceCredits * 100) / 100} cr 票价。
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存翻牌夺宝配置"}
      </Button>
    </form>
  );
}
