import type { ReactNode } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** 三张信息卡统一高度，保证一行卡片齐平。 */
export const INFO_CARD_BODY_CLASS = "h-[300px] space-y-3 overflow-y-auto pr-1";

export function InfoCardHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <CardHeader className="flex items-center gap-2 border-b border-border">
      <span className="text-muted-foreground">{icon}</span>
      <CardTitle>{title}</CardTitle>
      {action ? (
        <div className="ml-auto flex items-center gap-3">{action}</div>
      ) : null}
    </CardHeader>
  );
}

/** 空状态：图标 + 「暂无 X」 + 引导管理员去系统设置配置。 */
export function InfoCardEmpty({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <CardContent className="flex h-[300px] flex-col items-center justify-center gap-1.5 text-center">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </CardContent>
  );
}
