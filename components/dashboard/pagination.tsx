"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 记录列表的翻页条：保留当前筛选参数，只改 page。
 *
 * 不传 `totalPages` 时退化为「上一页 / 下一页」——钱包流水按多取一条探测是否还有下一页，
 * 为省一次 COUNT 拿不到总数。传 `onPageChange` 则切换为局部刷新模式：渲染按钮而不是链接，
 * 由调用方自行取数，URL 不变。
 */
export function Pagination({
  page,
  totalPages,
  hasNext,
  basePath,
  params,
  onPageChange,
  disabled,
}: {
  page: number;
  totalPages?: number;
  hasNext?: boolean;
  /** 链接模式的目标路径；局部刷新模式可不传。 */
  basePath?: string;
  params?: Record<string, string | undefined>;
  /** 传入后改为局部翻页，不跳转、不改 URL。 */
  onPageChange?: (page: number) => void;
  disabled?: boolean;
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
    return query ? `${basePath}?${query}` : (basePath ?? "#");
  };

  const controlClass = "rounded-lg border border-border px-3 py-1.5 text-xs";
  const linkClass = cn(controlClass, "hover:bg-secondary");
  const buttonClass = cn(controlClass, "hover:bg-secondary disabled:opacity-40");
  const disabledClass = cn(controlClass, "opacity-40");

  const prev = !canPrev ? (
    <span className={disabledClass}>上一页</span>
  ) : onPageChange ? (
    <button
      type="button"
      className={buttonClass}
      disabled={disabled}
      onClick={() => onPageChange(page - 1)}
    >
      上一页
    </button>
  ) : (
    <Link href={href(page - 1)} className={linkClass}>
      上一页
    </Link>
  );

  const next = !canNext ? (
    <span className={disabledClass}>下一页</span>
  ) : onPageChange ? (
    <button
      type="button"
      className={buttonClass}
      disabled={disabled}
      onClick={() => onPageChange(page + 1)}
    >
      下一页
    </button>
  ) : (
    <Link href={href(page + 1)} className={linkClass}>
      下一页
    </Link>
  );

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      {prev}
      <span className={cn("px-3 text-xs text-muted-foreground")}>
        {totalPages !== undefined ? `${page} / ${totalPages}` : `第 ${page} 页`}
      </span>
      {next}
    </div>
  );
}
