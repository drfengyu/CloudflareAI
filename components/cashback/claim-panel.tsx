"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { claimCashbackAction } from "@/app/(dashboard)/cashback/actions";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnDate } from "@/lib/date";
import type { CashbackDay } from "@/lib/cashback/claims";

/** 可领清单：一天一行，点「领取」后由服务端重算当日消费再发钱。 */
export function CashbackClaimPanel({ days }: { days: CashbackDay[] }) {
  const router = useRouter();
  const [busyDate, setBusyDate] = useState<string | null>(null);

  async function onClaim(date: string) {
    if (busyDate) return;
    setBusyDate(date);
    const res = await claimCashbackAction({ date });
    setBusyDate(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {days.map((d) => (
        <div
          key={d.date}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium tabular-nums">{formatCnDate(d.date)}</p>
            <p className="text-xs text-muted-foreground">
              当日消费 {formatCredits(d.consumed)} cr
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-success tabular-nums">
              +{formatCredits(d.reward)} cr
            </span>
            {d.claimable ? (
              <Button
                size="sm"
                disabled={busyDate !== null}
                onClick={() => void onClaim(d.date)}
              >
                {busyDate === d.date ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                领取
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {d.note === "已领取" ? <Check className="h-3.5 w-3.5" /> : null}
                {d.note || "不可领"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
