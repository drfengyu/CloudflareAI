"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, XCircle, ExternalLink } from "lucide-react";
import { adminReconcileOrder, adminCloseOrder } from "./actions";
import { cn } from "@/lib/utils";

export interface AdminOrderRow {
  id: string;
  orderNo: string;
  userEmail: string;
  amountCny: number;
  credits: number;
  status: number;
  channel: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<number, { label: string; tone: "warning" | "info" | "success" | "muted" | "danger" }> = {
  0: { label: "待支付", tone: "warning" },
  1: { label: "支付确认中", tone: "info" },
  2: { label: "已到账", tone: "success" },
  3: { label: "已关闭", tone: "muted" },
  9: { label: "异常", tone: "danger" },
};

const CHANNEL_LABEL: Record<string, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  qqpay: "QQ 钱包",
  linuxdo: "LinuxDO 积分",
};

export function AdminOrdersTable({ orders }: { orders: AdminOrderRow[] }) {
  const [items, setItems] = useState(orders);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (orderNo: string, fn: () => Promise<{ success: boolean; orderStatus?: number }>) => {
    setBusy(orderNo);
    try {
      const res = await fn();
      toast.success(res.orderStatus === 2 ? `订单 ${orderNo} 已到账补发` : `订单 ${orderNo} 已更新`);
      setItems((prev) =>
        prev.map((o) =>
          o.orderNo === orderNo ? { ...o, status: res.orderStatus ?? o.status } : o
        )
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无订单</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">订单号</th>
            <th className="px-3 py-2 font-medium">用户</th>
            <th className="px-3 py-2 font-medium">金额</th>
            <th className="px-3 py-2 font-medium">到账</th>
            <th className="px-3 py-2 font-medium">渠道</th>
            <th className="px-3 py-2 font-medium">状态</th>
            <th className="px-3 py-2 font-medium">创建时间</th>
            <th className="px-3 py-2 font-medium">支付时间</th>
            <th className="px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((order) => {
            const meta = STATUS_META[order.status] ?? STATUS_META[9];
            const canAct = order.status === 0 || order.status === 1 || order.status === 9;
            return (
              <tr key={order.id} className="hover:bg-secondary/30">
                <td className="px-3 py-2 font-mono text-xs">{order.orderNo}</td>
                <td className="px-3 py-2">{order.userEmail}</td>
                <td className="px-3 py-2">¥{order.amountCny}</td>
                <td className="px-3 py-2">+{order.credits} cr</td>
                <td className="px-3 py-2">{CHANNEL_LABEL[order.channel ?? ""] ?? order.channel ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {order.paidAt ? new Date(order.paidAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2">
                  {canAct && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === order.orderNo}
                        onClick={() => run(order.orderNo, () => adminReconcileOrder(order.orderNo))}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", busy === order.orderNo && "animate-spin")} />
                        对账
                      </Button>
                      {order.status === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === order.orderNo}
                          onClick={() => run(order.orderNo, () => adminCloseOrder(order.orderNo))}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          关闭
                        </Button>
                      )}
                    </div>
                  )}
                  {order.tradeNo && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      {order.tradeNo.slice(0, 12)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
