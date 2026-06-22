"use client";

import { useState, useTransition, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateApiKeyAction } from "./actions";
import type { ApiKeyRow } from "./columns";

// Channel types
interface Channel {
  id: string;
  name: string;
  type: string;
}

interface ModelOption {
  id: string;
  name: string;
  /** 模型所属渠道 ID。Cloudflare hosted 模型 = 默认渠道 ID（如 default-cloudflare）。 */
  channelId: string | null;
}

interface KeySheetProps {
  apiKey: ApiKeyRow | null;
  onClose: () => void;
  channelsProp?: Channel[];
  modelsProp?: ModelOption[];
}

export function KeySheet({ apiKey, onClose, channelsProp = [], modelsProp = [] }: KeySheetProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const initialModels = apiKey?.allowedModels ? (() => {
    try { return JSON.parse(apiKey.allowedModels); } catch { return []; }
  })() : [];

  const [formData, setFormData] = useState({
    name: apiKey?.name || "",
    quotaCredits: apiKey?.quotaCredits?.toString() || "",
    expiresAt: apiKey?.expiresAt?.toISOString().split("T")[0] || "",
    allowedIps: apiKey?.allowedIps || "",
    allowedModels: initialModels as string[],
    channelId: apiKey?.channelId || "",
  });
  const [modelSearch, setModelSearch] = useState("");
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 同步 formData 当 apiKey prop 变化时
  useEffect(() => {
    if (apiKey) {
      const models = apiKey.allowedModels ? (() => {
        try { return JSON.parse(apiKey.allowedModels); } catch { return []; }
      })() : [];

      setFormData({
        name: apiKey.name || "",
        quotaCredits: apiKey.quotaCredits?.toString() || "",
        expiresAt: apiKey.expiresAt?.toISOString().split("T")[0] || "",
        allowedIps: apiKey.allowedIps || "",
        allowedModels: models,
        channelId: apiKey.channelId || "",
      });
      setModelSearch("");
      setModelPanelOpen(false);
    }
  }, [apiKey]);

  // 当前生效的渠道 ID：表单选择 > Cloudflare 默认渠道。
  // 默认渠道 = channelsProp 里 type=cloudflare 的那个。
  const defaultCfChannelId = useMemo(
    () => channelsProp.find((c) => c.type === "cloudflare")?.id || null,
    [channelsProp],
  );
  const effectiveChannelId = formData.channelId || defaultCfChannelId;

  // 按渠道过滤可选模型：模型 channelId 匹配当前渠道 OR 模型属于历史记录但渠道未知。
  const channelModels = useMemo(() => {
    if (!effectiveChannelId) return modelsProp;
    const filtered = modelsProp.filter((m) => m.channelId === effectiveChannelId);
    // 合并历史已勾选但不在当前渠道列表里的模型（避免编辑时丢失，但视觉上提示）
    const filteredIds = new Set(filtered.map((m) => m.id));
    const orphans = (initialModels as string[])
      .filter((id) => !filteredIds.has(id))
      .map((id) => ({
        id,
        name: `${id.split("/").pop() || id}（不属于当前渠道）`,
        channelId: null,
      }));
    return [...filtered, ...orphans];
  }, [modelsProp, effectiveChannelId, initialModels]);

  const filteredModels = useMemo(() => {
    const q = modelSearch.toLowerCase().trim();
    if (!q) return channelModels;
    return channelModels.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [channelModels, modelSearch]);

  const toggleModel = (id: string) => {
    setFormData(f => ({
      ...f,
      allowedModels: f.allowedModels.includes(id)
        ? f.allowedModels.filter(i => i !== id)
        : [...f.allowedModels, id],
    }));
  };

  // 切换渠道时自动重置白名单：移除不属于新渠道的所有已勾选模型。
  function handleChannelChange(newChannelId: string) {
    const effective = newChannelId || defaultCfChannelId;
    setFormData((f) => {
      if (!effective) return { ...f, channelId: newChannelId, allowedModels: [] };
      const validIds = new Set(
        modelsProp.filter((m) => m.channelId === effective).map((m) => m.id),
      );
      return {
        ...f,
        channelId: newChannelId,
        allowedModels: f.allowedModels.filter((id) => validIds.has(id)),
      };
    });
  }

  // Close panel on outside click
  useEffect(() => {
    if (!modelPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setModelPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelPanelOpen]);

  if (!apiKey) return null;
  const keyId: string = apiKey.id;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const quotaCredits = formData.quotaCredits.trim();
      const quotaValue = quotaCredits ? parseInt(quotaCredits, 10) : null;
      const result = await updateApiKeyAction(keyId, {
        name: formData.name,
        quotaCredits: quotaValue,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).getTime() : null,
        allowedIps: formData.allowedIps || null,
        allowedModels: formData.allowedModels.length > 0 ? JSON.stringify(formData.allowedModels) : null,
        channelId: formData.channelId || null,
      });
      if (result.success) {
        // 强制刷新页面数据，确保显示最新的 key 名字
        router.refresh();
        // 短暂延迟后关闭对话框，让数据有时间更新
        setTimeout(() => onClose(), 100);
      } else {
        alert(result.error || "更新失败");
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">编辑 API Key</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* 名称 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* 渠道 */}
          {channelsProp.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">绑定渠道</label>
              <select
                value={formData.channelId}
                onChange={(e) => handleChannelChange(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">默认（Cloudflare）</option>
                {channelsProp
                  .filter((ch) => ch.type !== "cloudflare")
                  .map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} ({ch.type})
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                选择后，使用此 Key 的请求将路由到该渠道；切换渠道会自动重置模型白名单
              </p>
            </div>
          )}

          {/* 总额度 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              总额度（credits）
            </label>
            <input
              type="number"
              value={formData.quotaCredits}
              onChange={(e) => setFormData({ ...formData, quotaCredits: e.target.value })}
              placeholder="留空=无限额度"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* 已使用 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">已使用 / 剩余</label>
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  已使用：{apiKey.quotaCredits !== null && apiKey.remainCredits !== null
                    ? (apiKey.quotaCredits - apiKey.remainCredits).toLocaleString()
                    : "—"} cr
                </span>
                <span>剩余：{apiKey.remainCredits?.toLocaleString() || "无限制"}</span>
              </div>
              {apiKey.quotaCredits !== null && apiKey.remainCredits !== null && (
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, ((apiKey.quotaCredits - apiKey.remainCredits) / apiKey.quotaCredits) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground text-center">
                    使用率：{Math.round(((apiKey.quotaCredits - apiKey.remainCredits) / apiKey.quotaCredits) * 100)}%
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 有效期 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">有效期</label>
            <input
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">留空=永不过期</p>
          </div>

          {/* IP 白名单 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">IP 白名单</label>
            <textarea
              value={formData.allowedIps}
              onChange={(e) => setFormData({ ...formData, allowedIps: e.target.value })}
              placeholder="多个 IP 用逗号分隔，留空=不限制"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* 模型白名单 - 搜索+选择 */}
          <div ref={panelRef} className="relative">
            <label className="mb-1.5 block text-sm font-medium">
              模型白名单
              {formData.allowedModels.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  （已选 {formData.allowedModels.length} 个）
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={() => setModelPanelOpen(!modelPanelOpen)}
              className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              <span className="text-muted-foreground">
                {formData.allowedModels.length === 0
                  ? "留空=全部模型"
                  : `已选择 ${formData.allowedModels.length} 个模型`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            {modelPanelOpen && (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                {/* 搜索 */}
                <div className="border-b border-border p-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="搜索模型 ID..."
                      className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
                    />
                  </div>
                </div>
                {/* 模型列表 */}
                <div className="overflow-y-auto max-h-60">
                  {filteredModels.length === 0 ? (
                    <p className="p-3 text-xs text-center text-muted-foreground">无匹配模型</p>
                  ) : (
                    filteredModels.map((m) => {
                      const selected = formData.allowedModels.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleModel(m.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2"
                        >
                          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            selected ? "border-primary bg-primary text-white" : "border-border"
                          }`}>
                            {selected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="truncate">{m.id}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 按钮 */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "保存中..." : "保存"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              取消
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
