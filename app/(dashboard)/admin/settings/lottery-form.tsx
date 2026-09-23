"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  expectedReturnPerTicket,
  returnRatePercent,
  sanitizeLotteryConfig,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import { updateLotterySettings } from "./actions";

const FIELD_CLASS = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

interface InnerRow {
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

  /** 表单当前值走一遍清洗，实时算返还率；填到一半（空值/非数字）时退回默认值，不显示 NaN。 */
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
        innerPrizes: innerRows.map((r) => ({ credits: Number(r.credits), weight: Number(r.weight) })),
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
  const expected = expectedReturnPerTicket(preview);
  const rate = returnRatePercent(preview);

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
          单券期望返还 {expected} cr · 返还率 {rate}%
        </p>
        <p className="mt-1 text-muted-foreground">
          返还率 = 期望返还 ÷ 单券价。超过 100% 表示每卖一张券站点净亏；
          {multiplierBase === "batch"
            ? "当前倍数以「本次总花费」为基数，10 连抽的每券期望约为单抽的 10 倍，下面的数字只是单抽口径。"
            : "按单券价计，10 连抽与单抽的每券期望相同。"}
        </p>
      </div>

      <PrizeSection
        title="内圈奖品（固定加/减 cr）"
        hint="扇区宽度按权重分配，权重同时决定中奖概率；负数会从永久余额扣除。"
        columns={[
          { key: "credits", label: "cr 变动" },
          { key: "weight", label: "权重" },
        ]}
        rows={innerRows}
        setRows={setInnerRows}
        emptyRow={{ credits: "50", weight: "10" }}
      />

      <OuterPrizeSection rows={outerRows} setRows={setOuterRows} ticketPrice={preview.ticketPriceCredits} />

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
  ticketPrice,
}: {
  rows: OuterRow[];
  setRows: React.Dispatch<React.SetStateAction<OuterRow[]>>;
  ticketPrice: number;
}) {
  const patch = (i: number, next: Partial<OuterRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));

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
        赠券档只往券包里加张数、不动 cr，返还率里按券价 {ticketPrice} cr 折算。权重同时决定扇区大小与中奖概率。
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-24 shrink-0">奖品类型</span>
        <span className="flex-1">倍数</span>
        <span className="flex-1">赠券张数</span>
        <span className="flex-1">权重</span>
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
                className={`${FIELD_CLASS} w-24 shrink-0`}
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
