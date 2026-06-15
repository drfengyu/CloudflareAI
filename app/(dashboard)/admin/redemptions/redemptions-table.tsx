"use client";

import { DataTable } from "@/components/data-table/data-table";
import { columns, type RedemptionRow } from "./columns";

interface RedemptionsTableProps {
  data: RedemptionRow[];
}

export function RedemptionsTable({ data }: RedemptionsTableProps) {
  return <DataTable columns={columns} data={data} />;
}
