"use client";

import { DataTable } from "@/components/data-table/data-table";
import { createRedemptionColumns, type RedemptionRow } from "./columns";

interface RedemptionsTableProps {
  data: RedemptionRow[];
  ratio: number;
}

export function RedemptionsTable({ data, ratio }: RedemptionsTableProps) {
  const columns = createRedemptionColumns(ratio);
  return <DataTable columns={columns} data={data} />;
}
