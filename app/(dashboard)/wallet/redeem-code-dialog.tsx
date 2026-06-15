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
import { redeemCode } from "./actions";
import { toast } from "sonner";

export function RedeemCodeDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
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
          <DialogTitle>兑换码充值</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">兑换码</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono"
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
      </DialogContent>
    </Dialog>
  );
}
