"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { columns, type ApiKeyRow } from "./columns";
import { KeySheet } from "./key-sheet";

interface KeysTableProps {
  data: ApiKeyRow[];
}

export function KeysTable({ data }: KeysTableProps) {
  const [editingKey, setEditingKey] = useState<ApiKeyRow | null>(null);

  // 传递 onEdit 回调到 columns
  const columnsWithEdit = columns.map((col) => {
    if (col.id === "actions") {
      return {
        ...col,
        cell: ({ row }: { row: { original: ApiKeyRow } }) => {
          const KeyActions = require("./key-actions").KeyActions;
          return (
            <KeyActions
              keyId={row.original.id}
              status={row.original.status}
              onEdit={() => setEditingKey(row.original)}
            />
          );
        },
      };
    }
    return col;
  });

  return (
    <>
      <DataTable columns={columnsWithEdit} data={data} />
      <KeySheet apiKey={editingKey} onClose={() => setEditingKey(null)} />
    </>
  );
}
