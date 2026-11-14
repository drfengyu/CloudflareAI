import {
  SAGA_CHAPTERS,
  SAGA_FORMATION_BY_ID,
  SAGA_FORMATIONS,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_TRAIT_BY_ID,
  tacticsFor,
  traitStats,
} from "./data";
import { startBattle, resolveBattleRound, startEncounterBattle } from "./battle";
import { SAGA_MAX_ENCOUNTERS } from "./encounter";
import {
  DEFAULT_SAGA_BANK,
  sanitizeSagaBank,
  SAGA_COUPON_ITEM_ID,
  SAGA_MAX_COUPON_TICKETS,
  type SagaBankPolicy,
} from "./bank";
import { SAGA_INN_ITEM_ID, SAGA_INN_PRICE_TICKETS } from "./inn";
import { SAGA_TRAINING_ITEM_ID, trainGeneral } from "./training";
import { SAGA_FORGE_ITEM_ID, SAGA_FORGE_MAX_LEVEL, upgradeGear } from "./forge";
import {
  applyChapterUnlock,
  cloneSave,
  equipGeneral,
  generalStats,
  grantItem,
  normalizeTrialSave,
  setActiveParty,
  setFormation,
} from "./state";
import {
  SAGA_MAX_COMMANDS,
  SAGA_MAX_LEVEL,
  SAGA_MAX_ROUNDS_PER_BLOCK,
  SAGA_MAX_TOTAL_ROUNDS,
  SAGA_PARTY_SIZE,
  SAGA_RULESET,
  SAGA_RUN_VERSION,
  type FormationId,
  type SagaCommand,
  type SagaEnemy,
  type SagaNode,
  type SagaNodeKind,
  type SagaPurchase,
  type SagaReplayResult,
  type SagaReplayState,
  type SagaRoundCommand,
  type SagaRun,
  type SagaRunResult,
  type SagaTraitId,
  type TrialSave,
} from "./types";

/**
 * 讨逆传的一次行军：出城时按存档与当前地点生成节点，收兵时按指令确定性重放。
 *
 * 这个文件必须保持纯函数（不读库、不用 Node 专有 API），
 * 浏览器端要用同一份实现做即时预览，服务端收兵时再重放一次。
 */

/** 一次行军最多买多少份军需；防止行军 JSON 被无限撑大。 */
export const SAGA_MAX_PURCHASES = 100;

/** 指令里允许出现的营地下标上限（与 `TRIAL_MAX_FLOORS` 对齐，这里不引配置以免破坏纯函数复用）。 */
const SAGA_MAX_NODE_INDEX = 6;

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(value)));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIELD_NAMES = ["前锋营", "巡哨队", "运粮队", "斥候营", "别动队", "渡口守军"];
const FIELD_BLURBS = [
  "敌军前哨拦路，正好拿他试刀。",
  "斥候来报：此处有敌将巡守。",
  "狭路相逢，唯有速战。",
  "敌军队形未整，可趁机突袭。",
];
const ELITE_NAMES = ["精锐营", "先锋大营", "虎卫营", "铁甲营"];
const ELITE_BLURBS = ["精锐尽出，此战不易。", "敌将亲率亲兵压阵，需小心应对。"];

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function makeEnemy(
  defId: string,
  chapterIndex: number,
  nodeIndex: number,
  kind: SagaNodeKind,
  boss: boolean,
): SagaEnemy {
  const def = SAGA_GENERAL_BY_ID.get(defId);
  const fallback = SAGA_GENERAL_BY_ID.get("huangjin_lishi")!;
  const raw = def ?? fallback;
  const level = 1 + chapterIndex * 4 + nodeIndex + (kind === "elite" ? 1 : 0) + (kind === "boss" ? 3 : 0);
  const scale = kind === "boss" ? 1.25 : kind === "elite" ? 1.1 : 1;
  const troops = Math.max(
    60,
    Math.round((raw.baseTroops + level * raw.growth) * (1 + chapterIndex * 0.06) * scale),
  );
  const bonus = traitStats(raw);
  return {
    id: raw.id,
    name: raw.name,
    title: raw.title,
    level,
    troops,
    maxTroops: troops,
    force: raw.force + bonus.force + Math.floor(level * 1.4),
    intellect: raw.intellect + bonus.intellect + Math.floor(level * 1.1),
    defense: raw.defense + bonus.defense + Math.floor(level * 1.2),
    speed: raw.speed + bonus.speed + Math.floor(level * 0.7),
    tactics: tacticsFor(raw, level),
    traits: raw.traits ?? [],
    color: raw.color,
    accent: raw.accent,
    recruitable: Boolean(raw.recruitable) && !boss,
    recruitHard: Boolean(raw.recruitHard),
    boss,
  };
}

function enemyIds(
  chapterIndex: number,
  kind: SagaNodeKind,
  nodeIndex: number,
  rng: () => number,
): string[] {
  const chapter = SAGA_CHAPTERS[clampInt(chapterIndex, 0, SAGA_CHAPTERS.length - 1)];
  const unique = (list: readonly string[], count: number): string[] => {
    const pool = [...new Set(list)];
    const picked: string[] = [];
    while (picked.length < count && pool.length > 0) {
      const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
  };
  if (kind === "boss") {
    return [chapter.boss, ...unique(chapter.guards, 2)];
  }
  if (kind === "elite") {
    const count = chapterIndex >= 2 ? 3 : 2;
    return unique([...chapter.elite, ...chapter.field, ...chapter.guards], count);
  }
  const count = chapterIndex >= 2 ? 3 : 2;
  void nodeIndex;
  return unique([...chapter.field, ...chapter.elite], count);
}

export function generateSagaRun(options: {
  activityKey: string;
  save: TrialSave;
  nodeCount: number;
  seed?: number;
  bank?: SagaBankPolicy;
}): SagaRun {
  const save = normalizeTrialSave(options.save);
  const seed =
    typeof options.seed === "number" && Number.isFinite(options.seed)
      ? options.seed >>> 0
      : Math.floor(Math.random() * 0xffffffff) >>> 0;
  const rng = mulberry32(seed);
  const chapter = SAGA_CHAPTERS[clampInt(save.chapter, 0, SAGA_CHAPTERS.length - 1)];
  const nodeCount = clampInt(options.nodeCount, 2, 7);
  const nodes: SagaNode[] = [];
  for (let index = 0; index < nodeCount; index++) {
    const kind: SagaNodeKind =
      index === nodeCount - 1 ? "boss" : index === nodeCount - 2 && nodeCount >= 3 ? "elite" : "battle";
    const ids = enemyIds(chapter.index, kind, index, rng);
    const enemies = ids.map((id, order) =>
      makeEnemy(id, chapter.index, index, kind === "boss" && order > 0 ? "elite" : kind, kind === "boss" && order === 0),
    );
    const bossName = enemies[0]?.name ?? "敌军主将";
    const rewardGold =
      18 + chapter.index * 22 + index * 8 + (kind === "elite" ? 25 : 0) + (kind === "boss" ? 60 : 0);
    const rewardExp =
      16 + chapter.index * 10 + index * 6 + (kind === "elite" ? 18 : 0) + (kind === "boss" ? 40 : 0);
    const stage =
      chapter.stages[index] ?? pick(rng, kind === "elite" ? ELITE_NAMES : FIELD_NAMES);
    const name =
      kind === "boss"
        ? `${stage}·${bossName}本阵`
        : kind === "elite"
          ? `${stage}·精锐`
          : stage;
    const storyLine =
      chapter.story[Math.min(chapter.story.length - 1, Math.floor((index * chapter.story.length) / nodeCount))] ?? "";
    const blurb =
      kind === "boss"
        ? `${storyLine} 此战直取${bossName}本阵。`
        : `${storyLine} ${kind === "elite" ? pick(rng, ELITE_BLURBS) : pick(rng, FIELD_BLURBS)}`;
    nodes.push({
      kind,
      name,
      blurb: blurb.slice(0, 120),
      chapter: chapter.index,
      enemies,
      rewardGold,
      rewardExp,
      enemyFormation: pick(rng, SAGA_FORMATIONS).id,
    });
  }
  return {
    version: SAGA_RUN_VERSION,
    kind: "saga",
    activityKey: options.activityKey,
    seed,
    nodes,
    startSave: cloneSave(save),
    purchases: [],
    shopSeq: 0,
    bank: sanitizeSagaBank(options.bank ?? DEFAULT_SAGA_BANK),
    rules: SAGA_RULESET,
  };
}

function parseEnemy(raw: unknown): SagaEnemy | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Partial<SagaEnemy>;
  const id = String(it.id ?? "");
  if (!SAGA_GENERAL_BY_ID.get(id)) return null;
  const num = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const maxTroops = num(it.maxTroops, 1, 999_999, 100);
  const troops = num(it.troops, 0, maxTroops, maxTroops);
  const tactics = Array.isArray(it.tactics)
    ? it.tactics.filter((t): t is SagaEnemy["tactics"][number] =>
        ["huoji", "huifu", "hunluan", "guwu"].includes(String(t)),
      )
    : [];
  const traits = Array.isArray(it.traits)
    ? it.traits
        .filter((t): t is SagaTraitId => typeof t === "string" && SAGA_TRAIT_BY_ID.has(t as SagaTraitId))
        .slice(0, 4)
    : [];
  return {
    id,
    name: String(it.name ?? "").slice(0, 24) || id,
    title: String(it.title ?? "").slice(0, 24),
    level: num(it.level, 1, 99, 1),
    troops,
    maxTroops,
    force: num(it.force, 1, 999, 50),
    intellect: num(it.intellect, 1, 999, 50),
    defense: num(it.defense, 1, 999, 50),
    speed: num(it.speed, 1, 999, 50),
    tactics,
    traits,
    color: String(it.color ?? "#475569").slice(0, 32),
    accent: String(it.accent ?? "#e2e8f0").slice(0, 32),
    recruitable: it.recruitable === true,
    recruitHard: it.recruitHard === true,
    boss: it.boss === true,
  };
}

function parseNode(raw: unknown): SagaNode | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Partial<SagaNode>;
  const kind = it.kind;
  if (kind !== "battle" && kind !== "elite" && kind !== "boss") return null;
  if (!Array.isArray(it.enemies) || it.enemies.length === 0 || it.enemies.length > SAGA_PARTY_SIZE) return null;
  const enemies: SagaEnemy[] = [];
  for (const item of it.enemies) {
    const enemy = parseEnemy(item);
    if (!enemy) return null;
    enemies.push(enemy);
  }
  const formation: FormationId = SAGA_FORMATION_BY_ID.has(
    String(it.enemyFormation ?? "") as FormationId,
  )
    ? (it.enemyFormation as FormationId)
    : "yulin";
  const num = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    kind,
    name: String(it.name ?? "遭遇战").slice(0, 32),
    blurb: String(it.blurb ?? "").slice(0, 120),
    chapter: num(it.chapter, 0, SAGA_CHAPTERS.length - 1, 0),
    enemies,
    rewardGold: num(it.rewardGold, 0, 9999, 20),
    rewardExp: num(it.rewardExp, 0, 9999, 20),
    enemyFormation: formation,
  };
}

const PASSIVE_SUPPLIES = new Set(["troops", "attack", "speed", "tactic"]);

/** 旧版 tcr 换金币的购买记录用这个虚拟商品 ID，只用于读回历史数据。 */
const SAGA_BANK_GOLD_ITEM_ID = "bank_gold";

/** v0.51 时代的固定金币档（`gold_50` 等）；旧行军里的记录仍按当时买到的金币补发。 */
const LEGACY_GOLD_PACK_ID = /^gold_(\d{1,6})$/;

function isPassiveSupply(itemId: string): boolean {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  return Boolean(item && item.kind === "supply" && item.supply && PASSIVE_SUPPLIES.has(item.supply));
}

function parsePurchases(raw: unknown, bank: SagaBankPolicy): SagaPurchase[] {
  if (!Array.isArray(raw)) return [];
  const out: SagaPurchase[] = [];
  const ids = new Set<string>();
  const passives = new Set<string>();
  let boughtGold = 0;
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const it = item as Partial<SagaPurchase>;
    const id = String(it.id ?? "").slice(0, 64);
    const itemId = String(it.itemId ?? "");
    if (!id || ids.has(id)) continue;
    const at = clampInt(Number(it.at) || 0, 0, Date.now() + 86_400_000);
    const cmdIndex = clampInt(Number(it.cmdIndex) || 0, 0, SAGA_MAX_COMMANDS);
    const legacyGold = LEGACY_GOLD_PACK_ID.exec(itemId);
    if (itemId === SAGA_BANK_GOLD_ITEM_ID || legacyGold) {
      const rawGold = legacyGold ? Number(legacyGold[1]) : Number(it.gold) || 0;
      const gold = clampInt(rawGold, 0, bank.maxGoldPerRun);
      const valid =
        legacyGold !== null ? gold > 0 : gold > 0 && gold % bank.goldPerTcrBuy === 0;
      if (!valid) continue;
      if (boughtGold + gold > bank.maxGoldPerRun) continue;
      boughtGold += gold;
      ids.add(id);
      out.push({ id, itemId: SAGA_BANK_GOLD_ITEM_ID, tickets: 0, gold, at, cmdIndex });
      continue;
    }
    // 客栈住店是一张券一次的购买记录：允许同一趟重复住，重放时按记录补兵。
    if (itemId === SAGA_INN_ITEM_ID) {
      ids.add(id);
      out.push({ id, itemId, tickets: SAGA_INN_PRICE_TICKETS, at, cmdIndex });
      continue;
    }
    // 钱庄金币换券：记录扣掉多少金币、换到多少张券；券已在服务端入账，重放只扣金币。
    if (itemId === SAGA_COUPON_ITEM_ID) {
      const coupons = clampInt(Number(it.coupons) || 0, 0, SAGA_MAX_COUPON_TICKETS);
      const goldCost = clampInt(Number(it.goldCost) || 0, 0, 9_999_999);
      if (coupons <= 0 || goldCost <= 0) continue;
      ids.add(id);
      out.push({ id, itemId, tickets: 0, coupons, goldCost, at, cmdIndex });
      continue;
    }
    // 训练场：记录受训武将与目标等级，重放时按购买位置直接抬等级。
    if (itemId === SAGA_TRAINING_ITEM_ID) {
      const generalId = String(it.generalId ?? "").slice(0, 32);
      if (!SAGA_GENERAL_BY_ID.get(generalId)) continue;
      const targetLevel = clampInt(Number(it.targetLevel) || 0, 2, SAGA_MAX_LEVEL);
      if (targetLevel < 2) continue;
      ids.add(id);
      out.push({
        id,
        itemId,
        tickets: clampInt(Number(it.tickets) || 0, 0, 999),
        generalId,
        targetLevel,
        at,
        cmdIndex,
      });
      continue;
    }
    // 铁匠铺：记录被强化的装备与目标等级，重放时按购买位置直接抬强化等级。
    if (itemId === SAGA_FORGE_ITEM_ID) {
      const gearId = String(it.gearId ?? "").slice(0, 32);
      const gear = SAGA_ITEM_BY_ID.get(gearId);
      if (!gear || (gear.kind !== "weapon" && gear.kind !== "armor")) continue;
      const targetLevel = clampInt(Number(it.targetLevel) || 0, 0, SAGA_FORGE_MAX_LEVEL);
      if (targetLevel < 1) continue;
      ids.add(id);
      out.push({
        id,
        itemId,
        tickets: clampInt(Number(it.tickets) || 0, 0, 999),
        gearId,
        targetLevel,
        at,
        cmdIndex,
      });
      continue;
    }
    const def = SAGA_ITEM_BY_ID.get(itemId);
    if (!def || !def.priceTickets) continue;
    if (isPassiveSupply(itemId)) {
      if (passives.has(itemId)) continue;
      passives.add(itemId);
    }
    ids.add(id);
    // 券价以商品表为准，旧记录里写的张数不采信。
    out.push({ id, itemId, tickets: def.priceTickets, at, cmdIndex });
  }
  return out;
}

/** 数据库里的行军 JSON；版本不符或字段损坏都返回 null，让调用方按「没有行军」处理。 */
export function parseSagaRun(raw: string | null | undefined): SagaRun | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const it = data as Partial<SagaRun>;
  if (it.version !== SAGA_RUN_VERSION || it.kind !== "saga") return null;
  const activityKey = typeof it.activityKey === "string" ? it.activityKey.trim() : "";
  if (!activityKey) return null;
  if (!Array.isArray(it.nodes) || it.nodes.length === 0 || it.nodes.length > 7) return null;
  const nodes: SagaNode[] = [];
  for (const item of it.nodes) {
    const node = parseNode(item);
    if (!node) return null;
    nodes.push(node);
  }
  const endSave = it.endSave ? normalizeTrialSave(it.endSave) : undefined;
  const bank = sanitizeSagaBank(it.bank);
  const result = it.result;
  const commands = sanitizeSagaCommands(it.commands);
  return {
    version: SAGA_RUN_VERSION,
    kind: "saga",
    activityKey,
    seed: Number(it.seed) >>> 0,
    nodes,
    startSave: normalizeTrialSave(it.startSave),
    purchases: parsePurchases(it.purchases, bank),
    shopSeq: clampInt(Number(it.shopSeq) || 0, 0, 1_000_000),
    bank,
    rules: clampInt(Number(it.rules) || 1, 1, 99),
    commands: commands.length > 0 ? commands : undefined,
    endSave,
    result:
      result && typeof result === "object"
        ? {
            cleared: clampInt(Number(result.cleared) || 0, 0, nodes.length),
            total: clampInt(Number(result.total) || nodes.length, 0, nodes.length),
            victory: result.victory === true,
            chapterBefore: clampInt(Number(result.chapterBefore) || 0, 0, SAGA_CHAPTERS.length - 1),
            chapterAfter: clampInt(Number(result.chapterAfter) || 0, 0, SAGA_CHAPTERS.length - 1),
            chapterName: String(result.chapterName ?? "").slice(0, 32),
            goldGained: clampInt(Number(result.goldGained) || 0, 0, 9_999_999),
            clearGold: clampInt(Number(result.clearGold) || 0, 0, 9_999_999),
            expGained: clampInt(Number(result.expGained) || 0, 0, 9_999_999),
            bankedGold: clampInt(Number(result.bankedGold) || 0, 0, bank.maxGoldPerRun),
            encounters: clampInt(Number(result.encounters) || 0, 0, SAGA_MAX_ENCOUNTERS),
            recruited: Array.isArray(result.recruited)
              ? result.recruited.filter((name): name is string => typeof name === "string").slice(0, 12)
              : [],
            battlesWon: clampInt(Number(result.battlesWon) || 0, 0, 99),
            party: Array.isArray(result.party)
              ? result.party
                  .filter((member) => member && typeof member === "object")
                  .map((member) => ({
                    id: String(member.id ?? "").slice(0, 32),
                    name: String(member.name ?? "").slice(0, 24),
                    level: clampInt(Number(member.level) || 1, 1, 99),
                  }))
                  .slice(0, SAGA_PARTY_SIZE)
              : [],
          }
        : undefined,
  };
}

const ROUND_ACTIONS = new Set<SagaRoundCommand["a"]>([
  "attack",
  "guard",
  "tactic",
  "item",
  "recruit",
]);
const TACTIC_IDS = new Set(["huoji", "huifu", "hunluan", "guwu"]);

function sanitizeRoundCommands(raw: unknown): SagaRoundCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: SagaRoundCommand[] = [];
  for (const item of raw.slice(0, SAGA_PARTY_SIZE)) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const g = typeof it.g === "string" ? it.g.slice(0, 32) : "";
    const a = it.a;
    if (!g || typeof a !== "string" || !ROUND_ACTIONS.has(a as SagaRoundCommand["a"])) continue;
    const command: SagaRoundCommand = { g, a: a as SagaRoundCommand["a"] };
    if (typeof it.t === "string" && TACTIC_IDS.has(it.t)) command.t = it.t as SagaRoundCommand["t"];
    if (typeof it.i === "string") command.i = it.i.slice(0, 32);
    const target = Math.trunc(Number(it.target));
    if (Number.isFinite(target) && target >= 0 && target < 8) command.target = target;
    out.push(command);
  }
  return out;
}

/** 客户端上交的指令先截断、再逐条校验；无法识别的指令直接丢弃，不让重放崩。 */
export function sanitizeSagaCommands(raw: unknown): SagaCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: SagaCommand[] = [];
  let totalRounds = 0;
  let skirmishes = 0;
  for (const item of raw.slice(0, SAGA_MAX_COMMANDS)) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    switch (it.k) {
      case "formation": {
        const formation = SAGA_FORMATION_BY_ID.get(String(it.f ?? "") as FormationId);
        if (formation) out.push({ k: "formation", f: formation.id });
        break;
      }
      case "equip": {
        const slot = it.slot;
        if (slot !== "weapon" && slot !== "armor") break;
        const g = typeof it.g === "string" ? it.g.slice(0, 32) : "";
        if (!g) break;
        const itemId =
          it.i === null || it.i === undefined
            ? null
            : typeof it.i === "string" && SAGA_ITEM_BY_ID.get(it.i)?.kind === slot
              ? it.i
              : undefined;
        if (itemId !== undefined) out.push({ k: "equip", g, slot, i: itemId });
        break;
      }
      case "party": {
        if (!Array.isArray(it.active)) break;
        const active = it.active
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .map((id) => id.slice(0, 32))
          .slice(0, SAGA_PARTY_SIZE);
        if (active.length > 0) out.push({ k: "party", active });
        break;
      }
      case "bank": {
        const gold = Math.trunc(Number(it.g) || 0);
        // 档位、余额与单趟上限都随每次行军的钱庄规则在重放时校验，这里只挡住明显越界的数。
        if (Number.isFinite(gold) && gold > 0 && gold <= 100_000_000) {
          out.push({ k: "bank", g: gold });
        }
        break;
      }
      case "retreat": {
        out.push({ k: "retreat" });
        break;
      }
      case "leave": {
        out.push({ k: "leave" });
        break;
      }
      case "battle": {
        const node = Math.trunc(Number(it.node));
        if (!Number.isFinite(node) || !Array.isArray(it.rounds)) break;
        if (node < 0 || node > SAGA_MAX_NODE_INDEX) break;
        const rounds: SagaRoundCommand[][] = [];
        for (const round of it.rounds) {
          if (totalRounds >= SAGA_MAX_TOTAL_ROUNDS) break;
          if (rounds.length >= SAGA_MAX_ROUNDS_PER_BLOCK) break;
          rounds.push(sanitizeRoundCommands(round));
          totalRounds += 1;
        }
        out.push({ k: "battle", node, rounds });
        break;
      }
      case "skirmish": {
        if (!Array.isArray(it.rounds) || skirmishes >= SAGA_MAX_ENCOUNTERS) break;
        const rounds: SagaRoundCommand[][] = [];
        for (const round of it.rounds) {
          if (totalRounds >= SAGA_MAX_TOTAL_ROUNDS) break;
          if (rounds.length >= SAGA_MAX_ROUNDS_PER_BLOCK) break;
          rounds.push(sanitizeRoundCommands(round));
          totalRounds += 1;
        }
        // 空指令打不完一场遭遇，重放只会把行军锁在战斗里，直接丢掉。
        if (rounds.length === 0) break;
        skirmishes += 1;
        out.push({ k: "skirmish", rounds });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** 出城后还没落过任何指令、购买或商店进账的行军；进度是空的，可以按最新存档安全重开。 */
export function sagaRunUntouched(run: SagaRun): boolean {
  return !run.commands?.length && run.purchases.length === 0 && run.shopSeq === 0;
}

export function createReplayState(run: SagaRun): SagaReplayState {
  return {
    scene: "field",
    rules: run.rules ?? 1,
    clearedNodes: [],
    completed: 0,
    victory: false,
    save: cloneSave(run.startSave),
    inventory: { bonus: {} },
    buffs: { troopPct: 0, attackPct: 0, speed: 0, tacticPoints: 0 },
    partyTroops: {},
    battle: null,
    goldGained: 0,
    expGained: 0,
    bankedGold: 0,
    encounters: 0,
    recruited: [],
    battlesWon: 0,
  };
}

/** 钱庄存金：按本次行军的存金价整档收，扣到单趟上限为止；返回实际存进去的金币。 */
export function bankSagaGold(state: SagaReplayState, gold: number, bank: SagaBankPolicy): number {
  const amount = Math.trunc(Number(gold) || 0);
  if (amount <= 0 || amount % bank.goldPerTcr !== 0) return 0;
  const room = bank.maxGoldPerRun - state.bankedGold;
  const allowed = Math.min(amount, room);
  if (allowed <= 0 || state.save.gold < allowed) return 0;
  state.save.gold -= allowed;
  state.bankedGold += allowed;
  return allowed;
}

/**
 * 客栈重整：把上阵武将的兵力补满；全员满编返回 false。
 * 住店券在购买时已经扣过，重放只负责补兵；兵败后的 `lost` 场景由购买记录切回。
 */
export function restAtInn(state: SagaReplayState): boolean {
  let healed = 0;
  for (const general of state.save.party) {
    const stats = generalStats(general);
    const maxTroops = Math.max(
      1,
      Math.round(stats.maxTroops * (1 + state.buffs.troopPct / 100)),
    );
    const current = Math.min(maxTroops, state.partyTroops[general.id] ?? maxTroops);
    if (current >= maxTroops) continue;
    state.partyTroops[general.id] = maxTroops;
    healed += maxTroops - current;
  }
  return healed > 0;
}

/** 购买记录从购买发生的指令位置起生效，已经打过的仗不会被回溯加强。 */
function applyPurchase(state: SagaReplayState, purchase: SagaPurchase): void {
  if (typeof purchase.goldCost === "number" && purchase.goldCost > 0) {
    // 钱庄金币换券：金币在购买时扣，活动券由服务端即时入账，重放只负责把金币减掉。
    state.save.gold = Math.max(0, state.save.gold - Math.trunc(purchase.goldCost));
    return;
  }
  if (typeof purchase.gold === "number" && purchase.gold > 0) {
    state.save.gold = Math.min(9_999_999, state.save.gold + Math.trunc(purchase.gold));
  }
  if (purchase.itemId === SAGA_INN_ITEM_ID) {
    // 兵败后住店是重整旗鼓：全队拉回满编，行军从下一步继续。
    const revive = state.scene === "lost";
    restAtInn(state);
    if (revive) {
      state.scene = "field";
      state.battle = null;
    }
    return;
  }
  if (purchase.itemId === SAGA_TRAINING_ITEM_ID) {
    if (purchase.generalId && typeof purchase.targetLevel === "number") {
      trainGeneral(state.save, purchase.generalId, purchase.targetLevel);
    }
    return;
  }
  if (purchase.itemId === SAGA_FORGE_ITEM_ID) {
    if (purchase.gearId && typeof purchase.targetLevel === "number") {
      upgradeGear(state.save, purchase.gearId, purchase.targetLevel);
    }
    return;
  }
  const item = SAGA_ITEM_BY_ID.get(purchase.itemId);
  if (!item) return;
  if (item.kind !== "supply") {
    grantItem(state.save, item.id);
    return;
  }
  switch (item.supply) {
    case "troops":
      state.buffs.troopPct = Math.min(30, state.buffs.troopPct + 10);
      break;
    case "attack":
      state.buffs.attackPct = Math.min(45, state.buffs.attackPct + 15);
      break;
    case "speed":
      state.buffs.speed = Math.min(9, state.buffs.speed + 3);
      break;
    case "tactic":
      state.buffs.tacticPoints = Math.min(6, state.buffs.tacticPoints + 2);
      break;
    case "heal":
    case "revive":
      state.inventory.bonus[item.id] = (state.inventory.bonus[item.id] ?? 0) + 1;
      break;
    default:
      break;
  }
}

/** 营地下标是否还能打：越界 / 已破 / 首领营未清完其余营地，都算无效指令。 */
export function canEngageNode(run: SagaRun, state: SagaReplayState, node: number): boolean {
  const index = Math.trunc(node);
  if (!Number.isFinite(index) || index < 0 || index >= run.nodes.length) return false;
  if (state.clearedNodes.includes(index)) return false;
  if (run.nodes[index]?.kind !== "boss") return true;
  // 主帅本阵扎在最后，外围营地没拔干净就冲进去，重放时直接忽略。
  return run.nodes.every((item, itemIndex) => item.kind === "boss" || state.clearedNodes.includes(itemIndex));
}

/** 还没拔掉的营地（首领营要等其余全清），供地图标记与自动行军使用。 */
export function openNodes(run: SagaRun, state: SagaReplayState): number[] {
  const out: number[] = [];
  for (let index = 0; index < run.nodes.length; index++) {
    if (canEngageNode(run, state, index)) out.push(index);
  }
  return out;
}

/** 从战斗中撤退：当前兵力记回队伍，还有人站着就回大地图，全灭才落到住店重整。 */
export function retreatFromBattle(state: SagaReplayState): boolean {
  const battle = state.battle;
  if (!battle || battle.phase !== "select") return false;
  let alive = false;
  for (const general of battle.party) {
    const troops = general.downed ? 0 : general.troops;
    state.partyTroops[general.id] = troops;
    if (troops > 0) alive = true;
  }
  state.battle = null;
  state.scene = alive ? "field" : "lost";
  return true;
}

export function replaySagaRun(run: SagaRun, commands: SagaCommand[]): SagaReplayResult {
  const state = createReplayState(run);
  const purchasesAt = new Map<number, SagaPurchase[]>();
  for (const purchase of run.purchases) {
    const list = purchasesAt.get(purchase.cmdIndex) ?? [];
    list.push(purchase);
    purchasesAt.set(purchase.cmdIndex, list);
  }
  const total = Math.min(commands.length, SAGA_MAX_COMMANDS);
  for (let index = 0; index <= total; index++) {
    for (const purchase of purchasesAt.get(index) ?? []) applyPurchase(state, purchase);
    if (index === total) break;
    if (state.scene === "won") break;
    const command = commands[index];
    if (state.scene === "battle") {
      // 战斗没打完时只有撤退能生效：把当前兵力记回队伍，接着行军，进度不会丢。
      if (command.k === "retreat") retreatFromBattle(state);
      continue;
    }
    switch (command.k) {
      case "formation":
        setFormation(state.save, command.f);
        break;
      case "equip":
        equipGeneral(state.save, command.g, command.slot, command.i);
        break;
      case "party":
        setActiveParty(state.save, command.active);
        break;
      case "bank":
        bankSagaGold(state, command.g, run.bank);
        break;
      case "leave":
        index = total;
        break;
      case "battle": {
        // 败退回城后必须先住店重整，零兵力再出兵只会白送一场。
        if (state.scene === "lost") break;
        if (!canEngageNode(run, state, command.node)) break;
        // 战斗指令必须一次打完：中途停下就锁在本场，不能靠重开指令反复刷新兵力。
        state.scene = "battle";
        const battle = startBattle(run, command.node, state);
        for (const round of command.rounds) {
          resolveBattleRound(battle, round, state);
          if (battle.phase !== "select") break;
        }
        state.battle = battle;
        if (battle.phase === "won") {
          state.clearedNodes.push(command.node);
          state.completed = state.clearedNodes.length;
          state.scene = state.completed >= run.nodes.length ? "won" : "field";
          state.victory = state.completed >= run.nodes.length;
        } else if (battle.phase === "lost") {
          state.scene = "lost";
        }
        break;
      }
      case "skirmish": {
        // 野外遭遇只在行军途中发生；兵败或正在打别的仗时一律不理。
        if (state.scene !== "field" || state.encounters >= SAGA_MAX_ENCOUNTERS) break;
        const ordinal = state.encounters;
        state.encounters += 1;
        state.scene = "battle";
        const battle = startEncounterBattle(run, ordinal, state);
        for (const round of command.rounds) {
          resolveBattleRound(battle, round, state);
          if (battle.phase !== "select") break;
        }
        state.battle = battle;
        if (battle.phase === "won") {
          state.scene = "field";
        } else if (battle.phase === "lost") {
          state.scene = "lost";
        }
        break;
      }
      default:
        break;
    }
  }
  return { state, cleared: state.completed, victory: state.victory };
}

export function finalizeSagaSave(run: SagaRun, state: SagaReplayState): TrialSave {
  const save = cloneSave(state.save);
  const clearedChapter = clampInt(save.chapter, 0, SAGA_CHAPTERS.length - 1);
  save.stats.runs += 1;
  save.stats.battlesWon += state.battlesWon;
  save.stats.bestCleared = Math.max(save.stats.bestCleared, state.completed);
  let unlock: string | null = null;
  if (state.victory) {
    save.stats.wins += 1;
    save.clears += 1;
    unlock = SAGA_CHAPTERS[clearedChapter]?.unlock ?? null;
    if (clearedChapter < SAGA_CHAPTERS.length - 1) save.chapter = clearedChapter + 1;
  }
  applyChapterUnlock(save, unlock);
  return normalizeTrialSave(save);
}

export interface SagaSettlement extends SagaReplayResult {
  endSave: TrialSave;
  result: SagaRunResult;
}

/** 收兵结算：重放指令 → 写回剧情存档 → 战果摘要。不再读 run 里旧的 endSave。 */
export function settleSagaRun(run: SagaRun, commands: SagaCommand[]): SagaSettlement {
  const replay = replaySagaRun(run, commands);
  const endSave = finalizeSagaSave(run, replay.state);
  const chapterBefore = clampInt(run.startSave.chapter, 0, SAGA_CHAPTERS.length - 1);
  const chapter = SAGA_CHAPTERS[chapterBefore];
  const result: SagaRunResult = {
    cleared: replay.cleared,
    total: run.nodes.length,
    victory: replay.victory,
    chapterBefore,
    chapterAfter: endSave.chapter,
    chapterName: chapter?.name ?? "",
    goldGained: replay.state.goldGained,
    clearGold: 0,
    expGained: replay.state.expGained,
    bankedGold: replay.state.bankedGold,
    encounters: replay.state.encounters,
    recruited: replay.state.recruited
      .map((id) => SAGA_GENERAL_BY_ID.get(id)?.name ?? id)
      .slice(0, 12),
    battlesWon: replay.state.battlesWon,
    party: endSave.party.slice(0, SAGA_PARTY_SIZE).map((member) => ({
      id: member.id,
      name: SAGA_GENERAL_BY_ID.get(member.id)?.name ?? member.id,
      level: member.level,
    })),
  };
  return { ...replay, endSave, result };
}

/** 自动战斗的一整场指令：优先计策与回血，没有手段时集中攻击兵力最少的敌将。 */
export function autoBattleRounds(
  run: SagaRun,
  node: number,
  state: SagaReplayState,
): SagaRoundCommand[][] {
  const scratch = JSON.parse(JSON.stringify(state)) as SagaReplayState;
  const battle = startBattle(run, node, scratch);
  const rounds: SagaRoundCommand[][] = [];
  let guard = 0;
  const itemCount = (itemId: string): number =>
    (scratch.inventory.bonus[itemId] ?? 0) + (scratch.save.bag[itemId] ?? 0);
  while (battle.phase === "select" && guard < SAGA_MAX_ROUNDS_PER_BLOCK) {
    guard += 1;
    const round: SagaRoundCommand[] = [];
    const livingEnemies = battle.enemies.filter((enemy) => !enemy.downed);
    const livingAllies = battle.party.filter((general) => !general.downed);
    const weakestAlly = [...livingAllies].sort(
      (a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops,
    )[0];
    const focusTarget = battle.enemies.findIndex(
      (enemy) => !enemy.downed && enemy === livingEnemies.reduce(
        (min, item) => (item.troops < min.troops ? item : min),
        livingEnemies[0],
      ),
    );
    const lureTarget = livingEnemies
      .map((enemy, index) => ({ index, force: enemy.force }))
      .sort((a, b) => b.force - a.force)[0]?.index ?? 0;
    for (const general of battle.party) {
      if (general.downed) continue;
      const hurt = weakestAlly && weakestAlly.troops / weakestAlly.maxTroops < 0.5;
      if (hurt && general.tacticPoints > 0 && general.tactics.includes("huifu")) {
        round.push({ g: general.id, a: "tactic", t: "huifu" });
        continue;
      }
      if (battle.round === 1 && general.tacticPoints > 0 && general.tactics.includes("guwu")) {
        round.push({ g: general.id, a: "tactic", t: "guwu" });
        continue;
      }
      if (
        general.tacticPoints > 0 &&
        general.tactics.includes("hunluan") &&
        livingEnemies.some((enemy) => enemy.confused === 0)
      ) {
        round.push({ g: general.id, a: "tactic", t: "hunluan", target: lureTarget });
        continue;
      }
      if (!hurt && general.tacticPoints > 0 && general.tactics.includes("huoji") && livingEnemies.length >= 2) {
        round.push({ g: general.id, a: "tactic", t: "huoji" });
        continue;
      }
      if (general.troops / general.maxTroops < 0.35) {
        const kit = ["secret_medicine", "medicine", "herb"].find((id) => itemCount(id) > 0);
        if (kit) {
          round.push({ g: general.id, a: "item", i: kit });
          continue;
        }
      }
      round.push({ g: general.id, a: "attack", target: Math.max(0, focusTarget) });
    }
    if (round.length === 0) break;
    rounds.push(round);
    resolveBattleRound(battle, round, scratch);
  }
  return rounds;
}

/** 全军突击：按当前存档自动打完地图上的营地（先清外围再取本阵），用于一键演示与测试。 */
export function autoPlaySagaRun(run: SagaRun): SagaSettlement {
  const commands: SagaCommand[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const replay = replaySagaRun(run, commands);
    const targets = openNodes(run, replay.state);
    if (replay.state.scene !== "field" || targets.length === 0) break;
    const node = targets[0];
    commands.push({ k: "battle", node, rounds: autoBattleRounds(run, node, replay.state) });
  }
  return settleSagaRun(run, commands);
}
