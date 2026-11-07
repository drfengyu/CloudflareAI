"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, QrCode, Coins } from "lucide-react";
import { redeemCode, createPayOrder } from "./actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import {
  rechargeAmountError,
  rechargeCredits,
  rechargeRatePercent,
} from "@/lib/payment/recharge-display";

const PRESET_AMOUNTS = [10, 30, 68, 128];
const CHANNELS = [
  { id: "alipay", label: "支付宝", icon: QrCode },
  { id: "wechat", label: "微信支付", icon: QrCode },
];
const LINUXDO_CHANNEL = { id: "linuxdo", label: "LinuxDO 积分", icon: Coins };

interface ChannelConfig {
  rate: number;
  min: number;
  max: number;
  unit: string;
}

/** 折算价只求一眼看懂，去掉 formatCredits 补齐的尾零（71.00 → 71）。 */
function displayCredits(value: number): string {
  const text = formatCredits(value);
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

export function RedeemCodeDialog({
  canUseEpay = false,
  epayRate = 10,
  epayMin = 1,
  epayMax = 1000,
  linuxdoEnabled = false,
  linuxdoRate = 1,
  linuxdoMin = 1,
  linuxdoMax = 1000,
  bonusTiers = [],
  bonusValidDays = 30,
}: {
  canUseEpay?: boolean;
  /** 1 元 = ? credits（后台 recharge_rate）。 */
  epayRate?: number;
  epayMin?: number;
  epayMax?: number;
  linuxdoEnabled?: boolean;
  /** 1 LinuxDO 积分 = ? credits（后台 ldpay_rate）。 */
  linuxdoRate?: number;
  linuxdoMin?: number;
  linuxdoMax?: number;
  /** 后台开启的充值阶梯赠送；空数组表示当前没有赠送活动。 */
  bonusTiers?: { minCny: number; bonus: number }[];
  bonusValidDays?: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"online" | "redeem">("online");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState<number>(PRESET_AMOUNTS[0]);
  const [customAmount, setCustomAmount] = useState("");
  const [selectedChannel, setChannel] = useState("alipay");

  const configFor = (id: string): ChannelConfig =>
    id === "linuxdo"
      ? { rate: linuxdoRate, min: linuxdoMin, max: linuxdoMax, unit: "积分" }
      : { rate: epayRate, min: epayMin, max: epayMax, unit: "元" };

  const channels = [
    ...(canUseEpay ? CHANNELS : []),
    ...(linuxdoEnabled ? [LINUXDO_CHANNEL] : []),
  ];
  const hasOnlineRecharge = channels.length > 0;
  const activeTab = hasOnlineRecharge ? tab : "redeem";
  const channel = channels.find((item) => item.id === selectedChannel)?.id ?? channels[0]?.id ?? "";
  const isLinuxdo = channel === "linuxdo";
  const cfg = configFor(channel);
  const ratePercent = rechargeRatePercent(cfg.rate);
  const rateLabel = ratePercent > 0 ? ratePercent / 100 : cfg.rate;

  const presetAmounts = PRESET_AMOUNTS.filter((amt) => amt >= cfg.min && amt <= cfg.max);
  const parsedCustom = customAmount.trim() ? Number(customAmount) : NaN;
  const finalAmount = customAmount.trim() ? parsedCustom : amount;
  const credits = rechargeCredits(finalAmount, cfg.rate);
  const amountError = rechargeAmountError(finalAmount, cfg.min, cfg.max, cfg.unit);

  
  const chooseChannel = (id: string) => {
    setChannel(id);
    const next = configFor(id);
    const nextPresets = PRESET_AMOUNTS.filter((amt) => amt >= next.min && amt <= next.max);
    setAmount((prev) => (prev >= next.min && prev <= next.max ? prev : (nextPresets[0] ?? next.min)));
    const custom = Number(customAmount);
    if (customAmount.trim() && (!Number.isFinite(custom) || custom < next.min || custom > next.max)) {
      setCustomAmount("");
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("请输入兑换码");
      return;
    }

    setLoading(true);
    try {
      const result = await redeemCode(code);
      const expiresDate = new Date(result.expiresAt).toLocaleDateString();
      toast.success(
        `充值成功！已获得 ${result.amount.toLocaleString()} cr，有效期至 ${expiresDate}`
      );
      setCode("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "兑换失败");
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountError) {
      toast.error(amountError);
      return;
    }

    setLoading(true);
    try {
      const result = await createPayOrder(finalAmount, channel);
      if (result.payUrl) {
        window.location.href = result.payUrl;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下单失败");
      setLoading(false);
    }
  };

  const amountText = finalAmount.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const payLabel = isLinuxdo ? `${amountText} 积分` : `¥${amountText}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          充值
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>充值</DialogTitle>
        </DialogHeader>

        {/* Tab 切换 */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {hasOnlineRecharge ? (
            <button
              type="button"
              onClick={() => setTab("online")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === "online" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              在线充值
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTab("redeem")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "redeem" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            兑换码
          </button>
        </div>

        {activeTab === "online" ? (
          <form onSubmit={handlePay} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">充值金额</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {presetAmounts.map((amt) => {
                  const selected = !customAmount && amount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setAmount(amt);
                        setCustomAmount("");
                      }}
                      className={cn(
                        "relative overflow-hidden rounded-xl border px-2 pb-2 pt-5 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-secondary/30"
                      )}
                    >
                      {ratePercent > 0 ? (
                        <span className="absolute left-0 top-0 rounded-br-lg bg-gradient-to-r from-amber-300 to-orange-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                          {ratePercent}%
                        </span>
                      ) : null}
                      <span className="block text-base font-semibold tabular-nums">
                        {isLinuxdo ? `${amt} 积分` : `¥${amt}`}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        ≈ {displayCredits(rechargeCredits(amt, cfg.rate))} cr
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 rounded-xl border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="custom-amount" className="text-sm font-medium">
                    自定义金额
                  </label>
                  {ratePercent > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {ratePercent}% 兑换
                    </span>
                  ) : null}
                </div>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {isLinuxdo ? "积分" : "¥"}
                  </span>
                  <input
                    id="custom-amount"
                    type="number"
                    min={cfg.min}
                    max={cfg.max}
                    step="0.01"
                    inputMode="decimal"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className={cn(
                      "w-full rounded-lg border bg-card py-2.5 pl-12 pr-28 text-base font-semibold tabular-nums outline-none transition-colors focus:border-primary",
                      amountError && customAmount.trim() ? "border-destructive" : "border-border"
                    )}
                    placeholder={`${cfg.min}–${cfg.max}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
                    {customAmount.trim()
                      ? `≈ ${displayCredits(credits)} cr`
                      : `1 ${cfg.unit} = ${rateLabel} cr`}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    amountError && customAmount.trim() ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {amountError && customAmount.trim()
                    ? amountError
                    : `单笔 ${cfg.min}–${cfg.max} ${cfg.unit}，到账为永久余额，无有效期`}
                </p>
              </div>
              {bonusTiers.length > 0 ? (
                <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
                  <p className="text-muted-foreground">
                    充值活动：活动期内累计充值达标后，到「限时返利」页手动领取；奖励发放到站内信，领取后进入临时余额（{bonusValidDays} 天内有效）
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {bonusTiers
                      .map((t) => `累计 ${t.minCny} → +${t.bonus.toLocaleString()} cr`)
                      .join("　·　")}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">支付方式</label>
              <div className={cn("grid gap-2", channels.length === 3 ? "grid-cols-3" : channels.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => chooseChannel(ch.id)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      channel === ch.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <ch.icon className="h-4 w-4" />
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">到账</p>
                <p className="text-base font-semibold text-primary tabular-nums">
                  {amountError ? "—" : `+${displayCredits(credits)} cr`}
                </p>
              </div>
              <p className="text-right text-xs text-muted-foreground">
                支付 <span className="font-medium text-foreground">{payLabel}</span>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading || Boolean(amountError)}>
                {loading ? "跳转中..." : "立即支付"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRedeem} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">兑换码</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                maxLength={20}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                请输入管理员提供的兑换码
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "兑换中..." : "兑换"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
