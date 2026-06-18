"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { KeyActions } from "./key-actions";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  status: number; // 1=启用 / 2=禁用 / 3=过期 / 4=耗尽
  quotaCredits: number | null;
  remainCredits: number | null;
  expiresAt: Date | null;
  allowedModels: string | null;
  allowedIps: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  actualUsed: number; // 实际使用量（从 usage_log）
  callCount: number; // 调用次数
  userBalance: number; // 账户余额
  channelId: string | null;
  channelName: string | null;
  channelType: string | null;
}

const statusLabels: Record<number, { label: string; tone: "success" | "danger" | "warning" | "muted" }> = {
  1: { label: "启用", tone: "success" },
  2: { label: "已禁用", tone: "danger" },
  3: { label: "已过期", tone: "warning" },
  4: { label: "额度耗尽", tone: "muted" },
};

export const columns: ColumnDef<ApiKeyRow>[] = [
  {
    accessorKey: "name",
    header: "名称",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.name}</p>
        <code className="text-xs text-muted-foreground">{row.original.prefix}••••••••</code>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const s = statusLabels[row.original.status] || { label: "未知", tone: "muted" as const };
      return <Badge tone={s.tone}>{s.label}</Badge>;
    },
  },
  {
    id: "quota",
    header: "额度",
    cell: ({ row }) => {
      const quota = row.original.quotaCredits;
      const remain = row.original.remainCredits;
      const actualUsed = row.original.actualUsed;
      const userBalance = row.original.userBalance;

      // 无限额度：无单独总额，展示累计已用量 + 账户实际余额
      if (remain === null) {
        return (
          <div className="min-w-[120px]">
            <p className="text-xs font-medium">已用 {actualUsed.toLocaleString()} cr</p>
            <p className="mt-1 text-xs text-muted-foreground">
              无限额度 · 余额 {Math.round(userBalance).toLocaleString()} cr
            </p>
          </div>
        );
      }

      // 有限额度：显示剩余 / 总额度
      const used = quota !== null && quota > 0 ? ((quota - remain) / quota) * 100 : 0;
      const usedPercent = Math.min(100, Math.max(0, used));

      return (
        <div className="min-w-[120px]">
          <p className="text-xs font-medium">{remain.toLocaleString()} / {quota?.toLocaleString() || '?'} cr</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>
      );
    },
  },
  {
    id: "models",
    header: "模型限制",
    cell: ({ row }) => {
      const models = row.original.allowedModels;
      if (!models) {
        return <span className="text-xs text-muted-foreground">全部</span>;
      }
      try {
        const list: string[] = JSON.parse(models);
        return <span className="text-xs">{list.length} 个模型</span>;
      } catch {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
    },
  },
  {
    id: "channel",
    header: "渠道",
    cell: ({ row }) => {
      const name = row.original.channelName;
      const type = row.original.channelType;
      if (!name) {
        return <Badge tone="muted" className="text-xs">Cloudflare</Badge>;
      }
      return (
        <div className="text-xs">
          <p className="font-medium">{name}</p>
          <p className="text-muted-foreground">{type}</p>
        </div>
      );
    },
  },
  {
    id: "expires",
    header: "有效期",
    cell: ({ row }) => {
      const exp = row.original.expiresAt;
      if (!exp) {
        return <span className="text-xs text-muted-foreground">永久</span>;
      }
      const isPast = exp < new Date();
      return (
        <span className={`text-xs ${isPast ? "text-danger" : ""}`}>
          {exp.toLocaleDateString("zh-CN")}
        </span>
      );
    },
  },
  {
    id: "usage",
    header: "调用",
    cell: ({ row }) => {
      const count = row.original.callCount;
      const used = row.original.actualUsed;
      return (
        <div className="text-xs">
          <p className="font-medium">{count} 次</p>
          <p className="text-muted-foreground">{used.toLocaleString()} cr</p>
        </div>
      );
    },
  },
  {
    id: "lastUsed",
    header: "最后使用",
    cell: ({ row }) => {
      const last = row.original.lastUsedAt;
      if (!last) {
        return <span className="text-xs text-muted-foreground">从未</span>;
      }
      return (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(last, { addSuffix: true, locale: zhCN })}
        </span>
      );
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <KeyActions
        keyId={row.original.id}
        status={row.original.status}
        onEdit={() => console.log("Edit", row.original.id)}
      />
    ),
  },
];
