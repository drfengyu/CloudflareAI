"use client";

import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Copy, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createApiKeyAction } from "./actions";

interface Channel {
  id: string;
  name: string;
  type: string | null;
  status: number;
}

export function KeysClient() {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => {
        const active = (data.data || []).filter((c: Channel) => c.status === 1);
        setChannels(active);
      })
      .catch(() => {});
  }, []);

  async function handleCreate(formData: FormData) {
    const result = await createApiKeyAction(formData);
    if (result.success && result.key) {
      setNewKey(result.key);
    } else {
      alert(result.error || "创建失败");
    }
  }

  function handleCopy() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">创建新的 API Key</h3>

      {newKey ? (
        <div className="space-y-3 rounded-lg border border-primary bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">
            ⚠️ 请立即复制并保存，密钥仅显示一次
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-card p-2 text-xs font-mono">
              {newKey}
            </code>
            <Button size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button variant="outline" onClick={() => setNewKey(null)} className="w-full">
            关闭
          </Button>
        </div>
      ) : (
        <form action={handleCreate} className="space-y-2">
          <div className="flex gap-2">
            <input
              name="name"
              placeholder="密钥名称（如：claude-code-dev）"
              required
              className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-[color:var(--primary)]"
            />
            <SubmitButton />
          </div>
          {channels.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="channelId" className="text-xs text-muted-foreground whitespace-nowrap">
                绑定渠道
              </label>
              <select
                name="channelId"
                id="channelId"
                className="h-8 flex-1 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-[color:var(--primary)]"
              >
                <option value="">默认（Cloudflare）</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type})
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Plus className="h-4 w-4" />
      创建
    </Button>
  );
}
