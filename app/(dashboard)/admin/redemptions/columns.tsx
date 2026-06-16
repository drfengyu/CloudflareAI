"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export interface RedemptionRow {
  id: string;
  code: string;
  creditsAmount: number;
  status: number; // 1=未使用 / 2=已使用 / 3=已过期
  usedBy: string | null;
  usedAt: Date | null;
  createdAt: Date;
}

const statusLabels: Record<number, { label: string; tone: "success" | "muted" | "warning" }> = {
  1: { label: "未使用", tone: "success" },
  2: { label: "已使用", tone: "muted" },
  3: { label: "已过期", tone: "warning" },
};

export const columns: ColumnDef<RedemptionRow>[] = [
  {
    accessorKey: "code",
    header: "兑换码",
    cell: ({ row }) => (
      <code className="rounded bg-surface-2 px-2 py-1 font-mono text-xs">
        {row.original.code}
      </code>
    ),
  },
  {
    accessorKey: "creditsAmount",
    header: "额度",
    cell: ({ row }) => {
      const credits = row.original.creditsAmount;
      const usd = credits.toFixed(2);
      return (
        <div>
          <p className="font-medium">{credits.toLocaleString()} cr</p>
          <p className="text-xs text-muted-foreground">≈ ${usd}</p>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const s = statusLabels[row.original.status] || statusLabels[1];
      return <Badge tone={s.tone}>{s.label}</Badge>;
    },
  },
  {
    accessorKey: "usedBy",
    header: "使用者",
    cell: ({ row }) => {
      const usedBy = row.original.usedBy;
      const usedAt = row.original.usedAt;

      if (!usedBy) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }

      return (
        <div className="text-xs">
          <p className="font-medium">{usedBy}</p>
          {usedAt && (
            <p className="text-muted-foreground">
              {formatDistanceToNow(usedAt, { addSuffix: true, locale: zhCN })}
            </p>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "创建时间",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(row.original.createdAt, { addSuffix: true, locale: zhCN })}
      </span>
    ),
  },
];
