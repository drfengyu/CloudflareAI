import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCnRelativeTime } from "@/lib/date";
import {
  ANNOUNCEMENT_LIMIT,
  type Announcement,
  type AnnouncementType,
} from "@/lib/settings/dashboard-info";
import {
  INFO_CARD_BODY_CLASS,
  InfoCardEmpty,
  InfoCardHeader,
} from "./dashboard-info-shell";

const DOT_CLASS: Record<AnnouncementType, string> = {
  default: "bg-muted-foreground",
  info: "bg-[color:var(--info)]",
  success: "bg-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]",
  error: "bg-[color:var(--destructive)]",
};

const LEGEND: { label: string; type: AnnouncementType }[] = [
  { label: "默认", type: "default" },
  { label: "进行中", type: "info" },
  { label: "成功", type: "success" },
  { label: "警告", type: "warning" },
  { label: "异常", type: "error" },
];

/** 系统公告：时间轴样式，最新在上，最多展示 ANNOUNCEMENT_LIMIT 条。 */
export function AnnouncementCard({
  items,
  className,
}: {
  items: Announcement[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <InfoCardHeader
        icon={<Bell className="h-4 w-4" />}
        title="系统公告"
        action={
          <>
            <div className="hidden items-center gap-2.5 xl:flex">
              {LEGEND.map((l) => (
                <span
                  key={l.type}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[l.type]}`} />
                  {l.label}
                </span>
              ))}
            </div>
            <Badge tone="outline">显示最新 {ANNOUNCEMENT_LIMIT} 条</Badge>
          </>
        }
      />

      {items.length === 0 ? (
        <InfoCardEmpty
          icon={<Bell className="h-6 w-6" />}
          title="暂无系统公告"
          hint="请联系系统管理员在系统设置中配置公告"
        />
      ) : (
        <CardContent className={INFO_CARD_BODY_CLASS}>
          <ul className="space-y-4 pt-3">
            {items.map((a, i) => (
              <li key={`${a.date}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center pt-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[a.type]}`} />
                  <span className="mt-1 w-px flex-1 bg-border" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatCnRelativeTime(a.date)} · {a.dateLabel}
                  </p>
                  {a.content ? (
                    <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                      {a.content}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
