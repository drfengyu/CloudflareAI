"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ManageUserDialog } from "./manage-user-dialog";
import { creditsToUsd } from "@/lib/billing/credits";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: number;
  balanceCredits: number;
  totalBalance: number;  // 真实总余额（永久 + 临时）
  permanentBalance: number;  // 永久余额
  temporaryBalance: number;  // 临时余额
  createdAt: Date | null;
  roleLabel: { label: string; tone: "success" | "warning" | "muted" };
}

export function createColumns(currentUserId: string): ColumnDef<UserRow>[] {
  return [
    {
      accessorKey: "email",
      header: "用户",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name || row.original.email}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "角色",
      cell: ({ row }) => (
        <Badge tone={row.original.roleLabel.tone}>
          {row.original.roleLabel.label}
        </Badge>
      ),
    },
    {
      accessorKey: "totalBalance",
      header: "余额",
      cell: ({ row }) => {
        const total = row.original.totalBalance;
        const permanent = row.original.permanentBalance;
        const temporary = row.original.temporaryBalance;
        const usd = creditsToUsd(total).toFixed(4);

        return (
          <div className="text-right">
            <p className="font-medium">{total.toLocaleString()} cr</p>
            <p className="text-xs text-muted-foreground">≈ ${usd}</p>
            {temporary > 0 && (
              <p className="text-xs text-muted-foreground">
                (永久 {permanent.toLocaleString()} + 临时 {temporary.toLocaleString()})
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "注册时间",
      cell: ({ row }) => {
        const date = row.original.createdAt;
        if (!date) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(date), { addSuffix: true, locale: zhCN })}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <ManageUserDialog user={row.original} currentUserId={currentUserId} />
      ),
    },
  ];
}
