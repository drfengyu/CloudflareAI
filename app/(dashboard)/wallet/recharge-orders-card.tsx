"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { checkOrderStatus } from "./actions";
import { cn } from "@/lib/utils";

export interface SerializedPayOrder {
  orderNo: string;
  amountCny: number;
  credits: number;
  status: number;
  channel: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<number, { label: string; tone: "default" | "success" | "warning" | "muted" | "danger" }> = {
  0: { label: "待支付", tone: "warning" },
  1: { label: "支付确认中", tone: "warning" },
  2: { label: "已到账", tone: "success" },
  3: { label: "已关闭", tone: "muted" },
  9: { label: "异常", tone: "danger" },
};

interface Props {
  orders: SerializedPayOrder[];
  /** 回跳时携带的订单号（?paid=1&orderNo=xxx） */
  highlightOrderNo?: string;
  /** 是否刚从支付页回跳（?paid=1） */
  justReturned?: boolean;
}

export function RechargeOrdersCard({ orders, highlightOrderNo, justReturned }: Props) {
  const [items, setItems] = useState(orders);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // 有回跳订单号时，初次挂载主动查一次 + 置顶
  const activeOrder = highlightOrderNo
    ? items.find((o) => o.orderNo === highlightOrderNo) ?? null
    : null;

  const refresh = async (orderNo: string) => {
    setRefreshing(orderNo);
    try {
      const next = await checkOrderStatus(orderNo);
      const prevStatus = items.find((o) => o.orderNo === orderNo)?.status;
      setItems((prev) =>
        prev.map((o) => (o.orderNo === orderNo ? { ...o, ...next } : o)),
      );
      if (prevStatus !== undefined && prevStatus !== next.status) {
        if (next.status === 2) {
          toast.success(`订单 ${orderNo} 已到账 +${next.credits} cr`);
        } else if (next.status === 3 && justReturned) {
          toast.info(`订单 ${orderNo} 已关闭，请重新下单`);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "查询订单失败");
    } finally {
      setRefreshing(null);
    }
  };

  // 轮询：对待支付/确认中的订单每 4s 查一次（直到全部到账/关闭）。
  // 只轮询创建不超过 10 分钟的订单，避免对已放弃的订单持续请求易支付网关。
  const AUTO_POLL_MAX_AGE_MS = 10 * 60_000;
  useEffect(() => {
    const now = Date.now();
    const pending = items.filter(
      (o) =>
        (o.status === 0 || o.status === 1) &&
        now - new Date(o.createdAt).getTime() < AUTO_POLL_MAX_AGE_MS,
    );
    if (pending.length === 0) {
      if (highlightOrderNo) {
        const t = setTimeout(() => refresh(highlightOrderNo), 0);
        return () => clearTimeout(t);
      }
      return;
    }
    const timer = setInterval(() => {
      pending.forEach((o) => refresh(o.orderNo));
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((o) => o.status).join(","), highlightOrderNo]);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">在线充值订单</CardTitle>
        {activeOrder && activeOrder.status === 0 && (
          <Badge tone="warning">等待支付</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {justReturned && activeOrder && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            {activeOrder.status === 2 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" />
                支付成功，余额已到账 +{activeOrder.credits} cr
              </>
            ) : activeOrder.status === 0 || activeOrder.status === 1 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在确认支付结果，请稍候…
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                订单 {activeOrder.status === 3 ? "已关闭" : "状态异常"}，如有疑问请联系管理员
              </>
            )}
          </div>
        )}

        {items.map((order) => {
          const meta = STATUS_META[order.status] ?? STATUS_META[9];
          const isHighlight = highlightOrderNo === order.orderNo;
          return (
            <div
              key={order.orderNo}
              className={cn(
                "flex items-center justify-between rounded-lg border border-border bg-card p-3",
                isHighlight && "border-primary/50"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-mono text-muted-foreground">{order.orderNo}</p>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {order.channel === "alipay" ? "支付宝" : order.channel === "wechat" ? "微信支付" : order.channel === "linuxdo" ? "LinuxDO 积分" : order.channel}
                  {" · "}{order.channel === "linuxdo" ? "" : "¥"}{order.amountCny}
                  {order.channel === "linuxdo" ? " 积分" : ""} · {new Date(order.createdAt).toLocaleString()}
                  {order.paidAt && ` · ${new Date(order.paidAt).toLocaleString()} 支付`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className="text-sm font-semibold">+{order.credits} cr</p>
                {(order.status === 0 || order.status === 1) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={refreshing === order.orderNo}
                    onClick={() => refresh(order.orderNo)}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing === order.orderNo && "animate-spin")} />
                    查询
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
