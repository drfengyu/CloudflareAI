/**
 * 限时活动的时间窗口径：状态、剩余时间与进度条比例。
 *
 * 各玩法的窗口函数已经算出 `{ status, startMs, endMs }`，这里只做展示层换算，
 * 不读配置、不碰数据库，客户端倒计时与服务端首屏共用同一套文案。
 */

export type ActivityPhase = "disabled" | "pending" | "active" | "ended";

export interface ActivityWindow {
  status: ActivityPhase;
  startMs: number | null;
  endMs: number | null;
}

export type CountdownTone = "normal" | "soon" | "urgent";

export interface ActivityCountdown {
  text: string;
  tone: CountdownTone;
  msLeft: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 48 小时内提醒一次「快结束了」，6 小时内按紧急色处理。 */
export const COUNTDOWN_SOON_MS = 2 * DAY;
export const COUNTDOWN_URGENT_MS = 6 * HOUR;

/** 「剩 3 天 4 小时」「剩 5 小时 20 分」「剩 12 分钟」；已到期返回「已结束」。 */
export function formatRemaining(msLeft: number): string {
  const ms = Math.max(0, Math.trunc(msLeft));
  if (ms <= 0) return "已结束";
  if (ms < MINUTE) return "不足 1 分钟";
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
  }
  return `${Math.floor(ms / MINUTE)} 分钟`;
}

export function countdownTone(msLeft: number): CountdownTone {
  if (msLeft <= COUNTDOWN_URGENT_MS) return "urgent";
  if (msLeft <= COUNTDOWN_SOON_MS) return "soon";
  return "normal";
}

/** 只在进行中且配置了结束时间时返回倒计时；未开始 / 已结束 / 未开启都返回 null。 */
export function activityCountdown(
  win: ActivityWindow,
  now = Date.now(),
): ActivityCountdown | null {
  if (win.status !== "active" || win.endMs === null) return null;
  const msLeft = Math.max(0, win.endMs - now);
  return { text: formatRemaining(msLeft), tone: countdownTone(msLeft), msLeft };
}

/** 活动窗口走过的比例 0~1；未开始为 0，已结束为 1，时间窗非法按 0。 */
export function activityElapsedRatio(win: ActivityWindow, now = Date.now()): number {
  if (win.status === "ended") return 1;
  if (
    win.status !== "active" ||
    win.startMs === null ||
    win.endMs === null ||
    win.endMs <= win.startMs
  ) {
    return 0;
  }
  const ratio = (now - win.startMs) / (win.endMs - win.startMs);
  return Math.min(1, Math.max(0, ratio));
}

const PHASE_TEXT: Record<ActivityPhase, string> = {
  active: "进行中",
  pending: "未开始",
  disabled: "未开启",
  ended: "已结束",
};

export function activityPhaseText(phase: ActivityPhase): string {
  return PHASE_TEXT[phase];
}
