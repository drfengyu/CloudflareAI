"use client";

import { DataTable } from "@/components/data-table/data-table";
import { createRedemptionColumns, type RedemptionRow } from "./columns";

interface RedemptionsTableProps {
  data: RedemptionRow[];
}

export function RedemptionsTable({ data }: RedemptionsTableProps) {
  const columns = createRedemptionColumns();
  return <DataTable columns={columns} data={data} />;
}
