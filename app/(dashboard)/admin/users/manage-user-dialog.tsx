"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { adjustUserBalance, updateUserRole } from "./actions";
import { toast } from "sonner";
import type { UserRow } from "./columns";
import { creditsToUsd } from "@/lib/billing/credits";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";

interface ManageUserDialogProps {
  user: UserRow;
  currentUserId: string;
}

export function ManageUserDialog({ user, currentUserId }: ManageUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [selectedRole, setSelectedRole] = useState(user.role);

  const isCurrentUser = user.id === currentUserId;

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === 0) {
      toast.error("调整金额不能为 0");
      return;
    }

    setLoading(true);
    try {
      const result = await adjustUserBalance({
        userId: user.id,
        amount,
        description,
      });
      toast.success(`余额已调整，新余额: ${result.newBalance.toLocaleString()} cr`);
      setAmount(0);
      setDescription("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "调整失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (selectedRole === user.role) {
      toast.error("角色未变更");
      return;
    }

    setLoading(true);
    try {
      await updateUserRole({
        userId: user.id,
        role: selectedRole,
      });
      toast.success("角色已更新");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Settings className="h-3 w-3" />
        管理
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>管理用户</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* 用户信息 */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-medium">{user.name || user.email}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                当前余额: {user.totalBalance.toLocaleString()} cr
                (≈ ${creditsToUsd(user.totalBalance).toFixed(4)})
              </p>
              {(() => {
                const display = calculateDisplayBalance(user.permanentBalance, user.temporaryBalance);
                if (user.temporaryBalance > 0 || user.permanentBalance < 0) {
                  return (
                    <p className="mt-1 text-xs text-muted-foreground">
                      永久: {display.displayPermanent.toLocaleString()} cr +
                      临时: {display.displayTemporary.toLocaleString()} cr
                      {user.permanentBalance < 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          (已用临时余额补正)
                        </span>
                      )}
                    </p>
                  );
                }
                return null;
              })()}
            </div>

            {/* 余额调整 */}
            <form onSubmit={handleAdjustBalance} className="space-y-3">
              <h3 className="text-sm font-semibold">余额调整</h3>
              <div>
                <label className="block text-sm font-medium mb-1">
                  调整金额（credits）
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="正数充值，负数扣减"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {amount > 0 && `+${amount.toFixed(2)} USD`}
                  {amount < 0 && `${amount.toFixed(2)} USD`}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">说明</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="调整原因（选填）"
                />
              </div>

              <Button type="submit" disabled={loading || amount === 0} size="sm">
                {loading ? "处理中..." : "调整余额"}
              </Button>
            </form>

            {/* 角色管理 */}
            {!isCurrentUser && (
              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">角色管理</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">角色</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(parseInt(e.target.value))}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value={1}>普通用户</option>
                    <option value={10}>管理员</option>
                    <option value={100}>超级管理员</option>
                  </select>
                </div>

                <Button
                  onClick={handleUpdateRole}
                  disabled={loading || selectedRole === user.role}
                  size="sm"
                  variant="outline"
                >
                  {loading ? "更新中..." : "更新角色"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
