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
}

const NAV: NavGroup[] = [
  {
    title: "总览",
    items: [
      { href: "/dashboard", label: "用量总览", icon: LayoutDashboard },
      { href: "/models", label: "模型库", icon: Boxes },
    ],
  },
  {
    title: "在线生成",
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
    title: "账户",
    items: [
      { href: "/history", label: "使用记录", icon: History },
      { href: "/keys", label: "API 密钥", icon: KeyRound },
      { href: "/settings", label: "设置", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-5 py-4 text-sm font-semibold"
      >
        <Cpu className="h-5 w-5 text-primary" />
        <span>Cloudflare AI Console</span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {NAV.map((group) => (
          <div key={group.title}>
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-surface-2 text-foreground"
                          : "text-muted hover:bg-surface-2 hover:text-foreground",
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

      <div className="border-t border-border px-5 py-3 text-[11px] text-muted">
        Powered by Workers AI
      </div>
    </aside>
  );
}
