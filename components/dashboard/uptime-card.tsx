"use client";

import { useEffect, useState } from "react";
import { Activity, RotateCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { UptimeResult, UptimeStatus } from "@/lib/settings/dashboard-info";
import {
  INFO_CARD_BODY_CLASS,
  InfoCardEmpty,
  InfoCardHeader,
} from "./dashboard-info-shell";

const DOT_CLASS: Record<UptimeStatus, string> = {
  up: "bg-[color:var(--success)]",
  down: "bg-[color:var(--destructive)]",
  maint: "bg-[color:var(--warning)]",
  pending: "bg-[color:var(--info)]",
};

const STATUS_LABEL: Record<UptimeStatus, string> = {
  up: "正常",
  down: "异常",
  maint: "维护中",
  pending: "等待中",
};

/**
 * 服务可用性：挂载后从 /api/uptime 拉取 Uptime Kuma 数据，可手动刷新。
 * 未配置时不发请求，直接展示引导空状态。
 */
export function UptimeCard({
  configured,
  className,
}: {
  configured: boolean;
  className?: string;
}) {
  const [data, setData] = useState<UptimeResult | null>(null);
  const [loading, setLoading] = useState(configured);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/uptime", { cache: "no-store" });
        const result = (await res.json()) as UptimeResult;
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) {
          setData({ configured: true, ok: false, monitors: [], error: "无法访问监控接口" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, reloadKey]);

  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const monitors = data?.monitors ?? [];
  const showList = configured && monitors.length > 0;

  return (
    <Card className={className}>
      <InfoCardHeader
        icon={<Activity className="h-4 w-4" />}
        title="服务可用性"
        action={
          configured ? (
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title="刷新监控数据"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          ) : null
        }
      />

      {!configured ? (
        <InfoCardEmpty
          icon={<Activity className="h-6 w-6" />}
          title="暂无监控数据"
          hint="请联系系统管理员在系统设置中配置Uptime"
        />
      ) : showList ? (
        <CardContent className={INFO_CARD_BODY_CLASS}>
          <ul className="space-y-2 pt-3">
            {monitors.map((m, i) => (
              <li
                key={`${m.name}-${i}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[m.status]}`} />
                <span className="min-w-0 flex-1 truncate text-foreground" title={STATUS_LABEL[m.status]}>
                  {m.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.uptime}</span>
              </li>
            ))}
          </ul>
          {data?.error ? (
            <p className="text-xs text-[color:var(--warning)]">{data.error}</p>
          ) : null}
        </CardContent>
      ) : (
        <CardContent className="flex h-[300px] flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-sm font-semibold text-foreground">
            {loading ? "正在获取监控数据…" : "暂无监控数据"}
          </p>
          {data?.error ? (
            <p className="max-w-[240px] text-xs text-muted-foreground">{data.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {loading ? "请稍候" : "监控接口未返回任何服务"}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
