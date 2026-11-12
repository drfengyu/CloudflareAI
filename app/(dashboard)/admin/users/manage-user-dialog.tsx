"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  { value: "tickets", label: "活动券（转盘）" },
  { value: "redemption", label: "兑换码" },
  { value: "item", label: "自定义物品 / 凭证" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

interface ManageUserDialogProps {
  user: UserRow;
  currentUserId: string;
  onClose: () => void;
}

export function ManageUserDialog({ user, currentUserId, onClose }: ManageUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [roleDraft, setRoleDraft] = useState<number | null>(null);
  const selectedRole = roleDraft ?? user.role;

  const [newPassword, setNewPassword] = useState("");
  const [includePassword, setIncludePassword] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [notificationWarnings, setNotificationWarnings] = useState<string[]>([]);

  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [attachmentType, setAttachmentType] = useState<AttachmentType>("none");
  const [attachmentValue, setAttachmentValue] = useState("");

  const isCurrentUser = user.id === currentUserId;
  const isSuperAdmin = user.role >= 100;
  const canDelete = !isCurrentUser && !isSuperAdmin;
  const display = calculateDisplayBalance(user.permanentBalance, user.temporaryBalance);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (loading || deleting) return;
      if (issuedPassword && !confirm("新密码关闭后无法再次查看，请确认已复制或保存。确定关闭？")) return;
      setIssuedPassword(null);
      setNotificationWarnings([]);
      setNewPassword("");
    }
    if (!nextOpen) onClose();
  };

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
      setRoleDraft(null);
      toast.success("角色已更新");
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
        includePassword,
      });
      setIssuedPassword(result.password);
      setNotificationWarnings(result.warnings);
      setNewPassword("");
      if (result.warnings.length) toast.warning("密码已重置，部分通知未发送，请查看下方提示");
      else toast.success("密码已重置，双方站内信已发送，邮件已提交发信服务器");
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
    if (!confirm(`确定要删除用户 ${user.email} 吗？\n\n此操作将删除：\n- 用户账户\n- 所有 API Keys\n- 用量记录\n- 充值记录\n- tcr 余额\n- 签到记录\n\n此操作不可恢复！`)) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteUser(user.id);
      if (result.success) {
        toast.success(result.message || "用户已删除");
        setIssuedPassword(null);
        onClose();
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
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl flex-col overflow-hidden p-4 sm:p-5"
          onPointerDownOutside={(event) => {
            if (loading || deleting || issuedPassword) event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 pr-7">
            <DialogTitle>管理用户</DialogTitle>
            <DialogDescription className="break-all text-xs">
              {user.name ? `${user.name} · ` : ""}{user.email}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="account" className="flex min-h-0 flex-col gap-4">
            <TabsList className={`grid h-auto w-full shrink-0 ${canDelete ? "grid-cols-4" : "grid-cols-3"}`}>
              <TabsTrigger value="account" disabled={loading || deleting} className="px-2 text-xs sm:text-sm">账户管理</TabsTrigger>
              <TabsTrigger value="password" disabled={loading || deleting} className="px-2 text-xs sm:text-sm">登录密码</TabsTrigger>
              <TabsTrigger value="message" disabled={loading || deleting} className="px-2 text-xs sm:text-sm">发站内信</TabsTrigger>
              {canDelete ? (
                <TabsTrigger value="danger" disabled={loading || deleting} className="px-2 text-xs sm:text-sm">危险操作</TabsTrigger>
              ) : null}
            </TabsList>

            <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
              <TabsContent value="account" className="mt-0 space-y-4">
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                  <p className="font-medium">当前余额：{user.totalBalance.toLocaleString()} cr 等值</p>
                  {user.temporaryBalance > 0 || user.permanentBalance < 0 ? (
                    <p className="mt-1 text-muted-foreground">
                      cr：{display.displayPermanent.toLocaleString()} · tcr：{display.displayTemporary.toLocaleString()}
                      {user.permanentBalance < 0 ? (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">（已用 tcr 补正）</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>

                <form onSubmit={handleAdjustBalance} className="space-y-3">
                  <h3 className="text-sm font-semibold">余额调整</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs font-medium">
                      <span>调整金额（cr）</span>
                      <input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                        placeholder="正数充值，负数扣减"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      <span>说明</span>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={inputClass}
                        placeholder="调整原因（选填）"
                      />
                    </label>
                  </div>
                  <Button type="submit" disabled={loading || amount === 0} size="sm">
                    {loading ? "处理中..." : "调整余额"}
                  </Button>
                </form>

                {!isCurrentUser ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold">角色管理</h3>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="角色"
                        value={selectedRole}
                        onChange={(e) => setRoleDraft(parseInt(e.target.value))}
                        className={`${inputClass} min-w-0 flex-1`}
                      >
                        <option value={1}>普通用户</option>
                        <option value={10}>管理员</option>
                        <option value={100}>超级管理员</option>
                      </select>
                      <Button onClick={handleUpdateRole} disabled={loading || selectedRole === user.role} size="sm" variant="outline" className="shrink-0">
                        {loading ? "更新中..." : "更新角色"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="password" className="mt-0 space-y-4">
                {issuedPassword ? (
                  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-400">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      新密码（关闭前请复制保存）
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="min-w-0 break-all font-mono text-sm">{issuedPassword}</p>
                      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={async () => {
                        await navigator.clipboard.writeText(issuedPassword);
                        toast.success("已复制");
                      }}>
                        复制
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
                      {notificationWarnings.length ? notificationWarnings.join("；") : "双方站内信已发送，邮件已提交发信服务器。"}
                    </p>
                  </div>
                ) : null}
                <form onSubmit={handleResetPassword} className="space-y-3">
                  <h3 className="text-sm font-semibold">登录密码</h3>
                  <p className="text-xs text-muted-foreground">
                    原密码无法查看。重置后的新密码会保留到你主动关闭窗口，关闭后不再显示。
                  </p>
                  <input
                    aria-label="新密码"
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                    placeholder="留空则自动生成 12 位可读密码"
                    maxLength={72}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">重置后自动通知你和该用户，并向用户邮箱发送邮件。</p>
                  <label className="flex items-start gap-2 text-xs">
                    <input className="mt-0.5" type="checkbox" checked={includePassword} onChange={(e) => setIncludePassword(e.target.checked)} />
                    <span>
                      在双方站内信和用户邮件中附上新密码
                      <span className="mt-1 block text-muted-foreground">站内信读过 3 天后清理；已发送的邮件不会随站内信删除。</span>
                    </span>
                  </label>
                  <Button type="submit" size="sm" variant="outline" disabled={loading}>
                    {loading ? "处理中..." : "重置密码"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="message" className="mt-0">
                <form onSubmit={handleSendMessage} className="space-y-3">
                  <h3 className="text-sm font-semibold">发站内信</h3>
                  <input type="text" aria-label="主题" value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} className={inputClass} placeholder="主题（最多 120 字）" maxLength={120} />
                  <textarea aria-label="正文" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} className={`${inputClass} min-h-24`} placeholder="正文；列表里会截取首行当简述" />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label="附件类型"
                      value={attachmentType}
                      onChange={(e) => {
                        setAttachmentType(e.target.value as AttachmentType);
                        setAttachmentValue("");
                      }}
                      className={`${inputClass} sm:w-44 sm:shrink-0`}
                    >
                      {ATTACHMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {attachmentType !== "none" ? (
                      <input
                        type="text"
                        aria-label="附件内容"
                        value={attachmentValue}
                        onChange={(e) => setAttachmentValue(e.target.value)}
                        className={`${inputClass} min-w-0`}
                        placeholder={
                          attachmentType === "credits" ? "赠送 cr 数" : attachmentType === "tickets" ? "活动券张数" : attachmentType === "redemption" ? "兑换码明文" : "物品名 / 凭证文字"
                        }
                      />
                    ) : null}
                  </div>
                  {attachmentType !== "none" ? (
                    <p className="text-xs text-muted-foreground">附件在用户点击「领取」后发放，重复点击不会重复到账。</p>
                  ) : null}
                  <Button type="submit" size="sm" disabled={loading || !msgTitle.trim() || !msgBody.trim()}>
                    {loading ? "发送中..." : "发送站内信"}
                  </Button>
                </form>
              </TabsContent>

              {canDelete ? (
                <TabsContent value="danger" className="mt-0">
                  <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                    <h3 className="text-sm font-semibold text-red-900 dark:text-red-400">危险操作</h3>
                    <p className="text-xs text-red-700 dark:text-red-500">删除用户将同时删除其所有数据（API Keys、用量记录、充值记录等），此操作不可恢复！</p>
                    <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading || deleting}>
                      <Trash2 className="h-3 w-3" />
                      {deleting ? "删除中..." : "删除用户"}
                    </Button>
                  </div>
                </TabsContent>
              ) : null}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
  );
}
