"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { columns, type ApiKeyRow } from "./columns";
import { KeySheet } from "./key-sheet";

interface Channel {
  id: string;
  name: string;
  type: string;
}

interface KeysTableProps {
  data: ApiKeyRow[];
  channels?: Channel[];
  models?: { id: string; name: string; channelId: string | null }[];
}

export function KeysTable({ data, channels = [], models = [] }: KeysTableProps) {
  const [editingKey, setEditingKey] = useState<ApiKeyRow | null>(null);

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
      <KeySheet
        key={editingKey?.id}
        apiKey={editingKey}
        onClose={() => setEditingKey(null)}
        channelsProp={channels}
        modelsProp={models}
      />
    </>
  );
}
