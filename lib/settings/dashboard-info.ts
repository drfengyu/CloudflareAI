import { getSetting } from "@/lib/settings";
import { formatCnWallClock, parseCnWallClock } from "@/lib/date";

/**
 * 看板底部「系统公告 / 常见问答 / 服务可用性」三张卡片的数据层。
 * 配置全部落在 option KV 表（`lib/settings`），由 /admin/settings 写入。
 */

export const ANNOUNCEMENT_LIMIT = 20;
export const ANNOUNCEMENT_MAX = 50;
export const FAQ_LIMIT = 20;
export const FAQ_MAX = 50;

export type AnnouncementType = "default" | "info" | "success" | "warning" | "error";
export const ANNOUNCEMENT_TYPES: AnnouncementType[] = [
  "default",
  "info",
  "success",
  "warning",
  "error",
];

/** 存储形态：`date` 是管理员手填的北京墙钟串，保持 JSON 可读且不受浏览器时区影响。 */
export interface AnnouncementInput {
  title: string;
  content?: string;
  type: AnnouncementType;
  date: string;
}

export interface Announcement {
  title: string;
  content?: string;
  type: AnnouncementType;
  /** 真实毫秒时间戳 */
  date: number;
  /** 北京墙钟 `YYYY-MM-DD HH:mm` */
  dateLabel: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  link?: string;
}

function normalizeAnnouncementType(value: unknown): AnnouncementType {
  return ANNOUNCEMENT_TYPES.includes(value as AnnouncementType)
    ? (value as AnnouncementType)
    : "default";
}

/** 读取公告：按发布时间倒序，只取最新 ANNOUNCEMENT_LIMIT 条；时间解析失败的条目丢弃。 */
export async function getAnnouncements(): Promise<Announcement[]> {
  const raw = await getSetting<unknown>("dashboard_announcements", []);
  if (!Array.isArray(raw)) return [];

  const items: Announcement[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const it = entry as Partial<AnnouncementInput>;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const ms = typeof it.date === "string" ? parseCnWallClock(it.date) : null;
    if (!title || ms === null) continue;
    const content = typeof it.content === "string" ? it.content.trim() : "";
    items.push({
      title,
      ...(content ? { content } : {}),
      type: normalizeAnnouncementType(it.type),
      date: ms,
      dateLabel: formatCnWallClock(ms),
    });
  }

  return items.sort((a, b) => b.date - a.date).slice(0, ANNOUNCEMENT_LIMIT);
}

/** 读取常见问答：按配置顺序原样返回，最多 FAQ_LIMIT 条。 */
export async function getFaq(): Promise<FaqItem[]> {
  const raw = await getSetting<unknown>("dashboard_faq", []);
  if (!Array.isArray(raw)) return [];

  const items: FaqItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const it = entry as Partial<FaqItem>;
    const question = typeof it.question === "string" ? it.question.trim() : "";
    const answer = typeof it.answer === "string" ? it.answer.trim() : "";
    if (!question || !answer) continue;
    const link = typeof it.link === "string" && /^https?:\/\//.test(it.link.trim())
      ? it.link.trim()
      : undefined;
    items.push({ question, answer, ...(link ? { link } : {}) });
    if (items.length >= FAQ_LIMIT) break;
  }

  return items;
}

export async function getUptimeConfig() {
  const [enabled, apiUrl] = await Promise.all([
    getSetting("uptime_enabled", false),
    getSetting("uptime_api_url", ""),
  ]);
  return { enabled, apiUrl: apiUrl.trim() };
}

export type UptimeStatus = "up" | "down" | "maint" | "pending";

export interface UptimeMonitor {
  name: string;
  status: UptimeStatus;
  /** 24 小时可用率，如 `99.98%` */
  uptime: string;
  url?: string;
}

export interface UptimeResult {
  /** 后台是否配置了 Uptime 接口 */
  configured: boolean;
  /** 本次抓取是否成功 */
  ok: boolean;
  monitors: UptimeMonitor[];
  error?: string;
}

/** Uptime Kuma 状态页接口的超时上限，避免看板被慢上游拖住。 */
const UPTIME_TIMEOUT_MS = 5000;

/**
 * 抓取 Uptime Kuma 状态页接口（`/api/status2/<slug>`）。
 * 只认 `monitorList` 里的 name/msg/color/uptime24/link，其余字段忽略。
 */
export async function getUptimeStatus(): Promise<UptimeResult> {
  const { enabled, apiUrl } = await getUptimeConfig();
  if (!enabled || !apiUrl) return { configured: false, ok: false, monitors: [] };
  if (!/^https?:\/\//.test(apiUrl)) {
    return { configured: true, ok: false, monitors: [], error: "Uptime 地址需以 http(s) 开头" };
  }

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(UPTIME_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      return { configured: true, ok: false, monitors: [], error: `Uptime 接口返回 ${res.status}` };
    }

    const data = (await res.json()) as { status?: unknown; monitorList?: unknown };
    const list = Array.isArray(data.monitorList) ? data.monitorList : [];
    const monitors = list
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .map((m) => {
        const uptime = Number(m.uptime24);
        return {
          name: typeof m.name === "string" ? m.name : "未命名监控",
          status: toUptimeStatus(m.msg, m.color),
          uptime: Number.isFinite(uptime) ? `${uptime.toFixed(2)}%` : "—",
          url: typeof m.link === "string" && /^https?:\/\//.test(m.link) ? m.link : undefined,
        } satisfies UptimeMonitor;
      })
      .slice(0, 20);

    return { configured: true, ok: data.status === "ok", monitors };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      monitors: [],
      error: err instanceof Error ? `Uptime 抓取失败：${err.message}` : "Uptime 抓取失败",
    };
  }
}

/** Uptime Kuma 的 `msg` 是首选依据，缺失时退回按状态点颜色判断。 */
function toUptimeStatus(msg: unknown, color: unknown): UptimeStatus {
  switch (String(msg ?? "").toLowerCase()) {
    case "up":
      return "up";
    case "down":
      return "down";
    case "pending":
      return "pending";
    case "maintain":
    case "maintenance":
      return "maint";
  }

  switch (String(color ?? "").toLowerCase()) {
    case "#74e313":
      return "up";
    case "#de0e0e":
      return "down";
    case "#e8c45c":
      return "maint";
    default:
      return "pending";
  }
}
