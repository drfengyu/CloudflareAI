"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  formatPrizeLabel,
  lotteryExpectation,
  outerPrizeCredits,
  round2,
  sanitizeLotteryConfig,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import { updateLotterySettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

interface InnerRow {
  /** 绝对 cr：券价是独立的利润率杠杆，所以这里不跟券价自动联动。 */
  credits: string;
  weight: string;
}
interface OuterRow {
  /** credits=按倍数结 cr；tickets=直接赠券。 */
  kind: "credits" | "tickets";
  multiplier: string;
  tickets: string;
  weight: string;
}
interface MilestoneRow {
  draws: string;
  tickets: string;
}

/** datetime-local 用 `T` 分隔，落库换回空格（与公告时间同一约定）。 */
function toField(date: string) {
  return date.trim().replace(" ", "T");
}
function toStored(date: string) {
  return date.trim().replace("T", " ");
}

export function LotteryForm({ initialConfig }: { initialConfig: LotteryConfig }) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [startAt, setStartAt] = useState(toField(initialConfig.startAt));
  const [endAt, setEndAt] = useState(toField(initialConfig.endAt));
  const [ticketPrice, setTicketPrice] = useState(String(initialConfig.ticketPriceCredits));
  const [outerChance, setOuterChance] = useState(String(initialConfig.outerChancePercent));
  const [multiplierBase, setMultiplierBase] = useState<"ticket" | "batch">(
    initialConfig.multiplierBase,
  );
  const [prizeValidDays, setPrizeValidDays] = useState(String(initialConfig.prizeValidDays));
  const [innerRows, setInnerRows] = useState<InnerRow[]>(() =>
    initialConfig.innerPrizes.map((p) => ({ credits: String(p.credits), weight: String(p.weight) })),
  );
  const [outerRows, setOuterRows] = useState<OuterRow[]>(() =>
    initialConfig.outerPrizes.map((p) => ({
      kind: p.kind ?? "credits",
      multiplier: String(p.multiplier),
      tickets: String(p.tickets || ""),
      weight: String(p.weight),
    })),
  );
  const [milestoneRows, setMilestoneRows] = useState<MilestoneRow[]>(() =>
    initialConfig.milestones.map((m) => ({ draws: String(m.draws), tickets: String(m.tickets) })),
  );
  const [loading, setLoading] = useState(false);

  /**
   * 表单当前值走一遍清洗，实时算期望与返还率；填到一半（空值/非数字）时退回默认值，不显示 NaN。
   * 清洗后的对象是「当前输入」的规范化版本，两圈金额都由它 × 券价现算，所以改券价、改外圈概率、
   * 改任一圈的倍率或权重都会让这块面板立刻重算。
   */
  const preview = useMemo(
    () =>
      sanitizeLotteryConfig({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        ticketPriceCredits: Number(ticketPrice),
        outerChancePercent: Number(outerChance),
        multiplierBase,
        prizeValidDays: Number(prizeValidDays),
        innerPrizes: innerRows.map((r) => ({
          credits: Number(r.credits),
          weight: Number(r.weight),
        })),
        outerPrizes: outerRows.map((r) => ({
          kind: r.kind,
          multiplier: Number(r.multiplier),
          tickets: Number(r.tickets),
          weight: Number(r.weight),
        })),
        milestones: milestoneRows.map((r) => ({ draws: Number(r.draws), tickets: Number(r.tickets) })),
      }),
    [
      enabled,
      startAt,
      endAt,
      ticketPrice,
      outerChance,
      multiplierBase,
      prizeValidDays,
      innerRows,
      outerRows,
      milestoneRows,
    ],
  );
  const exp = lotteryExpectation(preview);
  /** 券价相对「已保存的那份」变了才提示重算；比值用于把内圈按新券价等比放大/缩小。 */
  const savedPrice = initialConfig.ticketPriceCredits;
  const priceRatio =
    savedPrice > 0 && preview.ticketPriceCredits !== savedPrice
      ? preview.ticketPriceCredits / savedPrice
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateLotterySettings({
        enabled,
        startAt: toStored(startAt),
        endAt: toStored(endAt),
        ticketPriceCredits: Number(ticketPrice),
        outerChancePercent: Number(outerChance),
        multiplierBase,
        prizeValidDays: Number(prizeValidDays),
        innerPrizes: innerRows
          .filter((r) => r.credits.trim() !== "" || r.weight.trim() !== "")
          .map((r) => ({ credits: Number(r.credits), weight: Number(r.weight) })),
        outerPrizes: outerRows
          .filter(
            (r) =>
              r.multiplier.trim() !== "" || r.tickets.trim() !== "" || r.weight.trim() !== "",
          )
          .map((r) => ({
            kind: r.kind,
            multiplier: Number(r.multiplier),
            tickets: Number(r.tickets),
            weight: Number(r.weight),
          })),
        milestones: milestoneRows
          .filter((r) => r.draws.trim() !== "" || r.tickets.trim() !== "")
          .map((r) => ({ draws: Number(r.draws), tickets: Number(r.tickets) })),
      });
      toast.success("限时活动配置已保存");
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
          id="lottery-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="lottery-enabled" className="text-sm font-medium">
          开启限时活动
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        关闭后活动页只显示「活动未开启」，已发行的抽奖券保留到下次开启。
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
          <label className="mb-1 block text-sm font-medium">单券价（cr）</label>
          <input
            type="number"
            min={1}
            step="1"
            value={ticketPrice}
            onChange={(e) => setTicketPrice(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">外圈概率（%）</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={outerChance}
            onChange={(e) => setOuterChance(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">中奖有效期（天）</label>
          <input
            type="number"
            min={1}
            step="1"
            value={prizeValidDays}
            onChange={(e) => setPrizeValidDays(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">倍数基数</label>
          <select
            value={multiplierBase}
            onChange={(e) => setMultiplierBase(e.target.value as "ticket" | "batch")}
            className={FIELD_CLASS}
          >
            <option value="ticket">单张券价</option>
            <option value="batch">本次总花费</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">
          内圈期望 {exp.innerCredits} cr/次 · 外圈期望 {exp.outerCredits} cr/次 · 单券综合 {exp.perTicket} cr
        </p>
        <p className="mt-1">
          返还率 {exp.returnRate}%（期望返还 ÷ 单券价 {preview.ticketPriceCredits} cr），站点每券净得{" "}
          {exp.houseEdge} cr。超过 100% 表示每卖一张券站点净亏。
        </p>
        <p className="mt-1 text-muted-foreground">
          内圈是绝对 cr、外圈是倍数 × 券价，所以单券价是独立的利润率杠杆：券价调高而奖池不动，
          返还率就往下走。改券价、外圈概率、任一圈的数值或权重，上面两行都会立刻重算。
          {multiplierBase === "batch"
            ? "当前倍数以「本次总花费」为基数，10 连抽的每券期望约为单抽的 10 倍，这里的数字只是单抽口径。"
            : "按单券价计，10 连抽与单抽的每券期望相同。"}
        </p>
      </div>

      {priceRatio !== null && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 text-xs">
          <p className="text-muted-foreground">
            单券价从 {initialConfig.ticketPriceCredits} cr 改成了 {preview.ticketPriceCredits} cr。
            内圈金额默认不跟着动（这正是调利润率的方式）；想保持原来的手感，可以按新券价等比重算内圈。
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              setInnerRows((prev) =>
                prev.map((r) =>
                  r.credits.trim() === ""
                    ? r
                    : { ...r, credits: String(round2(Number(r.credits) * priceRatio)) },
                ),
              )
            }
          >
            按 ×{priceRatio.toFixed(2)} 重算内圈
          </Button>
        </div>
      )}

      <PrizeSection
        title="内圈奖品（固定加/减 cr）"
        hint="绝对 cr，不随券价自动缩放——券价因此是独立的利润率杠杆。扇区宽度按权重分配，权重同时决定中奖概率；负数直接从永久余额扣除，可能扣成负数。"
        columns={[
          { key: "credits", label: "cr 变动" },
          { key: "weight", label: "权重" },
        ]}
        rows={innerRows}
        setRows={setInnerRows}
        emptyRow={{ credits: "60", weight: "10" }}
      />

      <OuterPrizeSection rows={outerRows} setRows={setOuterRows} config={preview} />

      <PrizeSection
        title="累抽送券档位"
        hint="累计抽奖次数达到该值时赠送抽奖券，每人每档位只发一次。"
        columns={[
          { key: "draws", label: "累计次数" },
          { key: "tickets", label: "赠送张数" },
        ]}
        rows={milestoneRows}
        setRows={setMilestoneRows}
        emptyRow={{ draws: "10", tickets: "1" }}
      />

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存限时活动配置"}
      </Button>
    </form>
  );
}

interface Column<T> {
  key: keyof T & string;
  label: string;
}

function PrizeSection<T extends Record<string, string>>({
  title,
  hint,
  columns,
  rows,
  setRows,
  emptyRow,
}: {
  title: string;
  hint: string;
  columns: Column<T>[];
  rows: T[];
  setRows: React.Dispatch<React.SetStateAction<T[]>>;
  emptyRow: T;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, emptyRow])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          添加
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex items-center gap-2">
        {columns.map((col) => (
          <span key={col.key} className="flex-1 text-xs text-muted-foreground">
            {col.label}
          </span>
        ))}
        <span className="w-10" />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          暂无条目
        </p>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            {columns.map((col) => (
              <input
                key={col.key}
                type="number"
                step="any"
                value={row[col.key]}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, idx) => (idx === i ? { ...r, [col.key]: e.target.value } : r)),
                  )
                }
                placeholder={col.label}
                className={`${FIELD_CLASS} flex-1`}
              />
            ))}
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              title="删除这一行"
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/** 外圈两类奖品共用一套行编辑：类型决定哪一格可填，另一格禁用而不是偷偷清零。 */
function OuterPrizeSection({
  rows,
  setRows,
  config,
}: {
  rows: OuterRow[];
  setRows: React.Dispatch<React.SetStateAction<OuterRow[]>>;
  config: LotteryConfig;
}) {
  const patch = (i: number, next: Partial<OuterRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));

  /** 这一档实际值多少：赠券档给张数，cr 档按当前基数与抽数折算（batch 下 10 连是另一个数）。 */
  function note(row: OuterRow) {
    if (row.kind === "tickets") {
      const n = Math.trunc(Number(row.tickets));
      return n > 0 ? `+${n} 张券` : "—";
    }
    const m = Number(row.multiplier);
    if (!Number.isFinite(m) || row.multiplier.trim() === "") return "—";
    const single = formatPrizeLabel(outerPrizeCredits(config, m, 1));
    const batch = formatPrizeLabel(outerPrizeCredits(config, m, 10));
    return batch === single ? single : `${single} / 10连 ${batch}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">外圈奖品（倍数 cr / 赠送抽奖券）</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { kind: "credits", multiplier: "2", tickets: "", weight: "10" },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          添加
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        只有内圈指针停在「外圈入口」上才会抽这一圈。倍数档按上面的基数结算 cr（可为负）；
        赠券档只往券包里加张数、不动 cr，返还率里按券价 {config.ticketPriceCredits} cr 折算。权重同时决定扇区大小与中奖概率。
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-20 shrink-0">奖品类型</span>
        <span className="flex-1">倍数</span>
        <span className="flex-1">赠券张数</span>
        <span className="flex-1">权重</span>
        <span className="w-32 shrink-0">本档实际</span>
        <span className="w-10" />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          暂无条目
        </p>
      ) : (
        rows.map((row, i) => {
          const isTickets = row.kind === "tickets";
          return (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.kind}
                onChange={(e) => patch(i, { kind: e.target.value as OuterRow["kind"] })}
                className="w-20 shrink-0 rounded-lg border border-border bg-card px-2 py-2 text-sm"
              >
                <option value="credits">倍数 cr</option>
                <option value="tickets">赠券</option>
              </select>
              <input
                type="number"
                step="any"
                value={row.multiplier}
                disabled={isTickets}
                onChange={(e) => patch(i, { multiplier: e.target.value })}
                placeholder="如 2.5 或 -1"
                className={`${FIELD_CLASS} flex-1 disabled:opacity-40`}
              />
              <input
                type="number"
                min={1}
                step="1"
                value={row.tickets}
                disabled={!isTickets}
                onChange={(e) => patch(i, { tickets: e.target.value })}
                placeholder="张数"
                className={`${FIELD_CLASS} flex-1 disabled:opacity-40`}
              />
              <input
                type="number"
                step="any"
                value={row.weight}
                onChange={(e) => patch(i, { weight: e.target.value })}
                placeholder="权重"
                className={`${FIELD_CLASS} flex-1`}
              />
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{note(row)}</span>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                title="删除这一行"
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
