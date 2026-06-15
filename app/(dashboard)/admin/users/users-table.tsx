"use client";

import { DataTable } from "@/components/data-table/data-table";
import { columns, type UserRow } from "./columns";

interface UsersTableProps {
  data: UserRow[];
  currentUserId: string;
}

export function UsersTable({ data, currentUserId }: UsersTableProps) {
  return <DataTable columns={columns} data={data} />;
}
