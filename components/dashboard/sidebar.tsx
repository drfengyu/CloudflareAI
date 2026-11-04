"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive, visibleGroups } from "./nav-data";

/**
 * 窄屏「菜单」抽屉里的完整分组清单（顶部导航只铺当前模块，这里一次给全）。
 * onNavigate 在每次点击链接后调用，供抽屉关闭自己。
 */
export function SidebarNav({
  userRole = 1,
  siteName = "Cloudflare AI",
  onNavigate,
}: {
  userRole?: number;
  siteName?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = visibleGroups(userRole);

  const isActive = (href: string) => isNavActive(pathname, href);

  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2 px-5 py-4 font-serif text-[15px] font-semibold tracking-[0.06em]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Cpu className="h-4 w-4" />
        </span>
        <span>{siteName}</span>
      </Link>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groups.map((group) => {
          // 组里有当前页时强制展开，否则尊重用户的折叠选择
          const open =
            group.items.some((item) => isActive(item.href)) ||
            collapsed[group.title] !== true;

          return (
            <div key={group.title}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [group.title]: open }))
                }
                className="flex w-full items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>{group.title}</span>
                <span className="tabular-nums opacity-60">{group.items.length}</span>
                <ChevronRight
                  className={cn(
                    "ml-auto h-3.5 w-3.5 transition-transform",
                    open && "rotate-90",
                  )}
                />
              </button>

              {open ? (
                <ul className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}
