"use client";

import Link from "next/link";
import { Cpu, LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitch } from "@/components/theme/theme-switch";

interface HeaderUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function AppHeader({
  user,
  signOutAction,
  siteName = "Cloudflare AI",
}: {
  user?: HeaderUser;
  signOutAction: () => void;
  siteName?: string;
}) {
  const label = user?.name || user?.email || "未登录";
  const initial = label.trim().charAt(0).toUpperCase() || "U";

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background/92 px-4 backdrop-blur-md">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 font-serif text-[15px] font-semibold tracking-[0.06em]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Cpu className="h-4 w-4" />
        </span>
        <span>{siteName}</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <ThemeSwitch />
      <DropdownMenu>
        <DropdownMenuTrigger className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-7 w-7">
            {user?.image ? <AvatarImage src={user.image} alt={label} /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2 normal-case">
            <UserIcon className="h-3.5 w-3.5" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name || "用户"}
              </p>
              {user?.email && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {user.email}
                </p>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            <DropdownMenuItem
              asChild
              className="text-destructive focus:text-destructive"
            >
              <button type="submit" className="w-full">
                <LogOut className="h-4 w-4" /> 退出登录
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
