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

const PRESET_AMOUNTS = [10, 30, 68, 128];
const CHANNELS = [
  { id: "alipay", label: "支付宝", icon: QrCode },
  { id: "wechat", label: "微信支付", icon: QrCode },
];
const LINUXDO_CHANNEL = { id: "linuxdo", label: "LinuxDO 积分", icon: Coins };

export function RedeemCodeDialog({ linuxdoEnabled = false }: { linuxdoEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"online" | "redeem">("online");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState<number>(PRESET_AMOUNTS[0]);
  const [customAmount, setCustomAmount] = useState("");
  const [channel, setChannel] = useState("alipay");

  const channels = linuxdoEnabled ? [...CHANNELS, LINUXDO_CHANNEL] : CHANNELS;
  const isLinuxdo = channel === "linuxdo";
  const finalAmount = customAmount ? Number(customAmount) : amount;

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
    if (!finalAmount || finalAmount <= 0) {
      toast.error("请输入充值金额");
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
          <button
            type="button"
            onClick={() => setTab("online")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "online" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            在线充值
          </button>
          <button
            type="button"
            onClick={() => setTab("redeem")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "redeem" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            兑换码
          </button>
        </div>

        {tab === "online" ? (
          <form onSubmit={handlePay} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">充值金额</label>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setAmount(amt);
                      setCustomAmount("");
                    }}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm font-medium transition-colors",
                      !customAmount && amount === amt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {isLinuxdo ? `${amt} 积分` : `¥${amt}`}
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  placeholder={isLinuxdo ? "自定义积分（1-1000）" : "自定义金额（1-1000 元）"}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isLinuxdo
                  ? "使用 LinuxDO 积分充值，到账为永久余额，无有效期"
                  : "充值后到账为永久余额，无有效期"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">支付方式</label>
              <div className={cn("grid gap-2", channels.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setChannel(ch.id)}
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
