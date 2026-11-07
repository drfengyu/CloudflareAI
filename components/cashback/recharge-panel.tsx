"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendRechargeTierRewardAction } from "@/app/(dashboard)/cashback/actions";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import type { RechargeActivityView } from "@/lib/rewards/claims";

/** 阶梯列表：每个达标档位单独发放一次，奖励先发站内信，领取后才到临时余额。 */
export function RechargeTierPanel({ activity }: { activity: RechargeActivityView }) {
  const router = useRouter();
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const nextTier = activity.tiers.find((tier) => !tier.met);
  const progress = nextTier
    ? Math.min(100, Math.round((activity.cumulative / nextTier.minCny) * 100))
    : 100;

  async function onSend(tierKey: string) {
    if (busyTier) return;
    setBusyTier(tierKey);
    const res = await sendRechargeTierRewardAction({ tierKey });
    setBusyTier(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">本期累计实付</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatCredits(activity.cumulative)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {nextTier
            ? `再累计 ${formatCredits(nextTier.gap)} 可达 ${formatCredits(nextTier.minCny)} 档`
            : "已达成全部档位"}
        </p>
      </div>

      <div className="space-y-2">
        {activity.tiers.map((tier) => (
          <div
            key={tier.tierKey}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              tier.met ? "border-primary/30 bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                累计满 {formatCredits(tier.minCny)}
              </p>
              <p className="text-xs text-muted-foreground">
                {tier.met ? "已达标" : `还差 ${formatCredits(tier.gap)}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-semibold text-success tabular-nums">
                +{formatCredits(tier.claimState === "none" ? tier.bonus : tier.rewardCredits)} cr
              </span>
              {tier.claimState === "claimed" ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  已领取
                </span>
              ) : tier.claimState === "sent" ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/messages?filter=claimable">
                    <Inbox className="h-3.5 w-3.5" />
                    去站内信领取
                  </Link>
                </Button>
              ) : tier.met && activity.active ? (
                <Button size="sm" disabled={busyTier !== null} onClick={() => void onSend(tier.tierKey)}>
                  {busyTier === tier.tierKey ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  发放到站内信
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {tier.met ? (activity.enabled ? "活动未进行" : "活动未开启") : "未达标"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}