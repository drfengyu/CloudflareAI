"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealApiKeyAction } from "./actions";

interface KeyDisplayProps {
  keyId: string;
  prefix: string;
}

export function KeyDisplay({ keyId, prefix }: KeyDisplayProps) {
  const [revealed, setRevealed] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleReveal = async () => {
    if (revealed) {
      // 隐藏
      setRevealed(false);
      return;
    }

    // 显示
    if (fullKey) {
      // 已经获取过，直接显示
      setRevealed(true);
      return;
    }

    // 首次获取
    setLoading(true);
    const result = await revealApiKeyAction(keyId);
    setLoading(false);

    if (result.success && result.key) {
      setFullKey(result.key);
      setRevealed(true);
    } else {
      alert(result.error || "获取失败");
    }
  };

  const handleCopy = async () => {
    const textToCopy = fullKey || `${prefix}••••••••`;

    if (!fullKey) {
      alert("请先点击眼睛图标查看完整密钥");
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert("复制失败");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="text-xs text-muted-foreground flex-1">
        {revealed && fullKey ? fullKey : `${prefix}••••••••`}
      </code>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReveal}
        disabled={loading}
        className="h-6 w-6 p-0"
      >
        {loading ? (
          <span className="text-xs">...</span>
        ) : revealed ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-6 w-6 p-0"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
