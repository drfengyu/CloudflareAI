"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Link, Activity, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import LinkNext from "next/link";
import {
  CHANNEL_TYPES,
  CHANNEL_CONFIG_FIELDS,
  type ConfigField,
} from "@/lib/channels/registry";

interface Channel {
  id: string;
  name: string;
  type: string | null;
  status: number;
  config: string | null;
  createdAt: Date | string | null;
}

interface ChannelsClientProps {
  initialChannels: Channel[];
}

export function ChannelsClient({ initialChannels }: ChannelsClientProps) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [loading, setLoading] = useState(false);
  const [healthCheckLoading, setHealthCheckLoading] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "cloudflare",
    config: "",
  });
  const [searchTerm, setSearchTerm] = useState("");

  async function fetchChannels() {
    setLoading(true);
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      setChannels(data.data || []);
    } catch {
      toast.error("获取渠道列表失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const url = editingChannel
        ? `/api/channels/${editingChannel.id}`
        : "/api/channels";
      const method = editingChannel ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "保存失败");
      }

      toast.success(editingChannel ? "渠道已更新" : "渠道已创建");
      setDialogOpen(false);
      setEditingChannel(null);
      setFormData({ name: "", type: "cloudflare", config: "" });
      fetchChannels();
    } catch (err) {
      toast.error((err as Error).message || "保存渠道失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(channelId: string) {
    if (!confirm("确定要删除该渠道吗？此操作不可撤销。")) return;
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      toast.success("渠道已删除");
      fetchChannels();
    } catch {
      toast.error("删除渠道失败");
    }
  }

  async function handleToggleStatus(channel: Channel) {
    const newStatus = channel.status === 1 ? 2 : 1;
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("操作失败");
      toast.success(newStatus === 1 ? "渠道已启用" : "渠道已禁用");
      fetchChannels();
    } catch {
      toast.error("状态切换失败");
    }
  }

  async function handleHealthCheck(channelId: string) {
    setHealthCheckLoading(channelId);
    try {
      const res = await fetch(`/api/channels/${channelId}/health`);
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || "连接正常");
      } else {
        toast.error(data.message || "连接失败");
      }
    } catch {
      toast.error("健康检查请求失败");
    } finally {
      setHealthCheckLoading(null);
    }
  }

  function getStatusBadge(status: number) {
    switch (status) {
      case 1:
        return <Badge tone="success">启用</Badge>;
      case 2:
        return <Badge tone="muted">禁用</Badge>;
      case 3:
        return <Badge tone="danger">已删除</Badge>;
      default:
        return <Badge tone="muted">{status}</Badge>;
    }
  }

  function openCreateDialog() {
    setEditingChannel(null);
    setFormData({ name: "", type: "cloudflare", config: "" });
    setDialogOpen(true);
  }

  function openEditDialog(channel: Channel) {
    setEditingChannel(channel);
    setFormData({
      name: channel.name,
      type: channel.type ?? "cloudflare",
      config: channel.config || "",
    });
    setDialogOpen(true);
  }

  /** Get config fields for selected channel type */
  function getConfigFields(type: string): ConfigField[] {
    return CHANNEL_CONFIG_FIELDS[type] || [];
  }

  /** Parse config JSON to object for form */
  function getConfigValue(key: string): string {
    try {
      const parsed = JSON.parse(formData.config || "{}");
      return (parsed as Record<string, string>)[key] || "";
    } catch {
      return "";
    }
  }

  /** Set config value in JSON */
  function setConfigValue(key: string, value: string) {
    try {
      const parsed = JSON.parse(formData.config || "{}") as Record<string, string>;
      parsed[key] = value;
      setFormData({ ...formData, config: JSON.stringify(parsed, null, 2) });
    } catch {
      const parsed: Record<string, string> = {};
      parsed[key] = value;
      setFormData({ ...formData, config: JSON.stringify(parsed, null, 2) });
    }
  }

  const configFields = getConfigFields(formData.type);
  const filteredChannels = channels.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.type || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI 供应商渠道</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理 AI 模型供应商的连接配置，支持 OpenAI / Anthropic / Azure 等多种渠道
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              添加渠道
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingChannel ? "编辑渠道" : "添加渠道"}
                </DialogTitle>
                <DialogDescription>
                  {editingChannel
                    ? "修改渠道配置信息"
                    : "创建一个新的 AI 供应商渠道"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Name */}
                <div className="grid gap-2">
                  <Label htmlFor="name">渠道名称</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="例如：OpenAI 主账号"
                    required
                  />
                </div>

                {/* Type */}
                <div className="grid gap-2">
                  <Label htmlFor="type">供应商类型</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        type: value,
                        config: "",
                      })
                    }
                    disabled={!!editingChannel}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dynamic Config Fields */}
                {configFields.length > 0 && (
                  <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">
                      连接配置
                    </p>
                    {configFields.map((field) => (
                      <div key={field.key} className="grid gap-1.5">
                        <Label htmlFor={`cfg-${field.key}`}>
                          {field.label}
                          {field.required && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </Label>
                        <Input
                          id={`cfg-${field.key}`}
                          type={field.type === "password" ? "password" : "text"}
                          value={getConfigValue(field.key)}
                          onChange={(e) =>
                            setConfigValue(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          required={field.required}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Raw JSON Editor (fallback) */}
                {configFields.length === 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="config">配置 (JSON)</Label>
                    <textarea
                      id="config"
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.config}
                      onChange={(e) =>
                        setFormData({ ...formData, config: e.target.value })
                      }
                      placeholder='{"apiKey": "..."}'
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>
                  {loading
                    ? "保存中..."
                    : editingChannel
                      ? "更新"
                      : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search / Filter */}
      <div className="flex items-center gap-4 mb-4">
        <Input
          placeholder="搜索渠道名称或类型..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          共 {filteredChannels.length} 个渠道
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredChannels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {searchTerm ? "没有匹配的渠道" : "暂无渠道，点击「添加渠道」创建"}
                </TableCell>
              </TableRow>
            ) : (
              filteredChannels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell>
                    <LinkNext
                      href={`/admin/channels/${channel.id}`}
                      className="font-medium hover:underline"
                    >
                      {channel.name}
                    </LinkNext>
                  </TableCell>
                  <TableCell>
                    <Badge tone="outline">
                      {channel.type || "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(channel.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {channel.createdAt
                      ? new Date(channel.createdAt).toLocaleDateString("zh-CN")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Health Check */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="健康检查"
                        disabled={healthCheckLoading === channel.id}
                        onClick={() => handleHealthCheck(channel.id)}
                      >
                        {healthCheckLoading === channel.id ? (
                          <Activity className="h-4 w-4 animate-pulse" />
                        ) : (
                          <Wifi className="h-4 w-4" />
                        )}
                      </Button>

                      {/* Toggle Status */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={channel.status === 1 ? "禁用" : "启用"}
                        onClick={() => handleToggleStatus(channel)}
                      >
                        {channel.status === 1 ? (
                          <WifiOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Wifi className="h-4 w-4 text-green-500" />
                        )}
                      </Button>

                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="编辑"
                        onClick={() => openEditDialog(channel)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      {/* View Detail */}
                      <Button variant="ghost" size="icon" title="详情" asChild>
                        <LinkNext href={`/admin/channels/${channel.id}`}>
                          <Link className="h-4 w-4" />
                        </LinkNext>
                      </Button>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="删除"
                        onClick={() => handleDelete(channel.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
