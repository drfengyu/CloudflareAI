import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 记录列表的翻页条：保留当前筛选参数，只改 page。
 *
 * 不传 `totalPages` 时退化为「上一页 / 下一页」——钱包流水按 11 条探测是否还有下一页，
 * 为省一次 COUNT 拿不到总数。
 */
export function Pagination({
  page,
  totalPages,
  hasNext,
  basePath,
  params,
}: {
  page: number;
  totalPages?: number;
  hasNext?: boolean;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const canPrev = page > 1;
  const canNext = totalPages !== undefined ? page < totalPages : Boolean(hasNext);
  if (!canPrev && !canNext) return null;

  const href = (target: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) qs.set(key, value);
    }
    if (target > 1) qs.set("page", String(target));
    const query = qs.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const linkClass = "rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary";
  const disabledClass = "rounded-lg border border-border px-3 py-1.5 text-xs opacity-40";

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      {canPrev ? (
        <Link href={href(page - 1)} className={linkClass}>
          上一页
        </Link>
      ) : (
        <span className={disabledClass}>上一页</span>
      )}
      <span className={cn("px-3 text-xs text-muted-foreground")}>
        {totalPages !== undefined ? `${page} / ${totalPages}` : `第 ${page} 页`}
      </span>
      {canNext ? (
        <Link href={href(page + 1)} className={linkClass}>
          下一页
        </Link>
      ) : (
        <span className={disabledClass}>下一页</span>
      )}
    </div>
  );
}
