import { CONSTELLATIONS } from "@/lib/collection/config";
import { getCollectionConfig } from "@/lib/collection/settings";
import { getCollectionSnapshot } from "@/lib/collection/store";
import { WORKSHOP_GYM_COUNT } from "@/lib/workshop/state";
import { getWorkshopConfig } from "@/lib/workshop/settings";
import { getWorkshopSnapshot } from "@/lib/workshop/store";
import {
  getActivityCouponView,
  LIVE_ACTIVITY_KINDS,
  type ActivityCouponView,
  type ActivityKind,
} from "./coupons";
import { getKongmingActivityConfig } from "@/lib/kongming/activity-settings";
import {
  activityCountdown,
  activityPhaseText,
  type ActivityCountdown,
  type ActivityPhase,
} from "./window";

/**
 * 活动中心的一次性聚合：把两款在线玩法的券、时间窗与存档进度读齐，
 * 页面只负责排版。读的都是只读快照，不改存档、不扣券。
 */

export interface HubProgress {
  label: string;
  value: number;
  /** 进度条上限；null 表示只显示数值（如武将图鉴名录）。 */
  max: number | null;
  hint?: string;
}

export interface HubActivity {
  kind: ActivityKind;
  label: string;
  href: string;
  couponName: string;
  tickets: number;
  unitCredits: number;
  status: ActivityPhase;
  statusText: string;
  countdown: ActivityCountdown | null;
  endMs: number | null;
  progress: HubProgress[];
  cta: string;
  alerts: string[];
}

export interface HubDaily {
  kind: ActivityKind;
  label: string;
  href: string;
  status: ActivityPhase;
  items: string[];
}

export interface ActivityHub {
  activities: HubActivity[];
  daily: HubDaily[];
}

const TOTAL_STARS = CONSTELLATIONS.reduce((sum, item) => sum + item.nodes.length, 0);

function base(activity: ActivityCouponView, now: number): HubActivity {
  const win = {
    status: activity.status as ActivityPhase,
    startMs: activity.startMs,
    endMs: activity.endMs,
  };

  return {
    kind: activity.kind,
    label: activity.label,
    href: activity.href,
    couponName: activity.couponName,
    tickets: activity.tickets,
    unitCredits: activity.unitCredits,
    status: win.status,
    statusText: activityPhaseText(win.status),
    countdown: activityCountdown(win, now),
    endMs: win.endMs,
    progress: [],
    cta: "进入玩法",
    alerts: [],
  };
}

/** 券在活动结束前还剩多少：临期时提醒玩家先把券用掉。 */
function couponAlert(card: HubActivity): string | null {
  if (card.tickets <= 0 || card.countdown === null) return null;
  if (card.countdown.tone === "normal") return null;
  return `${card.couponName}还剩 ${card.tickets} 张，活动结束后作废`;
}

export async function loadActivityHub(userId: string): Promise<ActivityHub> {
  const now = Date.now();
  const [workshopCoupon, collectionCoupon, kongmingCoupon, workshopConfig, collectionConfig, kongmingConfig] =
    await Promise.all([
      getActivityCouponView(userId, "workshop"),
      getActivityCouponView(userId, "collection"),
      getActivityCouponView(userId, "kongming"),
      getWorkshopConfig(),
      getCollectionConfig(),
      getKongmingActivityConfig(),
    ]);

  const workshopKey = workshopCoupon.activityKey;
  const collectionKey = collectionCoupon.activityKey;

  const [workshopSnap, collectionSnap] = await Promise.all([
    workshopKey ? getWorkshopSnapshot(userId, workshopKey) : Promise.resolve(null),
    collectionKey ? getCollectionSnapshot(userId, collectionKey) : Promise.resolve(null),
  ]);

  const cards: HubActivity[] = [];
  const daily: HubDaily[] = [];

  // 灵宠工坊：每日进图 / 道馆次数，外加道馆徽章。
  {
    const card = base(workshopCoupon, now);
    if (workshopCoupon.status === "active" && workshopSnap) {
      const state = workshopSnap.state;
      const enters = state.entersToday;
      const gyms = state.gymsToday ?? 0;
      card.progress = [
        { label: "今日进图", value: enters, max: workshopConfig.dailyExplores },
        { label: "今日道馆", value: gyms, max: workshopConfig.dailyGyms },
        { label: "道馆徽章", value: state.badges ?? 0, max: WORKSHOP_GYM_COUNT },
      ];
      card.cta = state.encounter
        ? "回到战斗"
        : state.run
          ? "继续探险"
          : state.starter
            ? "进图探险"
            : "三选一开局";
      if (state.encounter) card.alerts.push("有未结束的战斗，回去打完");
      else if (state.run) card.alerts.push("这趟探险还没收兵");
      if (state.party.length > 0 && state.party.every((pet) => pet.hp <= 0)) {
        card.alerts.push("灵宠全部倒地，进场后先去营地休息");
      }
      const alert = couponAlert(card);
      if (alert) card.alerts.push(alert);
      daily.push({
        kind: "workshop",
        label: "灵宠工坊",
        href: "/workshop",
        status: card.status,
        items: [
          `进图 ${enters}/${workshopConfig.dailyExplores}`,
          `道馆 ${gyms}/${workshopConfig.dailyGyms}`,
        ],
      });
    } else {
      daily.push({
        kind: "workshop",
        label: "灵宠工坊",
        href: "/workshop",
        status: card.status,
        items: [card.statusText],
      });
    }
    cards.push(card);
  }

  // 星图共鸣：每日观星次数与点亮星位。
  {
    const card = base(collectionCoupon, now);
    if (collectionCoupon.status === "active" && collectionSnap) {
      const state = collectionSnap.state;
      card.progress = [
        { label: "今日观星", value: state.observesToday, max: collectionConfig.dailyObserves },
        { label: "点亮星位", value: state.nodes.length, max: TOTAL_STARS },
      ];
      card.cta = "观星点星";
      const alert = couponAlert(card);
      if (alert) card.alerts.push(alert);
      daily.push({
        kind: "collection",
        label: "星图共鸣",
        href: "/collection",
        status: card.status,
        items: [
          `观星 ${state.observesToday}/${collectionConfig.dailyObserves}`,
          `星辉 ${state.shards}`,
        ],
      });
    } else {
      daily.push({
        kind: "collection",
        label: "星图共鸣",
        href: "/collection",
        status: card.status,
        items: [card.statusText],
      });
    }
    cards.push(card);
  }

  // 诸葛孔明传：没有服务端存档进度，只展示券与可换军资。
  {
    const card = base(kongmingCoupon, now);
    card.cta = "进入游戏";
    if (kongmingCoupon.status === "active") {
      const gold = kongmingCoupon.tickets * kongmingConfig.goldPerCoupon;
      card.progress = [
        { label: "当前券", value: kongmingCoupon.tickets, max: null },
        { label: "可换军资", value: gold, max: null, hint: "金" },
      ];
      const alert = couponAlert(card);
      if (alert) card.alerts.push(alert);
      daily.push({
        kind: "kongming",
        label: "诸葛孔明传",
        href: "/kongming",
        status: card.status,
        items: [`${kongmingCoupon.tickets} 张券`, `可换 ${gold} 金`],
      });
    } else {
      daily.push({
        kind: "kongming",
        label: "诸葛孔明传",
        href: "/kongming",
        status: card.status,
        items: [card.statusText],
      });
    }
    cards.push(card);
  }

  // 顺序固定为在线玩法声明顺序，方便页面按 kind 取资料。
  cards.sort((a, b) => LIVE_ACTIVITY_KINDS.indexOf(a.kind) - LIVE_ACTIVITY_KINDS.indexOf(b.kind));
  daily.sort((a, b) => LIVE_ACTIVITY_KINDS.indexOf(a.kind) - LIVE_ACTIVITY_KINDS.indexOf(b.kind));

  return { activities: cards, daily };
}
