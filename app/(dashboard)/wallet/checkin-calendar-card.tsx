"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { CalendarDays, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getCheckinStatus, performCheckin } from "./checkin-actions";
import { formatCredits } from "@/lib/billing/credits";
import { cnDateString } from "@/lib/date";

interface CheckinRecord {
  checkinDate: string;
  quotaAwarded: number;
}

interface CheckinStats {
  totalQuota: number;
  totalCheckins: number;
  checkinCount: number;
  checkedInToday: boolean;
  streak: number;
  records: CheckinRecord[];
}

interface CheckinData {
  enabled: boolean;
  minQuota: number;
  maxQuota: number;
  streakEnabled: boolean;
  streakDays: number;
  streakReward: number;
  stats: CheckinStats;
}

export function CheckinCalendarCard() {
  const [data, setData] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const currentMonthStr = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [currentMonth]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCheckinStatus(currentMonthStr);
      if (result.success && result.data) {
        setData(result.data);
        // 默认展开日历，不自动折叠（参考 new-api）
      } else {
        toast.error(result.message || "获取签到状态失败");
      }
    } catch {
      toast.error("获取签到状态失败");
    } finally {
      setLoading(false);
    }
  }, [currentMonthStr]);

  // 初始加载
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!isMounted) return;
      setLoading(true);
      try {
        const result = await getCheckinStatus(currentMonthStr);
        if (isMounted && result.success && result.data) {
          setData(result.data);
        } else if (isMounted) {
          toast.error(result.message || "获取签到状态失败");
        }
      } catch {
        if (isMounted) toast.error("获取签到状态失败");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [currentMonthStr]);

  const checkinRecordsMap = useMemo(() => {
    const map: Record<string, number> = {};
    const records = data?.stats?.records || [];
    records.forEach((record) => {
      map[record.checkinDate] = record.quotaAwarded;
    });
    return map;
  }, [data?.stats?.records]);

  const monthlyQuota = useMemo(() => {
    const records = data?.stats?.records || [];
    return records.reduce((sum, record) => sum + record.quotaAwarded, 0);
  }, [data?.stats?.records]);

  const todayString = useMemo(() => cnDateString(), []);

  const checkedToday = data?.stats?.checkedInToday === true;
  const todayAward = checkinRecordsMap[todayString];

  const handleCheckin = useCallback(async () => {
    setCheckinLoading(true);
    try {
      const result = await performCheckin();
      if (result.success && result.data) {
        const bonus = result.data.streakBonus;
        toast.success(
          bonus > 0
            ? `签到成功！获得 ${result.data.quotaAwarded.toFixed(2)} cr（含连签 ${result.data.streak} 天奖励 ${bonus.toFixed(2)} cr）`
            : `签到成功！获得 ${result.data.quotaAwarded.toFixed(2)} cr`,
        );
        await fetchData(); // 刷新签到数据
        // 刷新页面以更新余额（Server Component 重新渲染）
        window.location.reload();
      } else {
        toast.error(result.message || "签到失败");
      }
    } catch {
      toast.error("签到失败");
    } finally {
      setCheckinLoading(false);
    }
  }, [fetchData]);

  const handlePrevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };

  // 紧凑签到条：只列当月日期，前后月的补位格子对签到没有信息量
  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      dateStr: `${monthStr}-${String(i + 1).padStart(2, "0")}`,
    }));
  }, [currentMonth]);

  if (!data || !data.enabled) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">每日签到</h3>
                <p className="text-sm text-muted-foreground">加载中...</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <CardContent className="border-b px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-80 transition-opacity"
          >
            <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <CalendarDays className="h-5 w-5 text-primary" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">每日签到</h3>
                {checkedToday && (
                  <Badge tone="success" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    已签到
                  </Badge>
                )}
                {data.stats.streak >= 2 && (
                  <Badge tone="info">连签 {data.stats.streak} 天</Badge>
                )}
                {collapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {checkedToday && todayAward !== undefined
                  ? `今日 +${todayAward.toFixed(2)} cr`
                  : data.stats.streak > 0
                    ? `已连续签到 ${data.stats.streak} 天，今天签到可延续`
                    : "每日签到获得随机额度奖励"}
              </p>
            </div>
          </button>
          <Button
            onClick={handleCheckin}
            disabled={checkinLoading || checkedToday}
            size="sm"
          >
            {checkinLoading ? "签到中..." : checkedToday ? "已签到" : "立即签到"}
          </Button>
        </div>
      </CardContent>

      {!collapsed && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
            <div className="bg-card px-3 py-4 text-center">
              <div className="text-xl font-semibold tabular-nums">
                {data.stats.totalCheckins}
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                累计签到
              </div>
            </div>
            <div className="bg-card px-3 py-4 text-center">
              <div className="text-xl font-semibold tabular-nums text-primary">
                {data.stats.streak}
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                连续签到
              </div>
            </div>
            <div className="bg-card px-3 py-4 text-center">
              <div className="text-xl font-semibold tabular-nums">
                {formatCredits(monthlyQuota)}
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                本月获得
              </div>
            </div>
            <div className="bg-card px-3 py-4 text-center">
              <div className="text-xl font-semibold tabular-nums">
                {formatCredits(data.stats.totalQuota)}
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                累计获得
              </div>
            </div>
          </div>

          {/* Calendar */}
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{currentMonthStr}</h4>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <TooltipProvider delayDuration={100}>
              <div className="flex flex-wrap gap-1.5">
                {monthDays.map(({ day, dateStr }) => {
                  const isToday = dateStr === todayString;
                  const quotaAwarded = checkinRecordsMap[dateStr];
                  const isCheckedIn = quotaAwarded !== undefined;

                  const chip = (
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium tabular-nums",
                        !isCheckedIn && "bg-secondary/70 text-muted-foreground",
                        isCheckedIn && !isToday && "bg-primary/15 font-semibold text-primary",
                        isCheckedIn && isToday && "bg-primary text-primary-foreground",
                        isToday && !isCheckedIn && "bg-secondary/70 text-foreground ring-2 ring-primary ring-inset"
                      )}
                    >
                      {day}
                    </span>
                  );

                  if (!isCheckedIn) {
                    return <span key={dateStr}>{chip}</span>;
                  }

                  return (
                    <Tooltip key={dateStr}>
                      <TooltipTrigger asChild>{chip}</TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-medium">{day} 日已签到</div>
                          <div className="mt-0.5 text-muted-foreground">
                            +{formatCredits(quotaAwarded)}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                本月已签到 {data.stats.checkinCount} / {monthDays.length} 天，每天只能签到一次
              </span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-primary/15 ring-1 ring-primary/40" />
                  已签到
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-primary" />
                  今天
                </span>
              </span>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                <li>每日签到获得随机额度奖励（{data.minQuota}-{data.maxQuota} tcr）</li>
                {data.streakEnabled && (
                  <li>
                    连续签到每满 {data.streakDays} 天，额外奖励{" "}
                    {formatCredits(data.streakReward)} tcr
                    {data.stats.streak > 0 &&
                      `（再签 ${data.streakDays - (data.stats.streak % data.streakDays)} 天可达下一档）`}
                  </li>
                )}
                <li>奖励将直接进入临时余额（tcr）</li>
              </ul>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
