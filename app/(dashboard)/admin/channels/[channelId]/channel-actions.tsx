"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ChannelActionsProps {
  channelId: string;
}

export function ChannelActions({ channelId }: ChannelActionsProps) {
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleHealthCheck() {
    setIsHealthChecking(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/health`);
      const data = await res.json();
      if (data.ok) {
        toast.success("健康检查通过: " + (data.message || ""));
      } else {
        toast.error("健康检查失败: " + (data.message || ""));
      }
    } catch (error) {
      toast.error("请求失败: " + (error as Error).message);
    } finally {
      setIsHealthChecking(false);
    }
  }

  async function handleSyncModels() {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/models`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "同步完成");
        // 刷新页面以显示新模型
        window.location.reload();
      } else {
        toast.error(data.error || "同步失败");
      }
    } catch (error) {
      toast.error("请求失败: " + (error as Error).message);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleHealthCheck}
        disabled={isHealthChecking}
      >
        <Activity className="h-3.5 w-3.5" />
        {isHealthChecking ? "检查中..." : "健康检查"}
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleSyncModels}
        disabled={isSyncing}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? "同步中..." : "同步模型"}
      </Button>
    </div>
  );
}
