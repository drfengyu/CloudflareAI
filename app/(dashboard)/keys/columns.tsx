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
  remainCredits: number | null;
  expiresAt: Date | null;
  allowedModels: string | null;
  allowedIps: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
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
      const remain = row.original.remainCredits;
      if (remain === null) {
        return <span className="text-xs text-muted-foreground">无限制</span>;
      }
      return (
        <div className="min-w-[120px]">
          <p className="text-xs font-medium">{remain.toLocaleString()} cr</p>
          {/* TODO: 添加进度条 */}
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
