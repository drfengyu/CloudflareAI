"use client";

import { DataTable } from "@/components/data-table/data-table";
import { createColumns, type UserRow } from "./columns";

interface UsersTableProps {
  data: UserRow[];
  currentUserId: string;
  ratio: number;
}

export function UsersTable({ data, currentUserId, ratio }: UsersTableProps) {
  const columns = createColumns(currentUserId, ratio);
  return <DataTable columns={columns} data={data} />;
}
