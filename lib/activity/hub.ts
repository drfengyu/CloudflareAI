import { CONSTELLATIONS } from "@/lib/collection/config";
import { getCollectionConfig } from "@/lib/collection/settings";
import { getCollectionSnapshot } from "@/lib/collection/store";
import { SAGA_CHAPTERS, SAGA_GENERALS } from "@/lib/trial/saga/data";
import { findActiveTrialRun, loadTrialSave } from "@/lib/trial/store";
import { WORKSHOP_GYM_COUNT } from "@/lib/workshop/state";
import { getWorkshopConfig } from "@/lib/workshop/settings";
import { getWorkshopSnapshot } from "@/lib/workshop/store";
import {
  getActivityCouponView,
  LIVE_ACTIVITY_KINDS,
  type ActivityCouponView,
  type ActivityKind,
} from "./coupons";
import {
  activityCountdown,
  activityPhaseText,
  type ActivityCountdown,
  type ActivityPhase,
} from "./window";

/**
 * 活动中心的一次性聚合：把三款在线玩法的券、时间窗与存档进度读齐，
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
  const [trialCoupon, workshopCoupon, collectionCoupon, workshopConfig, collectionConfig] =
    await Promise.all([
      getActivityCouponView(userId, "trial"),
      getActivityCouponView(userId, "workshop"),
      getActivityCouponView(userId, "collection"),
      getWorkshopConfig(),
      getCollectionConfig(),
    ]);

  const trialKey = trialCoupon.activityKey;
  const workshopKey = workshopCoupon.activityKey;
  const collectionKey = collectionCoupon.activityKey;

  const [trialSave, activeRun, workshopSnap, collectionSnap] = await Promise.all([
    trialKey ? loadTrialSave(userId, trialKey) : Promise.resolve(null),
    trialKey && trialCoupon.status === "active"
      ? findActiveTrialRun(userId, trialKey)
      : Promise.resolve(null),
    workshopKey ? getWorkshopSnapshot(userId, workshopKey) : Promise.resolve(null),
    collectionKey ? getCollectionSnapshot(userId, collectionKey) : Promise.resolve(null),
  ]);

  const cards: HubActivity[] = [];
  const daily: HubDaily[] = [];

  // 三国讨逆传：没有每日次数，进度看平定地方与图鉴。
  {
    const card = base(trialCoupon, now);
    if (trialCoupon.status === "active") {
      const save = trialSave?.save;
      const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, save?.chapter ?? 0)];
      const dex = new Set([...(save?.met ?? []), ...(save?.recruited ?? [])]).size;
      const cleared = save?.stats.wins ?? 0;
      card.progress = [
        { label: "平定地方", value: cleared, max: SAGA_CHAPTERS.length },
        {
          label: "武将图鉴",
          value: dex,
          max: null,
          hint: dex > 0 ? `共 ${SAGA_GENERALS.length} 人` : "尚未出城",
        },
      ];
      card.cta = activeRun ? "继续行军" : "出城出发";
      if (activeRun) card.alerts.push("有未收兵的行军，回去接着走");
      const alert = couponAlert(card);
      if (alert) card.alerts.push(alert);
      daily.push({
        kind: "trial",
        label: "三国讨逆传",
        href: "/trial",
        status: card.status,
        items: [`不限次数`, `${chapter.town} · ${chapter.name}`],
      });
    } else {
      daily.push({
        kind: "trial",
        label: "三国讨逆传",
        href: "/trial",
        status: card.status,
        items: [card.statusText],
      });
    }
    cards.push(card);
  }

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

  // 顺序固定为在线玩法声明顺序，方便页面按 kind 取资料。
  cards.sort((a, b) => LIVE_ACTIVITY_KINDS.indexOf(a.kind) - LIVE_ACTIVITY_KINDS.indexOf(b.kind));
  daily.sort((a, b) => LIVE_ACTIVITY_KINDS.indexOf(a.kind) - LIVE_ACTIVITY_KINDS.indexOf(b.kind));

  return { activities: cards, daily };
}
