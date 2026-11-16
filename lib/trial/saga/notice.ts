/**
 * 游戏内版本公告与维护安排。
 *
 * 全部是纯数据 + 纯函数：公告按版本倒序排，维护窗口用带时区的 ISO 时间。
 * 界面只读这里，不在别处再写一份，免得公告与实际改动对不上。
 */

export type SagaNoticeKind = "update" | "maintain" | "event";

export interface SagaNoticeEntry {
  /** 稳定 id，用于「已读」记录；换版本时新增一条，不要改旧 id。 */
  id: string;
  version: string;
  /** 发布日期（北京时间，YYYY-MM-DD）。 */
  date: string;
  kind: SagaNoticeKind;
  title: string;
  /** 一条一句，界面上逐条列。 */
  lines: string[];
}

export interface SagaMaintenanceWindow {
  /** 开始（含），ISO 带 +08:00 偏移。 */
  start: string;
  /** 结束（含），ISO 带 +08:00 偏移。 */
  end: string;
  note: string;
}

/** 游戏内公告版本号（与站点版本对齐）。 */
export const SAGA_NOTICE_VERSION = "0.82.0";

/** 最新公告：按版本从新到旧。 */
export const SAGA_NOTICES: SagaNoticeEntry[] = [
  {
    id: "notice-0.82.0",
    version: "0.82.0",
    date: "2026-11-16",
    kind: "update",
    title: "兵种相克与名将连携",
    lines: [
      "新增兵种：武将按底子带骑兵 / 枪兵 / 弓兵，骑克弓、弓克枪、枪克骑，克制时伤害 +15%、受制 -15%。",
      "新增 8 组名将连携：同侧凑齐对应名将即整队加成（桃园结义、五虎上将、曹魏肱骨、江东双璧等）。",
      "战斗头顶标签与图鉴都标出当前兵种；开战时战报会写明这一场生效了哪些连携。",
    ],
  },
  {
    id: "notice-0.81.0",
    version: "0.81.0",
    date: "2026-11-16",
    kind: "update",
    title: "公告与维护进游戏",
    lines: [
      "游戏内新增「公告」入口：本次更新、历史版本与维护安排都在这里看，不用再去翻更新日志。",
      "有未读公告时入口带红点，点开即记已读（只存在本机，不影响存档）。",
      "维护窗口会标明进行中 / 已结束 / 计划中，维护期间旧对局与本地战报照常保存。",
    ],
  },
  {
    id: "notice-0.80.2",
    version: "0.80.2",
    date: "2026-11-16",
    kind: "update",
    title: "图鉴口径与血条对齐",
    lines: [
      "图鉴、编队、队伍、出战面板与战场统一按等级成长 + 铁匠铺强化 + 当前规则档计算属性与兵力。",
      "图鉴里麾下武将直接显示实际四维、兵力与兵器/甲胄加成；只见过未招到的仍标「基础」。",
      "战斗头顶血条：我方左对齐、敌军右对齐，名字兵力签随之左右贴边。",
    ],
  },
  {
    id: "notice-0.80.1",
    version: "0.80.1",
    date: "2026-11-16",
    kind: "update",
    title: "破本阵不再强行推区",
    lines: [
      "破本区本阵只算本区平定：发该区解锁武将、关卡开闸，但不会把人推去下一区。",
      "头顶区域名与天色跟着脚下走；继续往前自己过关卡或坐渡口，想回头也行。",
      "区域号改为收兵时按战果推进，下一次行军仍从最后一个已平定区的下一区开始。",
    ],
  },
  {
    id: "notice-0.80.0",
    version: "0.80.0",
    date: "2026-11-16",
    kind: "update",
    title: "八区合成一张连续大地图",
    lines: [
      "八章地图横向拼成一张 608×48 的大图，州治、营寨、关卡、渡口都在同一张图上。",
      "关卡是必经之路：破本区本阵后双向开闸；渡口是捷径，花 120 金船票直达对岸，也能坐回上一区。",
      "一趟行军从当前区一路排到最后一章；已平定的旧区可以走回去。",
    ],
  },
  {
    id: "notice-0.79.0",
    version: "0.79.0",
    date: "2026-11-16",
    kind: "update",
    title: "八章剧情分支",
    lines: [
      "每章初战之后岔出一对营地，两条路只能走一条；打通一条，另一条当场闭营。",
      "守正路线多给金币，奇袭路线多给经验，八章共 16 处岔路。",
    ],
  },
  {
    id: "notice-0.78.0",
    version: "0.78.0",
    date: "2026-11-16",
    kind: "update",
    title: "属性与兵力换口径",
    lines: [
      "四维封顶 255，每级成长翻三倍，双方兵力翻倍；基础属性一律不动。",
      "旧战报按旧规则重放，已打过的仗不翻盘。",
    ],
  },
];

/**
 * 维护安排：null 表示暂无计划。
 * 示例窗口保留在注释里，真要停机改这里即可（时间一律北京时间）。
 */
export const SAGA_MAINTENANCE: SagaMaintenanceWindow | null = null;

/** 维护窗口是否覆盖某一时刻。窗口为空、时间解析失败都按「不在维护」处理。 */
export function maintenanceActiveAt(
  now: Date,
  window: SagaMaintenanceWindow | null = SAGA_MAINTENANCE,
): boolean {
  if (!window) return false;
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  const at = now.getTime();
  return at >= start && at <= end;
}

/** 维护进度：未开始 / 进行中 / 已结束；没有窗口时返回 null。 */
export function maintenancePhaseAt(
  now: Date,
  window: SagaMaintenanceWindow | null = SAGA_MAINTENANCE,
): "upcoming" | "active" | "done" | null {
  if (!window) return null;
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const at = now.getTime();
  if (at < start) return "upcoming";
  if (at > end) return "done";
  return "active";
}

/** 最新一条公告的 id；界面拿它跟本机已读记录比对，决定要不要点红点。 */
export function latestNoticeId(): string | null {
  return SAGA_NOTICES[0]?.id ?? null;
}
