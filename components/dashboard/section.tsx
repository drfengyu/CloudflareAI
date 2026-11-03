import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 页面正文的统一版心：参考站是「居中窄栏文档」而不是满铺控制台，
 * 宽屏下把内容收成一行可读宽度，两侧留白交给纸面背景。
 */
export function PageBody({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "reading";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-6 px-5 py-8 sm:px-8",
        width === "wide" ? "max-w-6xl" : "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 分节：衬线居中小标题 + 一行轻字重副标题，节与节之间只留发丝线。 */
export function PageSection({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border pt-8", className)}>
      <div className="mb-6 text-center">
        <h2 className="font-serif text-[1.35rem] font-semibold tracking-[0.02em] text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1.5 text-[13px] font-light text-muted-foreground">{subtitle}</p>
        ) : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** 药丸筛选的样式：参考站的 .menu-tab —— 描边圆角胶囊，选中态填主色。 */
export const pillTabClass = (active: boolean) =>
  cn(
    "rounded-full border px-4 py-1.5 text-xs transition-colors",
    active
      ? "border-primary bg-primary font-medium text-primary-foreground"
      : "border-border text-muted-foreground hover:border-[color:var(--primary)] hover:text-foreground",
  );

export function PillTab({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      // 追加在基础样式之后：调用方只能微调，不能把胶囊底子的 class 顶掉
      className={cn(pillTabClass(active), className)}
    />
  );
}
