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
