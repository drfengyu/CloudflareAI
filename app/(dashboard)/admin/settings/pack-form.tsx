"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatAmount } from "@/lib/billing/units";
import {
  COUPON_PACK_META,
  sanitizeCouponPackConfig,
  type CouponPackConfig,
  type CouponPackKey,
  type CouponPackSetting,
} from "@/lib/activity/pack-config";
import { updateCouponPackSettings } from "./actions";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm tabular-nums";
const PACK_KEYS: CouponPackKey[] = ["small", "medium", "large"];

type Row = { ratioPercent: string; dailyLimit: string; totalLimit: string };

function toRow(setting: CouponPackSetting): Row {
  return {
    ratioPercent: String(setting.ratioPercent),
    dailyLimit: String(setting.dailyLimit),
    totalLimit: String(setting.totalLimit),
  };
}

export function CouponPackForm({ initialConfig }: { initialConfig: CouponPackConfig }) {
  const [rows, setRows] = useState<Record<CouponPackKey, Row>>(() => ({
    small: toRow(initialConfig.small),
    medium: toRow(initialConfig.medium),
    large: toRow(initialConfig.large),
  }));
  const [loading, setLoading] = useState(false);

  const patchRow = (key: CouponPackKey, field: keyof Row, value: string) =>
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  /** 填到一半的非法值按默认值兜底，右侧预览不会闪 NaN。 */
  const preview = useMemo(
    () =>
      sanitizeCouponPackConfig({
        small: {
          ratioPercent: Number(rows.small.ratioPercent),
          dailyLimit: Number(rows.small.dailyLimit),
          totalLimit: Number(rows.small.totalLimit),
        },
        medium: {
          ratioPercent: Number(rows.medium.ratioPercent),
          dailyLimit: Number(rows.medium.dailyLimit),
          totalLimit: Number(rows.medium.totalLimit),
        },
        large: {
          ratioPercent: Number(rows.large.ratioPercent),
          dailyLimit: Number(rows.large.dailyLimit),
          totalLimit: Number(rows.large.totalLimit),
        },
      }),
    [rows],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateCouponPackSettings({
        packs: PACK_KEYS.map((key) => ({
          key,
          ratioPercent: Number(rows[key].ratioPercent),
          dailyLimit: Number(rows[key].dailyLimit),
          totalLimit: Number(rows[key].totalLimit),
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
        三档礼包由三个活动共用：倍率决定到账券面；限购按「用户 + 礼包」统计，0 = 不限；
        每日限购按北京时间自然日重置。实付价固定为各档身份，不随配置变化。
      </p>

      <div className="overflow-x-auto">
        <div className="min-w-[620px] space-y-2">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.9fr_1.2fr] gap-2 px-1 text-xs text-muted-foreground">
            <span>礼包 / 实付</span>
            <span>倍率（%）</span>
            <span>每日限购（份）</span>
            <span>累计限购（份）</span>
            <span>到账券面</span>
          </div>
          {PACK_KEYS.map((key) => {
            const meta = COUPON_PACK_META[key];
            const setting = preview[key];
            return (
              <div
                key={key}
                className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.9fr_1.2fr] items-center gap-2"
              >
                <div>
                  <p className="text-sm font-medium">{meta.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    实付 {formatAmount(meta.priceCredits)} cr
                  </p>
                </div>
                <input
                  type="number"
                  min={0.01}
                  step="1"
                  value={rows[key].ratioPercent}
                  onChange={(e) => patchRow(key, "ratioPercent", e.target.value)}
                  className={FIELD_CLASS}
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={rows[key].dailyLimit}
                  onChange={(e) => patchRow(key, "dailyLimit", e.target.value)}
                  className={FIELD_CLASS}
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={rows[key].totalLimit}
                  onChange={(e) => patchRow(key, "totalLimit", e.target.value)}
                  className={FIELD_CLASS}
                />
                <p className="text-sm tabular-nums">
                  <span className="text-muted-foreground">{setting.ratioPercent}%</span>
                  {" → "}
                  得 {formatAmount((meta.priceCredits * setting.ratioPercent) / 100)} cr
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中…" : "保存礼包配置"}
      </Button>
    </form>
  );
}
