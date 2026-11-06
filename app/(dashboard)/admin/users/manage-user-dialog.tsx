"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings, ShieldAlert, Trash2 } from "lucide-react";
import {
  adjustUserBalance,
  resetUserPassword,
  sendUserMessage,
  updateUserRole,
} from "./actions";
import { deleteUser } from "./delete-user-action";
import { toast } from "sonner";
import type { UserRow } from "./columns";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";
import type { Attachment } from "@/lib/message/messages";

type AttachmentType = "none" | "credits" | "tickets" | "redemption" | "item";

const ATTACHMENT_OPTIONS: { value: AttachmentType; label: string }[] = [
  { value: "none", label: "不带附件" },
  { value: "credits", label: "cr 余额" },
  { value: "tickets", label: "抽奖券（转盘）" },
  { value: "redemption", label: "兑换码" },
  { value: "item", label: "自定义物品 / 凭证" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

interface ManageUserDialogProps {
  user: UserRow;
  currentUserId: string;
}

export function ManageUserDialog({ user, currentUserId }: ManageUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [selectedRole, setSelectedRole] = useState(user.role);

  const [newPassword, setNewPassword] = useState("");
  const [notifyUser, setNotifyUser] = useState(true);
  const [includePassword, setIncludePassword] = useState(false);
  /** 重置成功后只显示一次的明文；关掉对话框就没了，库里只有 hash。 */
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);

  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [attachmentType, setAttachmentType] = useState<AttachmentType>("none");
  const [attachmentValue, setAttachmentValue] = useState("");

  const isCurrentUser = user.id === currentUserId;
  const isSuperAdmin = user.role >= 100;
  const canDelete = !isCurrentUser && !isSuperAdmin;

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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = newPassword.trim();
    if (typed && typed.length < 8) {
      toast.error("密码至少 8 位");
      return;
    }

    setLoading(true);
    try {
      const result = await resetUserPassword({
        userId: user.id,
        newPassword: typed || undefined,
        notifyUser,
        includePassword,
      });
      setIssuedPassword(result.password);
      setNewPassword("");
      toast.success(result.notified ? "密码已重置，并已发站内信通知" : "密码已重置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = attachmentValue.trim();
    let attachment: Attachment | null = null;
    if (attachmentType !== "none") {
      if (!raw) {
        toast.error("请填写附件内容");
        return;
      }
      attachment =
        attachmentType === "credits"
          ? { kind: "credits", credits: Number(raw) }
          : attachmentType === "tickets"
            ? { kind: "tickets", count: Number(raw) }
            : attachmentType === "redemption"
              ? { kind: "redemption", code: raw }
              : { kind: "item", label: raw };
    }

    setLoading(true);
    try {
      await sendUserMessage({
        userId: user.id,
        title: msgTitle,
        body: msgBody,
        kind: "notice",
        attachment,
      });
      toast.success("站内信已发出");
      setMsgTitle("");
      setMsgBody("");
      setAttachmentValue("");
      setAttachmentType("none");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除用户 ${user.email} 吗？\n\n此操作将删除：\n- 用户账户\n- 所有 API Keys\n- 用量记录\n- 充值记录\n- 临时余额\n- 签到记录\n\n此操作不可恢复！`)) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteUser(user.id);
      if (result.success) {
        toast.success(result.message || "用户已删除");
        setOpen(false);
        // 刷新页面
        window.location.reload();
      } else {
        toast.error(result.message || "删除失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
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
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">{user.name || user.email}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                当前余额: {user.totalBalance.toLocaleString()} cr
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
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  placeholder="正数充值，负数扣减"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">说明</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
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
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
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

            {/* 登录密码 */}
            <form onSubmit={handleResetPassword} className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">登录密码</h3>
              <p className="text-xs text-muted-foreground">
                库里只存 bcrypt 哈希，任何人都无法查看用户原本的密码；这里只能把它重置成一个新值。
                新密码只在下面出现一次，关掉对话框就再也取不到。
              </p>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                placeholder="留空则自动生成 12 位可读密码"
                autoComplete="off"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={notifyUser}
                  onChange={(e) => setNotifyUser(e.target.checked)}
                />
                发站内信通知该用户
              </label>
              <label className={`flex items-center gap-2 text-xs ${notifyUser ? "" : "opacity-40"}`}>
                <input
                  type="checkbox"
                  disabled={!notifyUser}
                  checked={includePassword}
                  onChange={(e) => setIncludePassword(e.target.checked)}
                />
                在站内信正文里附上新密码
                <span className="text-muted-foreground">（明文会落库，用户读过 3 天后随信自动删除）</span>
              </label>
              <Button type="submit" size="sm" variant="outline" disabled={loading}>
                {loading ? "处理中..." : "重置密码"}
              </Button>

              {issuedPassword ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    新密码（只显示这一次）
                  </p>
                  <p className="mt-2 break-all font-mono text-sm">{issuedPassword}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(issuedPassword);
                      toast.success("已复制");
                    }}
                  >
                    复制
                  </Button>
                </div>
              ) : null}
            </form>

            {/* 发站内信 */}
            <form onSubmit={handleSendMessage} className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">发站内信</h3>
              <input
                type="text"
                value={msgTitle}
                onChange={(e) => setMsgTitle(e.target.value)}
                className={inputClass}
                placeholder="主题（最多 120 字）"
                maxLength={120}
              />
              <textarea
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                className={`${inputClass} min-h-24`}
                placeholder="正文；列表里会截取首行当简述"
              />
              <div className="flex gap-2">
                <select
                  value={attachmentType}
                  onChange={(e) => {
                    setAttachmentType(e.target.value as AttachmentType);
                    setAttachmentValue("");
                  }}
                  className={`${inputClass} w-44`}
                >
                  {ATTACHMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {attachmentType !== "none" ? (
                  <input
                    type="text"
                    value={attachmentValue}
                    onChange={(e) => setAttachmentValue(e.target.value)}
                    className={inputClass}
                    placeholder={
                      attachmentType === "credits"
                        ? "赠送 cr 数"
                        : attachmentType === "tickets"
                          ? "抽奖券张数"
                          : attachmentType === "redemption"
                            ? "兑换码明文"
                            : "物品名 / 凭证文字"
                    }
                  />
                ) : null}
              </div>
              {attachmentType !== "none" ? (
                <p className="text-xs text-muted-foreground">
                  附件不会立即入账：用户点「领取」时才真的发，重复点击不会重复到账。
                </p>
              ) : null}
              <Button
                type="submit"
                size="sm"
                disabled={loading || !msgTitle.trim() || !msgBody.trim()}
              >
                {loading ? "发送中..." : "发送站内信"}
              </Button>
            </form>
          </div>

          {/* 危险操作区 */}
          {canDelete && (
            <div className="border-t border-border pt-4">
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 p-4">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-400 mb-2">
                  危险操作
                </h3>
                <p className="text-xs text-red-700 dark:text-red-500 mb-3">
                  删除用户将同时删除其所有数据（API Keys、用量记录、充值记录等），此操作不可恢复！
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {deleting ? "删除中..." : "删除用户"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
