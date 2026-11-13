import { SAGA_CHAPTERS } from "./data";
import type { SagaReplayState, SagaRun } from "./types";

/**
 * 军令（任务）：全部由重放状态现算，不单独存档。
 *
 * 主线看营寨进度，支线看招降、连胜、换装、存款与乡野走访——前七项都来自
 * 服务端重放结果，只有「走访乡野」是纯前端见闻，刷新后重新走一遍即可，
 * 不会影响任何结算。
 */

export type SagaQuestScope = "main" | "side";

export interface SagaQuest {
  id: string;
  scope: SagaQuestScope;
  title: string;
  desc: string;
  progress: number;
  target: number;
  done: boolean;
}

export interface SagaQuestContext {
  chapter: number;
  town: string;
  cleared: number;
  total: number;
  bossCleared: boolean;
  battlesWon: number;
  encounters: number;
  recruited: number;
  bankedGold: number;
  equipped: number;
  partySize: number;
  maxLevel: number;
  visitedPois: number;
  totalPois: number;
}

export function sagaQuestContext(
  run: SagaRun,
  state: SagaReplayState,
  extra: { visitedPois?: number; totalPois?: number } = {},
): SagaQuestContext {
  const chapterIndex = Math.max(
    0,
    Math.min(SAGA_CHAPTERS.length - 1, Math.trunc(run.startSave.chapter) || 0),
  );
  const total = run.nodes.length;
  const bossIndex = run.nodes.findIndex((node) => node.kind === "boss");
  const cleared = state.clearedNodes.length;
  const save = state.save;
  const party = save.party;
  return {
    chapter: chapterIndex,
    town: SAGA_CHAPTERS[chapterIndex].town,
    cleared,
    total,
    bossCleared: bossIndex >= 0 ? state.clearedNodes.includes(bossIndex) : false,
    battlesWon: state.battlesWon,
    encounters: state.encounters,
    recruited: state.recruited.length,
    bankedGold: state.bankedGold,
    equipped: party.filter((member) => member.weapon && member.armor).length,
    partySize: party.length,
    maxLevel: party.reduce((best, member) => Math.max(best, member.level), 0),
    visitedPois: extra.visitedPois ?? 0,
    totalPois: extra.totalPois ?? 3,
  };
}

export function sagaQuestsFor(ctx: SagaQuestContext): SagaQuest[] {
  const rows: Omit<SagaQuest, "done">[] = [
    {
      id: "clear-camps",
      scope: "main",
      title: "拔除外营",
      desc: `攻破${SAGA_CHAPTERS[ctx.chapter].stages[0] ?? "此地"}一带的营寨，为主帅本阵开路。`,
      progress: Math.min(ctx.cleared, ctx.total),
      target: ctx.total,
    },
    {
      id: "take-boss",
      scope: "main",
      title: "直取中军",
      desc: "外营尽破后，攻入主帅本阵，平定这一处地方。",
      progress: ctx.bossCleared ? 1 : 0,
      target: 1,
    },
    {
      id: "recruit",
      scope: "side",
      title: "招降敌将",
      desc: "在阵前招降一名敌将，让他成为麾下一员。",
      progress: Math.min(ctx.recruited, 1),
      target: 1,
    },
    {
      id: "wins",
      scope: "side",
      title: "以战养战",
      desc: "在这一趟行军里打赢三场，用缴获补足军资。",
      progress: Math.min(ctx.battlesWon, 3),
      target: 3,
    },
    {
      id: "gear",
      scope: "side",
      title: "披坚执锐",
      desc: "给上阵的每位武将都配齐兵器与甲胄，立绘也会跟着换装。",
      progress: Math.min(ctx.equipped, Math.max(1, ctx.partySize)),
      target: Math.max(1, ctx.partySize),
    },
    {
      id: "poi",
      scope: "side",
      title: "乡野问俗",
      desc: "去村庄、祠堂与渡口各走一趟，听听本地人怎么说。",
      progress: Math.min(ctx.visitedPois, ctx.totalPois),
      target: Math.max(1, ctx.totalPois),
    },
    {
      id: "bank",
      scope: "side",
      title: "存金生息",
      desc: "在钱庄存下 100 金，收兵时按汇率折成 tcr。",
      progress: Math.min(ctx.bankedGold, 100),
      target: 100,
    },
    {
      id: "level",
      scope: "side",
      title: "百战之师",
      desc: "把一名上阵武将练到 10 级。",
      progress: Math.min(ctx.maxLevel, 10),
      target: 10,
    },
  ];
  return rows.map((row) => ({ ...row, done: row.progress >= row.target }));
}

/** 军情面板里优先展示的一条：主线未完成取主线，否则取第一条未完成的支线。 */
export function sagaNextQuest(quests: SagaQuest[]): SagaQuest | null {
  return (
    quests.find((quest) => quest.scope === "main" && !quest.done) ??
    quests.find((quest) => !quest.done) ??
    null
  );
}
