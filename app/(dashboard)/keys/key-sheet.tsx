"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { updateApiKeyAction } from "./actions";
import type { ApiKeyRow } from "./columns";

// 常用模型列表（后续可以从 API 动态获取）
const POPULAR_MODELS = [
  { id: "@cf/meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B" },
  { id: "@cf/meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
  { id: "@cf/qwen/qwen2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B" },
  { id: "@cf/deepseek-ai/deepseek-v3", name: "DeepSeek V3" },
  { id: "@cf/black-forest-labs/flux-1-schnell", name: "FLUX.1 Schnell" },
  { id: "@cf/stabilityai/stable-diffusion-xl-base-1.0", name: "SDXL 1.0" },
  { id: "@cf/baai/bge-base-en-v1.5", name: "BGE Base EN v1.5 (Embedding)" },
];

interface KeySheetProps {
  apiKey: ApiKeyRow | null;
  onClose: () => void;
}

export function KeySheet({ apiKey, onClose }: KeySheetProps) {
  const [isPending, startTransition] = useTransition();

  // 解析已有的模型白名单
  const initialModels = apiKey?.allowedModels ? (() => {
    try {
      return JSON.parse(apiKey.allowedModels);
    } catch {
      return [];
    }
  })() : [];

  const [formData, setFormData] = useState({
    name: apiKey?.name || "",
    remainCredits: apiKey?.remainCredits?.toString() || "",
    expiresAt: apiKey?.expiresAt?.toISOString().split("T")[0] || "",
    allowedIps: apiKey?.allowedIps || "",
    allowedModels: initialModels as string[],
  });

  if (!apiKey) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey) return; // Type guard

    startTransition(async () => {
      const result = await updateApiKeyAction(apiKey.id, {
        name: formData.name,
        remainCredits: formData.remainCredits ? parseInt(formData.remainCredits) : null,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).getTime() : null,
        allowedIps: formData.allowedIps || null,
        allowedModels: formData.allowedModels.length > 0 ? JSON.stringify(formData.allowedModels) : null,
      });
      if (result.success) {
        onClose();
      } else {
        alert(result.error || "更新失败");
      }
    });
  }

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet 侧边栏 */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">编辑 API Key</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {/* 名称 */}
          <div>
            <label className="mb-2 block text-sm font-medium">名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* 额度限制 */}
          <div>
            <label className="mb-2 block text-sm font-medium">额度限制（credits）</label>
            <input
              type="number"
              value={formData.remainCredits}
              onChange={(e) => setFormData({ ...formData, remainCredits: e.target.value })}
              placeholder="留空=无限额度"
              className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              当前余额：{apiKey.remainCredits?.toLocaleString() || "无限制"}
            </p>
          </div>

          {/* 有效期 */}
          <div>
            <label className="mb-2 block text-sm font-medium">有效期</label>
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
            <label className="mb-2 block text-sm font-medium">IP 白名单</label>
            <textarea
              value={formData.allowedIps}
              onChange={(e) => setFormData({ ...formData, allowedIps: e.target.value })}
              placeholder="多个 IP 用逗号分隔，留空=不限制"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* 模型白名单 */}
          <div>
            <label className="mb-2 block text-sm font-medium">模型白名单</label>
            <MultiSelect
              value={formData.allowedModels}
              options={POPULAR_MODELS}
              onChange={(models) => setFormData({ ...formData, allowedModels: models })}
              placeholder="留空=全部模型"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              选择允许调用的模型，留空则不限制
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
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
