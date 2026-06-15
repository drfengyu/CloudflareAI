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
import { Plus } from "lucide-react";
import { generateRedemptionCodes } from "./actions";
import { toast } from "sonner";

export function GenerateCodesDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(10);
  const [quota, setQuota] = useState(10); // 10 credits = $10
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(30);
  const [balanceValidDays, setBalanceValidDays] = useState<number | null>(365);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await generateRedemptionCodes({
        count,
        quota,
        maxUses,
        expiresInDays,
        balanceValidDays,
      });
      toast.success(`成功生成 ${result.count} 个兑换码`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          批量生成
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>批量生成兑换码</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">生成数量</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              min={1}
              max={100}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              一次最多生成 100 个
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              每个额度（credits）
            </label>
            <input
              type="number"
              value={quota}
              onChange={(e) => setQuota(parseInt(e.target.value))}
              min={1}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              ≈ ${quota.toFixed(2)} USD（1 credit = $1）
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              最大使用次数
            </label>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(parseInt(e.target.value))}
              min={1}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              每个兑换码可以被使用的次数
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              兑换码有效期（天）
            </label>
            <input
              type="number"
              value={expiresInDays || ""}
              onChange={(e) =>
                setExpiresInDays(e.target.value ? parseInt(e.target.value) : null)
              }
              min={1}
              placeholder="不限"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              兑换码本身的有效期，留空表示永久有效
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              充值余额有效期（天）
            </label>
            <input
              type="number"
              value={balanceValidDays || ""}
              onChange={(e) =>
                setBalanceValidDays(e.target.value ? parseInt(e.target.value) : null)
              }
              min={1}
              placeholder="365"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              兑换后余额的有效期，留空默认 365 天
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
              {loading ? "生成中..." : "生成"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
