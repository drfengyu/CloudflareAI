"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/billing/units";
import {
  MAX_COUPON_PACKS,
  MAX_PACK_NAME,
  sanitizeCouponPackConfig,
  type CouponPackConfig,
  type CouponPackSetting,
} from "@/lib/activity/pack-config";
import { cn } from "@/lib/utils";
import { updateCouponPackSettings } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm tabular-nums";

type Row = {
  key: string;
  name: string;
  priceCredits: string;
  ratioPercent: string;
  dailyLimit: string;
  totalLimit: string;
  bonusTickets: string;
  tempCredits: string;
  tempValidDays: string;
};

function toRow(setting: CouponPackSetting): Row {
  return {
    key: setting.key,
    name: setting.name,
    priceCredits: String(setting.priceCredits),
    ratioPercent: String(setting.ratioPercent),
    dailyLimit: String(setting.dailyLimit),
    totalLimit: String(setting.totalLimit),
    bonusTickets: String(setting.bonusTickets),
    tempCredits: String(setting.tempCredits),
    tempValidDays: String(setting.tempValidDays),
  };
}

function blankRow(index: number): Row {
  return {
    key: "",
    name: `档位 ${index + 1}`,
    priceCredits: "10",
    ratioPercent: "200",
    dailyLimit: "0",
    totalLimit: "0",
    bonusTickets: "1",
    tempCredits: "0",
    tempValidDays: "30",
  };
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block space-y-1 text-[11px] text-muted-foreground", className)}>
      <span className="block">{label}</span>
      {children}
    </label>
  );
}

export function CouponPackForm({ initialConfig }: { initialConfig: CouponPackConfig }) {
  const [rows, setRows] = useState<Row[]>(() => initialConfig.packs.map(toRow));
  const [loading, setLoading] = useState(false);

  const patchRow = (index: number, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const addRow = () =>
    setRows((prev) =>
      prev.length >= MAX_COUPON_PACKS ? prev : [...prev, blankRow(prev.length)],
    );

  const removeRow = (index: number) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  /** 填到一半的非法值按默认值兜底，预览不会闪 NaN。 */
  const preview = useMemo(
    () =>
      sanitizeCouponPackConfig({
        packs: rows.map((row) => ({
          key: row.key || undefined,
          name: row.name,
          priceCredits: Number(row.priceCredits),
          ratioPercent: Number(row.ratioPercent),
          dailyLimit: Number(row.dailyLimit),
          totalLimit: Number(row.totalLimit),
          bonusTickets: Number(row.bonusTickets),
          tempCredits: Number(row.tempCredits),
          tempValidDays: Number(row.tempValidDays),
        })),
      }),
    [rows],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateCouponPackSettings({
        packs: rows.map((row) => ({
          key: row.key || undefined,
          name: row.name,
          priceCredits: Number(row.priceCredits),
          ratioPercent: Number(row.ratioPercent),
          dailyLimit: Number(row.dailyLimit),
          totalLimit: Number(row.totalLimit),
          bonusTickets: Number(row.bonusTickets),
          tempCredits: Number(row.tempCredits),
          tempValidDays: Number(row.tempValidDays),
        })),
      });
      toast.success("珍宝礼包配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        档位由三个活动共用，可增删（最多 {MAX_COUPON_PACKS} 个）：倍率决定到账券面；
        限购按「用户 + 档位」统计，0 = 不限，每日限购按北京时间自然日重置；
        赠券按活动当期券面单价折算入账；赠 tcr 进入临时余额，到期作废。
      </p>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const setting = preview.packs[index] ?? preview.packs[0];
          const baseCredits = (setting.priceCredits * setting.ratioPercent) / 100;
          return (
            <div key={index} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {row.name.trim() || `档位 ${index + 1}`}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {row.key ? "已有档位" : "新档位"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="名称" className="col-span-2">
                  <input
                    value={row.name}
                    maxLength={MAX_PACK_NAME}
                    onChange={(e) => patchRow(index, "name", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="实付（cr）">
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={row.priceCredits}
                    onChange={(e) => patchRow(index, "priceCredits", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="倍率（%）">
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={row.ratioPercent}
                    onChange={(e) => patchRow(index, "ratioPercent", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="每日限购（份）">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={row.dailyLimit}
                    onChange={(e) => patchRow(index, "dailyLimit", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="累计限购（份）">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={row.totalLimit}
                    onChange={(e) => patchRow(index, "totalLimit", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="赠券张数">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={row.bonusTickets}
                    onChange={(e) => patchRow(index, "bonusTickets", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="赠 tcr">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.tempCredits}
                    onChange={(e) => patchRow(index, "tempCredits", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label="tcr 有效期（天）">
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={row.tempValidDays}
                    onChange={(e) => patchRow(index, "tempValidDays", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <div className="col-span-2 flex items-end sm:col-span-3 lg:col-span-3">
                  <p className="w-full rounded-lg bg-secondary/40 px-2.5 py-1.5 text-xs tabular-nums">
                    得 <span className="font-medium">{formatAmount(baseCredits)} cr</span>
                    {setting.bonusTickets > 0 ? (
                      <span className="text-success"> + {setting.bonusTickets} 张券</span>
                    ) : null}
                    {setting.tempCredits > 0 ? (
                      <span className="text-primary">
                        {" "}
                        + {formatAmount(setting.tempCredits)} tcr（{setting.tempValidDays} 天）
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={rows.length >= MAX_COUPON_PACKS}
        >
          <Plus className="h-3.5 w-3.5" />
          添加档位
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "保存中…" : "保存礼包配置"}
        </Button>
      </div>
    </form>
  );
}
