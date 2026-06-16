"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  MessageSquare,
  Image as ImageIcon,
  Eye,
  Mic,
  Languages,
  Clapperboard,
  History,
  KeyRound,
  Settings,
  Cpu,
  DollarSign,
  Wallet,
  Users,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const NAV: NavGroup[] = [
  {
    title: "通用",
    items: [
      { href: "/dashboard", label: "数据看板", icon: LayoutDashboard },
      { href: "/models", label: "模型库", icon: Boxes },
      { href: "/pricing", label: "定价", icon: DollarSign },
    ],
  },
  {
    title: "在线体验",
    items: [
      { href: "/playground/text", label: "文本生成", icon: MessageSquare },
      { href: "/playground/image", label: "文生图", icon: ImageIcon },
      { href: "/playground/vision", label: "图像理解", icon: Eye },
      { href: "/playground/speech", label: "语音", icon: Mic },
      { href: "/playground/embeddings", label: "嵌入", icon: Boxes },
      { href: "/playground/translate", label: "翻译", icon: Languages },
      { href: "/playground/video", label: "视频生成", icon: Clapperboard },
    ],
  },
  {
    title: "个人",
    items: [
      { href: "/wallet", label: "我的钱包", icon: Wallet },
      { href: "/keys", label: "API 密钥", icon: KeyRound },
      { href: "/history", label: "使用记录", icon: History },
      { href: "/settings", label: "设置", icon: Settings },
    ],
  },
  {
    title: "管理",
    adminOnly: true,
    items: [
      { href: "/admin/users", label: "用户管理", icon: Users },
      { href: "/admin/redemptions", label: "兑换码", icon: Ticket },
      { href: "/admin/settings", label: "系统设置", icon: Settings },
    ],
  },
];

export function Sidebar({ userRole = 1 }: { userRole?: number }) {
  const pathname = usePathname();

  // Filter out admin-only groups for non-admin users (role < 10)
  const visibleGroups = NAV.filter((group) => !group.adminOnly || userRole >= 10);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-5 py-4 text-sm font-semibold"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Cpu className="h-4 w-4" />
        </span>
        <span>Cloudflare AI</span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
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
          </div>
        ))}
      </nav>
    </aside>
  );
}
