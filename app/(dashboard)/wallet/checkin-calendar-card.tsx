"use client";

import { useState, useMemo, useCallback } from "react";
import { CalendarDays, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCheckinStatus, performCheckin } from "./checkin-actions";

interface CheckinRecord {
  checkinDate: string;
  quotaAwarded: number;
}

interface CheckinStats {
  totalQuota: number;
  totalCheckins: number;
  checkinCount: number;
  checkedInToday: boolean;
  records: CheckinRecord[];
}

interface CheckinData {
  enabled: boolean;
  minQuota: number;
  maxQuota: number;
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
        // 默认状态：已签到时收起
        if (!collapsed) {
          setCollapsed(result.data.stats.checkedInToday);
        }
      } else {
        toast.error(result.message || "获取签到状态失败");
      }
    } catch (error) {
      toast.error("获取签到状态失败");
    } finally {
      setLoading(false);
    }
  }, [currentMonthStr, collapsed]);

  // 初始加载
  useMemo(() => {
    fetchData();
  }, [fetchData]);

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

  const todayString = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const checkedToday = data?.stats?.checkedInToday === true;
  const todayAward = checkinRecordsMap[todayString];

  const handleCheckin = useCallback(async () => {
    setCheckinLoading(true);
    try {
      const result = await performCheckin();
      if (result.success && result.data) {
        toast.success(`签到成功！获得 ${result.data.quotaAwarded.toFixed(2)} cr`);
        fetchData(); // 刷新数据
      } else {
        toast.error(result.message || "签到失败");
      }
    } catch (error) {
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

  // 构建日历网格
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // 填充前置空白天
    for (let i = 0; i < startDayOfWeek; i++) {
      const d = new Date(year, month, -startDayOfWeek + i + 1);
      days.push({ date: d, isCurrentMonth: false });
    }

    // 填充当前月天数
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // 填充后置空白天（补齐 7 的倍数）
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
      }
    }

    return days;
  }, [currentMonth]);

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

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
      <CardContent className="border-b py-6">
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
                {collapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {checkedToday && todayAward !== undefined
                  ? `今日 +${todayAward.toFixed(2)} cr`
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
          <div className="grid grid-cols-3 gap-px border-b bg-border">
            <div className="bg-card p-5 text-center">
              <div className="text-2xl font-semibold tabular-nums">
                {data.stats.totalCheckins}
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                累计签到
              </div>
            </div>
            <div className="bg-card p-5 text-center">
              <div className="text-2xl font-semibold tabular-nums">
                {monthlyQuota.toFixed(0)} cr
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                本月获得
              </div>
            </div>
            <div className="bg-card p-5 text-center">
              <div className="text-2xl font-semibold tabular-nums">
                {data.stats.totalQuota.toFixed(0)} cr
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-1">
                累计获得
              </div>
            </div>
          </div>

          {/* Calendar */}
          <CardContent className="p-6 space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{currentMonthStr}</h4>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Week day headers */}
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((dayObj, idx) => {
                const dateStr = `${dayObj.date.getFullYear()}-${String(
                  dayObj.date.getMonth() + 1
                ).padStart(2, "0")}-${String(dayObj.date.getDate()).padStart(2, "0")}`;
                const isToday = dateStr === todayString;
                const quotaAwarded = checkinRecordsMap[dateStr];
                const isCheckedIn = quotaAwarded !== undefined;
                const dayNum = dayObj.date.getDate();

                return (
                  <button
                    key={idx}
                    disabled={!dayObj.isCurrentMonth}
                    className={cn(
                      "relative flex h-10 w-full flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors",
                      !dayObj.isCurrentMonth && "text-muted-foreground/40 cursor-default",
                      isToday && "bg-primary text-primary-foreground hover:bg-primary/90",
                      !isToday && dayObj.isCurrentMonth && "hover:bg-surface",
                      !isToday && isCheckedIn && "font-semibold"
                    )}
                    title={isCheckedIn ? `已签到 +${quotaAwarded.toFixed(2)} cr` : undefined}
                  >
                    <span className="tabular-nums">{dayNum}</span>
                    {isCheckedIn && !isToday && (
                      <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className="border-t pt-4 text-center text-xs text-muted-foreground">
              每天只能签到一次
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                <li>每日签到获得随机额度奖励（{data.minQuota}-{data.maxQuota} cr）</li>
                <li>奖励将直接充值到账户余额</li>
                <li>已签到日期显示绿点标记</li>
              </ul>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
