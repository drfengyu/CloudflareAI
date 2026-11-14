import {
  Boxes,
  BookOpen,
  DollarSign,
  Eye,
  Gift,
  History,
  Inbox,
  Image as ImageIcon,
  KeyRound,
  Languages,
  LayoutDashboard,
  Library,
  ListChecks,
  MessagesSquare,
  PawPrint,
  PiggyBank,
  Radio,
  Receipt,
  ScrollText,
  Settings,
  Swords,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/** 顶部模块导航与窄屏抽屉共用同一份结构，避免两处各自演化。 */
export const NAV: NavGroup[] = [
  {
    title: "通用",
    items: [
      { href: "/dashboard", label: "数据看板", icon: LayoutDashboard },
      { href: "/models", label: "模型库", icon: Boxes },
      { href: "/pricing", label: "定价", icon: DollarSign },
      { href: "/docs", label: "API 文档", icon: BookOpen },
    ],
  },
  {
    title: "活动中心",
    // 模块首页取第一项：先落到常驻的任务成就，限时玩法统一排在后面
    items: [
      { href: "/tasks", label: "任务成就", icon: ListChecks },
      { href: "/cashback", label: "活动总览", icon: PiggyBank },
      { href: "/trial", label: "每日试炼", icon: Swords },
      { href: "/workshop", label: "灵宠工坊", icon: PawPrint },
      { href: "/collection", label: "星图共鸣", icon: Library },
    ],
  },
  {
    title: "在线体验",
    items: [
      { href: "/chat", label: "AI 对话", icon: MessagesSquare },
      { href: "/playground/image", label: "文生图", icon: ImageIcon },
      { href: "/playground/vision", label: "图像理解", icon: Eye },
      { href: "/playground/embeddings", label: "嵌入", icon: Boxes },
      { href: "/playground/translate", label: "翻译", icon: Languages },
    ],
  },
  {
    title: "个人",
    items: [
      { href: "/messages", label: "站内信", icon: Inbox },
      { href: "/wallet", label: "我的钱包", icon: Wallet },
      { href: "/ledger", label: "个人账本", icon: ScrollText },
      { href: "/invite", label: "邀请好友", icon: Gift },
      { href: "/keys", label: "API 密钥", icon: KeyRound },
      { href: "/history", label: "使用记录", icon: History },
      { href: "/settings", label: "设置", icon: Settings },
    ],
  },
  {
    title: "管理",
    adminOnly: true,
    items: [
      { href: "/admin/channels", label: "渠道管理", icon: Radio },
      { href: "/admin/users", label: "用户管理", icon: Users },
      { href: "/admin/redemptions", label: "兑换码", icon: Ticket },
      { href: "/admin/orders", label: "订单管理", icon: Receipt },
      { href: "/admin/activity", label: "活动记录", icon: ScrollText },
      { href: "/admin/pricing", label: "定价管理", icon: Settings },
      { href: "/admin/settings", label: "系统设置", icon: Settings },
    ],
  },
];

/** 按当前路径筛掉无权限的模块。 */
export function visibleGroups(userRole: number) {
  return NAV.filter((group) => !group.adminOnly || userRole >= 10);
}

/** /dashboard 是首页，不能被 /dashboard/xxx 之类的判断顺带点亮；其余按前缀匹配。 */
export function isNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

/** 当前页落在哪个模块里；都不落在就回第一个模块。 */
export function activeGroup(pathname: string, userRole: number): NavGroup {
  const groups = visibleGroups(userRole);
  return groups.find((g) => g.items.some((i) => isNavActive(pathname, i.href))) ?? groups[0];
}
