/**
 * 中国时区（Asia/Shanghai, UTC+8）时间工具。
 * 服务器部署在 Vercel（默认 UTC），直接用 new Date() 取本地零点会把「今天」算成
 * UTC 零点（北京 08:00），导致看板/统计的日界错位。统一以北京时间为准。
 */

export const CHINA_TIME_ZONE = "Asia/Shanghai";
/** 北京 = UTC+8 */
export const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把真实 Date 的字段“平移”成北京墙钟时间（字段按北京读取）。 */
export function cnDate(d: Date): Date {
  return new Date(d.getTime() + CN_OFFSET_MS);
}

/** 北京时区「今天」0 点的真实时间戳（用于 DB 边界比较）。 */
export function cnStartOfToday(): Date {
  const bj = cnDate(new Date());
  bj.setUTCHours(0, 0, 0, 0);
  return new Date(bj.getTime() - CN_OFFSET_MS);
}

/** 北京时区「本月 1 日」0 点的真实时间戳。 */
export function cnStartOfMonth(): Date {
  const bj = cnDate(new Date());
  bj.setUTCDate(1);
  bj.setUTCHours(0, 0, 0, 0);
  return new Date(bj.getTime() - CN_OFFSET_MS);
}

/** 北京时区「N 天前」0 点的真实时间戳。 */
export function cnDaysAgoStart(days: number): Date {
  const bj = cnDate(new Date());
  bj.setUTCDate(bj.getUTCDate() - days);
  bj.setUTCHours(0, 0, 0, 0);
  return new Date(bj.getTime() - CN_OFFSET_MS);
}

/** 北京时区「含今天在内的 N 个日历日」起始时刻：N=1 即今天 0 点，N=7 即 6 天前 0 点。
 * 用于「今日 / 近 N 日」这类含当天的统计窗口，避免多算一个整天。
 */
export function cnLastNDaysStart(days: number): Date {
  return cnDaysAgoStart(Math.max(0, days - 1));
}

/** 按北京时间给出的问候语（看板头部用），与访客所在时区无关。 */
export function cnGreeting(d: Date = new Date()): string {
  const hour = cnDate(d).getUTCHours();
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 13) return "中午好";
  if (hour >= 13 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

/**
 * 窗口起点到此刻已流逝的分钟数（下限 1，避免除零）。
 * 看板算平均 RPM/TPM 用：窗口尚未走完，按整窗长度摊会把速率算小。
 */
export function elapsedMinutesSince(since: Date): number {
  return Math.max(1, (Date.now() - since.getTime()) / 60_000);
}

/** 将时间戳格式化为中国时区日期时间（服务端/客户端均按北京时间显示）。 */
export function formatCnDateTime(
  ms: number | Date | string,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...opts,
  }).format(new Date(ms));
}

/** 将时间戳格式化为中国时区日期。 */
export function formatCnDate(ms: number | Date | string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * 北京墙钟「YYYY-MM-DD HH:mm」显示。手动拼字段而不是走 Intl，
 * 因为 zh-CN 会输出 `2026/07/27`，且个别 ICU 版本零点会给出「24」时。
 */
export function formatCnWallClock(ms: number | Date, withTime = true): string {
  const d = cnDate(new Date(ms));
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return withTime ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date;
}

/**
 * 解析北京墙钟字符串为真实毫秒，接受 `YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、`YYYY-MM-DDTHH:mm`。
 * 公告等由管理员手填的时间按北京时间口径解释，与浏览器所在时区无关。非法输入返回 null。
 */
export function parseCnWallClock(value: string): number | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0));
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d) ||
    check.getUTCHours() !== Number(h ?? 0) ||
    check.getUTCMinutes() !== Number(mi ?? 0)
  ) {
    return null;
  }
  return wall - CN_OFFSET_MS;
}

/** 中文相对时间（「刚刚」「3 天前」「1 个月前」）；未来时间退回绝对时间显示。 */
export function formatCnRelativeTime(ms: number | Date, nowMs = Date.now()): string {
  const t = new Date(ms).getTime();
  const diff = nowMs - t;
  if (diff < 0) return formatCnWallClock(t);

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;

  return `${Math.floor(months / 12)} 年前`;
}
