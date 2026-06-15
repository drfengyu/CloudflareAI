"use client";

import { DataTable } from "@/components/data-table/data-table";
import { createColumns, type UserRow } from "./columns";

interface UsersTableProps {
  data: UserRow[];
  currentUserId: string;
}

export function UsersTable({ data, currentUserId }: UsersTableProps) {
  const columns = createColumns(currentUserId);
  return <DataTable columns={columns} data={data} />;
}
