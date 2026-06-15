"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ManageUserDialog } from "./manage-user-dialog";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: number;
  balanceCredits: number;
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
      accessorKey: "balanceCredits",
      header: "余额",
      cell: ({ row }) => {
        const balance = row.original.balanceCredits;
        const usd = (balance / 500000).toFixed(2);
        return (
          <div className="text-right">
            <p className="font-medium">{balance.toLocaleString()} cr</p>
            <p className="text-xs text-muted-foreground">≈ ${usd}</p>
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
