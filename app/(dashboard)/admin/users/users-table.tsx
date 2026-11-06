"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { createColumns, type UserRow } from "./columns";
import { ManageUserDialog } from "./manage-user-dialog";

interface UsersTableProps {
  data: UserRow[];
  currentUserId: string;
}

export function UsersTable({ data, currentUserId }: UsersTableProps) {
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const columns = useMemo(() => createColumns(setSelectedUser), []);
  const activeUser = selectedUser ? data.find((user) => user.id === selectedUser.id) ?? selectedUser : null;
  // 弹窗不能挂在分页行内，否则用户排序变化会卸载一次性密码结果。
  return (
    <>
      <DataTable columns={columns} data={data} getRowId={(user) => user.id} autoResetPageIndex={false} />
      {activeUser ? (
        <ManageUserDialog key={activeUser.id} user={activeUser} currentUserId={currentUserId} onClose={() => setSelectedUser(null)} />
      ) : null}
    </>
  );
}
