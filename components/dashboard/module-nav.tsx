"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { pillTabClass } from "./section";
import { activeGroup, isNavActive, visibleGroups } from "./nav-data";

/**
 * 桌面端顶部模块导航（两级）：
 * 第一级是五个模块药丸，点上去落到该模块首页；第二级只铺当前模块的条目。
 * 窄屏不渲染，仍由底部标签栏 + 「菜单」抽屉接管。
 */
export function ModuleNav({ userRole = 1 }: { userRole?: number }) {
  const pathname = usePathname();
  const groups = visibleGroups(userRole);
  const current = activeGroup(pathname, userRole);

  return (
    <nav aria-label="模块导航" className="hidden shrink-0 border-b border-border md:block">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-8 pt-3">
        {groups.map((group) => (
          <Link
            key={group.title}
            href={group.items[0].href}
            aria-current={group.title === current.title ? "page" : undefined}
            className={pillTabClass(group.title === current.title)}
          >
            {group.title}
          </Link>
        ))}
      </div>

      <ul className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-8 pb-2 pt-1.5 xl:gap-x-8">
        {current.items.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-2.5 py-1.5 text-[13px] transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
