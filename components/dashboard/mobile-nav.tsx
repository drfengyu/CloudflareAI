"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar";

/**
 * 移动端导航：汉堡按钮 + 左侧抽屉，仅在 < md 显示。
 * 桌面端由 Sidebar 渲染，二者不会同时出现。
 */
export function MobileNav({
  userRole,
  siteName,
}: {
  userRole?: number;
  siteName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="打开导航菜单"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
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
  );
}
