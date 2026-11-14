"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, LayoutDashboard, ListChecks, Wallet } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar";

/** 底部主导航：窄屏下高频入口直接够得着，完整分组仍收在「菜单」抽屉里。 */
const TABS = [
  { href: "/dashboard", label: "看板", icon: LayoutDashboard },
  { href: "/models", label: "模型库", icon: Boxes },
  { href: "/tasks", label: "活动", icon: ListChecks },
  { href: "/wallet", label: "钱包", icon: Wallet },
];

export function MobileNav({
  userRole,
  siteName,
}: {
  userRole?: number;
  siteName?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-background/92 backdrop-blur-md md:hidden"
      aria-label="主导航"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.3 : 2} />
            {tab.label}
          </Link>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
              open ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span className="flex h-[18px] items-center gap-[3px]">
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
              <span className="h-[3px] w-[3px] rounded-full bg-current" />
            </span>
            菜单
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="flex w-64 flex-col gap-0 border-r-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <SidebarNav
            userRole={userRole}
            siteName={siteName}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </nav>
  );
}
