import {
  SAGA_FORMATION_BY_ID,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
} from "./data";
import { sagaEncounterFor } from "./encounter";
import { generalStats, grantGeneralExp, recruitToSave } from "./state";
import {
  type SagaBattleEvent,
  type SagaBattleGeneral,
  type SagaBattleState,
  type SagaItemDef,
  type SagaNode,
  type SagaReplayState,
  type SagaRoundCommand,
  type SagaRun,
  type TacticId,
} from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function nextRand(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

function roll(battle: SagaBattleState): number {
  const next = nextRand(battle.rngState);
  battle.rngState = next.state;
  return next.value;
}

function formationAtk(id: SagaBattleState["playerFormation"]): number {
  return (SAGA_FORMATION_BY_ID.get(id)?.atk ?? 100) / 100;
}

function formationDef(id: SagaBattleState["playerFormation"]): number {
  return (SAGA_FORMATION_BY_ID.get(id)?.def ?? 100) / 100;
}

function formationSpd(id: SagaBattleState["playerFormation"]): number {
  return (SAGA_FORMATION_BY_ID.get(id)?.spd ?? 100) / 100;
}

function counterMod(attacker: SagaBattleState["playerFormation"], defender: SagaBattleState["playerFormation"]): number {
  const a = SAGA_FORMATION_BY_ID.get(attacker);
  const d = SAGA_FORMATION_BY_ID.get(defender);
  if (!a || !d) return 1;
  if (a.beats === defender) return 1.12;
  if (d.beats === attacker) return 0.92;
  return 1;
}

const living = (list: SagaBattleGeneral[]): SagaBattleGeneral[] => list.filter((g) => !g.downed);

export function startBattle(run: SagaRun, nodeIndex: number, state: SagaReplayState): SagaBattleState {
  return buildBattle(
    run.nodes[nodeIndex],
    nodeIndex,
    (run.seed ^ ((nodeIndex + 1) * 0x9e3779b9)) >>> 0,
    state,
  );
}

/** 野外遭遇战：编成由种子与序号推出，节点下标记 -1，不占营地进度。 */
export function startEncounterBattle(
  run: SagaRun,
  ordinal: number,
  state: SagaReplayState,
): SagaBattleState {
  return buildBattle(
    sagaEncounterFor(run, ordinal),
    -1,
    (run.seed ^ Math.imul(ordinal + 101, 0x85ebca6b)) >>> 0,
    state,
  );
}

function buildBattle(
  node: SagaNode,
  nodeIndex: number,
  rngState: number,
  state: SagaReplayState,
): SagaBattleState {
  const buffs = state.buffs;
  const party: SagaBattleGeneral[] = state.save.party.map((saved) => {
    const def = SAGA_GENERAL_BY_ID.get(saved.id);
    const stats = generalStats(saved);
    const maxTroops = Math.max(
      1,
      Math.round(stats.maxTroops * (1 + buffs.troopPct / 100)),
    );
    const stored = state.partyTroops[saved.id];
    const troops = clamp(stored ?? maxTroops, 0, maxTroops);
    return {
      id: saved.id,
      name: def?.name ?? saved.id,
      title: def?.title ?? "",
      side: "player",
      level: saved.level,
      troops,
      maxTroops,
      force: stats.force,
      intellect: stats.intellect,
      defense: stats.defense,
      speed: stats.speed + buffs.speed,
      tactics: def?.tactics ?? [],
      tacticPoints: Math.min(9, 2 + Math.floor(stats.intellect / 30) + buffs.tacticPoints),
      weaponAtk: stats.weaponAtk,
      armorDef: stats.armorDef,
      color: def?.color ?? "#475569",
      accent: def?.accent ?? "#e2e8f0",
      guard: false,
      confused: 0,
      buff: 0,
      downed: troops <= 0,
      recruitable: false,
      recruitHard: false,
      boss: false,
    };
  });
  const enemies: SagaBattleGeneral[] = node.enemies.map((enemy) => ({
    id: enemy.id,
    name: enemy.name,
    title: enemy.title,
    side: "enemy",
    level: enemy.level,
    troops: enemy.troops,
    maxTroops: enemy.maxTroops,
    force: enemy.force,
    intellect: enemy.intellect,
    defense: enemy.defense,
    speed: enemy.speed,
    tactics: enemy.tactics,
    tacticPoints: Math.max(2, 2 + Math.floor(enemy.intellect / 30)),
    weaponAtk: 0,
    armorDef: 0,
    color: enemy.color,
    accent: enemy.accent,
    guard: false,
    confused: 0,
    buff: 0,
    downed: false,
    recruitable: enemy.recruitable,
    recruitHard: enemy.recruitHard,
    boss: enemy.boss,
  }));
  return {
    nodeIndex,
    nodeName: node.name,
    boss: node.kind === "boss",
    round: 1,
    phase: "select",
    party,
    enemies,
    playerFormation: state.save.formation,
    enemyFormation: node.enemyFormation,
    target: 0,
    log: [],
    lastEvents: [],
    rngState,
    rewardGold: node.rewardGold,
    rewardExp: node.rewardExp,
    pendingRecruits: [],
  };
}

function consumeItem(state: SagaReplayState, itemId: string): boolean {
  if ((state.inventory.bonus[itemId] ?? 0) > 0) {
    state.inventory.bonus[itemId] -= 1;
    if (state.inventory.bonus[itemId] <= 0) delete state.inventory.bonus[itemId];
    return true;
  }
  if ((state.save.bag[itemId] ?? 0) > 0) {
    state.save.bag[itemId] -= 1;
    if (state.save.bag[itemId] <= 0) delete state.save.bag[itemId];
    return true;
  }
  return false;
}

function attackerAtk(actor: SagaBattleGeneral): number {
  if (actor.side === "player") {
    return actor.force + actor.weaponAtk + actor.level * 2;
  }
  return Math.round(actor.force * 1.15) + actor.level * 3;
}

function defenderDef(target: SagaBattleGeneral): number {
  return target.defense + target.armorDef + Math.floor(target.level * 0.8);
}

function dealDamage(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  target: SagaBattleGeneral,
  events: SagaBattleEvent[],
): void {
  const attackerFormation = actor.side === "player" ? battle.playerFormation : battle.enemyFormation;
  const defenderFormation = actor.side === "player" ? battle.enemyFormation : battle.playerFormation;
  const base = Math.max(
    8,
    attackerAtk(actor) - Math.round(defenderDef(target) * 0.65),
  );
  const variance = 0.85 + roll(battle) * 0.3;
  const buffed = actor.buff > 0 ? 1.2 : 1;
  const guarded = target.guard ? 0.5 : 1;
  const damage = Math.max(
    4,
    Math.round(
      base *
        formationAtk(attackerFormation) *
        formationDef(defenderFormation) *
        counterMod(attackerFormation, defenderFormation) *
        buffed *
        guarded *
        variance,
    ),
  );
  target.troops = Math.max(0, target.troops - damage);
  const suffix = target.guard ? "（格挡）" : "";
  events.push({
    kind: "attack",
    side: actor.side,
    actor: actor.name,
    target: target.name,
    amount: damage,
    text: `${actor.name} 攻击 ${target.name}，-${damage} 兵力${suffix}`,
  });
  if (target.troops <= 0 && !target.downed) {
    target.downed = true;
    events.push({
      kind: "down",
      side: target.side,
      actor: target.name,
      target: target.name,
      text: `${target.name} 败退`,
    });
  }
}

function executeTactic(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  tactic: TacticId,
  requestedTarget: number | undefined,
  events: SagaBattleEvent[],
): void {
  const allies = actor.side === "player" ? battle.party : battle.enemies;
  const foes = actor.side === "player" ? battle.enemies : battle.party;
  const foeFormation = actor.side === "player" ? battle.enemyFormation : battle.playerFormation;
  const allyFormation = actor.side === "player" ? battle.playerFormation : battle.enemyFormation;
  switch (tactic) {
    case "huoji": {
      const power = actor.intellect * 0.6 + actor.level * 2;
      for (const foe of living(foes)) {
        const resist = foe.intellect * 0.4;
        const variance = 0.85 + roll(battle) * 0.3;
        const countered = counterMod(allyFormation, foeFormation);
        let damage = Math.max(6, Math.round((power - resist) * variance * countered));
        if (roll(battle) < 0.22) damage = Math.round(damage * 0.5);
        foe.troops = Math.max(0, foe.troops - damage);
        events.push({
          kind: "tactic",
          side: actor.side,
          actor: actor.name,
          target: foe.name,
          amount: damage,
          text: `${actor.name} 施放火计，${foe.name} -${damage} 兵力`,
        });
        if (foe.troops <= 0 && !foe.downed) {
          foe.downed = true;
          events.push({
            kind: "down",
            side: foe.side,
            actor: foe.name,
            target: foe.name,
            text: `${foe.name} 败退`,
          });
        }
      }
      break;
    }
    case "huifu": {
      const candidates = living(allies).sort((a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops);
      const target = candidates[0];
      if (target) {
        const heal = Math.max(20, Math.round(actor.intellect * 0.8 + actor.level * 2 + 30));
        const before = target.troops;
        target.troops = Math.min(target.maxTroops, target.troops + heal);
        events.push({
          kind: "heal",
          side: actor.side,
          actor: actor.name,
          target: target.name,
          amount: target.troops - before,
          text: `${actor.name} 施放回复，${target.name} +${target.troops - before} 兵力`,
        });
      }
      break;
    }
    case "hunluan": {
      const candidates = living(foes);
      const target =
        (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
        candidates.sort((a, b) => b.force + b.intellect - (a.force + a.intellect))[0];
      if (target) {
        const chance = clamp(50 + (actor.intellect - target.intellect) / 2, 20, 85);
        if (roll(battle) * 100 < chance) {
          target.confused = 2;
          events.push({
            kind: "confuse",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            text: `${actor.name} 施放混乱，${target.name} 陷入混乱`,
          });
        } else {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            text: `${target.name} 看破了混乱之计`,
          });
        }
      }
      break;
    }
    case "guwu": {
      for (const ally of living(allies)) ally.buff = Math.max(ally.buff, 3);
      events.push({
        kind: "buff",
        side: actor.side,
        actor: actor.name,
        text: `${actor.name} 擂鼓鼓舞，全队攻击提升`,
      });
      break;
    }
  }
  actor.tacticPoints = Math.max(0, actor.tacticPoints - 1);
}

function executeItem(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  item: SagaItemDef,
  state: SagaReplayState,
  events: SagaBattleEvent[],
): boolean {
  if (!consumeItem(state, item.id)) return false;
  if (item.supply === "revive") {
    const target = battle.party
      .filter((g) => g.downed)
      .sort((a, b) => b.maxTroops - a.maxTroops)[0];
    if (!target) {
      events.push({ kind: "miss", side: actor.side, actor: actor.name, text: "没有需要复活的武将" });
      return true;
    }
    target.downed = false;
    target.troops = Math.max(1, Math.round(target.maxTroops * 0.4));
    events.push({
      kind: "heal",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      amount: target.troops,
      text: `${actor.name} 使用兵符，${target.name} 以 ${target.troops} 兵力归队`,
    });
    return true;
  }
  const candidates = living(battle.party).sort((a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops);
  const target = candidates[0];
  if (!target) return false;
  const heal = item.supply === "heal" || item.id === "secret_medicine"
    ? target.maxTroops
    : item.heal ?? 0;
  const before = target.troops;
  target.troops = Math.min(target.maxTroops, target.troops + heal);
  events.push({
    kind: "heal",
    side: actor.side,
    actor: actor.name,
    target: target.name,
    amount: target.troops - before,
    text: `${actor.name} 使用${item.name}，${target.name} +${target.troops - before} 兵力`,
  });
  return true;
}

function executeRecruit(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  requestedTarget: number | undefined,
  events: SagaBattleEvent[],
): void {
  const candidates = living(battle.enemies).filter(
    (enemy) => enemy.recruitable && enemy.troops <= enemy.maxTroops * 0.35,
  );
  const target =
    (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
    candidates.sort((a, b) => a.troops - b.troops)[0];
  if (!target) {
    events.push({ kind: "miss", side: actor.side, actor: actor.name, text: "没有可以招降的敌将" });
    return;
  }
  const base = 30 + (actor.level - target.level) * 4 + Math.floor((actor.intellect - target.intellect) / 2);
  const chance = clamp(base - (target.recruitHard ? 25 : 0), 5, 80);
  if (roll(battle) * 100 < chance) {
    target.downed = true;
    target.troops = 0;
    battle.pendingRecruits.push(target.id);
    events.push({
      kind: "recruit",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      text: `${actor.name} 劝降成功，${target.name} 愿意归顺`,
    });
  } else {
    events.push({
      kind: "miss",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      text: `${target.name} 拒绝归降`,
    });
  }
}

function aiCommand(battle: SagaBattleState, actor: SagaBattleGeneral): SagaRoundCommand {
  const playersAlive = living(battle.party);
  const enemiesAlive = living(battle.enemies);
  const target = playersAlive
    .map((g, index) => ({ index, ratio: g.troops / g.maxTroops }))
    .sort((a, b) => a.ratio - b.ratio)[0]?.index ?? 0;
  if (actor.tacticPoints > 0 && actor.tactics.length > 0 && roll(battle) < 0.34) {
    if (actor.tactics.includes("huifu") && enemiesAlive.some((g) => g.troops / g.maxTroops < 0.45)) {
      return { g: actor.id, a: "tactic", t: "huifu" };
    }
    if (actor.tactics.includes("huoji") && playersAlive.length >= 2) {
      return { g: actor.id, a: "tactic", t: "huoji" };
    }
    if (actor.tactics.includes("hunluan") && playersAlive.some((g) => g.confused === 0)) {
      return { g: actor.id, a: "tactic", t: "hunluan", target };
    }
    if (actor.tactics.includes("guwu") && enemiesAlive.every((g) => g.buff === 0)) {
      return { g: actor.id, a: "tactic", t: "guwu" };
    }
  }
  return { g: actor.id, a: "attack", target };
}

function executeCommand(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  command: SagaRoundCommand,
  state: SagaReplayState,
  events: SagaBattleEvent[],
): void {
  if (command.a === "guard") {
    actor.guard = true;
    events.push({ kind: "guard", side: actor.side, actor: actor.name, text: `${actor.name} 举盾防守` });
    return;
  }
  if (command.a === "tactic") {
    const tactic = command.t;
    if (tactic && actor.tactics.includes(tactic) && actor.tacticPoints > 0) {
      executeTactic(battle, actor, tactic, command.target, events);
      return;
    }
  }
  if (command.a === "item" && actor.side === "player") {
    const item = command.i ? SAGA_ITEM_BY_ID.get(command.i) : null;
    if (item && (item.kind === "consumable" || item.kind === "supply") && executeItem(battle, actor, item, state, events)) {
      return;
    }
  }
  if (command.a === "recruit" && actor.side === "player") {
    executeRecruit(battle, actor, command.target, events);
    return;
  }
  const foes = actor.side === "player" ? battle.enemies : battle.party;
  const choices = living(foes);
  if (choices.length === 0) return;
  const target =
    (typeof command.target === "number" ? foes[command.target] : null) && !foes[command.target!]?.downed
      ? foes[command.target!]
      : choices[0];
  dealDamage(battle, actor, target, events);
}

function checkBattleEnd(battle: SagaBattleState): void {
  if (battle.phase !== "select") return;
  if (living(battle.enemies).length === 0) battle.phase = "won";
  else if (living(battle.party).length === 0) battle.phase = "lost";
}

function finishBattle(
  battle: SagaBattleState,
  state: SagaReplayState,
  events: SagaBattleEvent[],
): void {
  battle.phase = living(battle.enemies).length === 0 ? "won" : "lost";
  if (battle.phase === "won") {
    state.save.gold += battle.rewardGold;
    state.goldGained += battle.rewardGold;
    state.expGained += battle.rewardExp;
    state.battlesWon += 1;
    events.push({
      kind: "buff",
      side: "player",
      actor: "战报",
      text: `战斗胜利，获得 ${battle.rewardGold} 金、${battle.rewardExp} 经验`,
    });
    for (const saved of state.save.party) {
      const levels = grantGeneralExp(saved, battle.rewardExp);
      if (levels > 0) {
        events.push({
          kind: "level",
          side: "player",
          actor: SAGA_GENERAL_BY_ID.get(saved.id)?.name ?? saved.id,
          text: `${SAGA_GENERAL_BY_ID.get(saved.id)?.name ?? saved.id} 升至 ${saved.level} 级`,
        });
      }
    }
    for (const enemy of battle.enemies) {
      state.save.met = [...new Set([...state.save.met, enemy.id])];
    }
    for (const id of battle.pendingRecruits) {
      const result = recruitToSave(state.save, id);
      const name = SAGA_GENERAL_BY_ID.get(id)?.name ?? id;
      if (result.ok) {
        state.recruited.push(id);
        if (result.joined === "party") {
          const saved = state.save.party.find((g) => g.id === id);
          if (saved) {
            const stats = generalStats(saved);
            state.partyTroops[id] = Math.round(stats.maxTroops * (1 + state.buffs.troopPct / 100));
          }
        }
        events.push({
          kind: "recruit",
          side: "player",
          actor: name,
          text: `${name} 加入${result.joined === "party" ? "队伍" : "后备"}`,
        });
      } else if (result.reason) {
        events.push({ kind: "miss", side: "player", actor: name, text: `${name} 未能入队：${result.reason}` });
      }
    }
    for (const general of battle.party) {
      if (general.downed) {
        general.troops = Math.max(1, Math.round(general.maxTroops * 0.2));
        general.downed = false;
      } else {
        general.troops = Math.min(
          general.maxTroops,
          general.troops + Math.round(general.maxTroops * 0.1),
        );
      }
      state.partyTroops[general.id] = general.troops;
    }
  } else {
    for (const general of battle.party) {
      state.partyTroops[general.id] = general.downed ? 0 : general.troops;
    }
    events.push({ kind: "down", side: "player", actor: "战报", text: "全军败退，回城休整" });
  }
}

export function resolveBattleRound(
  battle: SagaBattleState,
  roundCommands: SagaRoundCommand[],
  state: SagaReplayState,
): void {
  if (battle.phase !== "select") return;
  const events: SagaBattleEvent[] = [];
  const byId = new Map(roundCommands.map((command) => [command.g, command]));
  const actors = [...living(battle.party), ...living(battle.enemies)].sort((a, b) => {
    const aSpeed =
      a.speed * formationSpd(a.side === "player" ? battle.playerFormation : battle.enemyFormation);
    const bSpeed =
      b.speed * formationSpd(b.side === "player" ? battle.playerFormation : battle.enemyFormation);
    if (bSpeed !== aSpeed) return bSpeed - aSpeed;
    if (a.side !== b.side) return a.side === "player" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  for (const actor of actors) {
    if (battle.phase !== "select") break;
    if (actor.downed) continue;
    if (actor.guard) actor.guard = false;
    if (actor.confused > 0) {
      actor.confused -= 1;
      if (roll(battle) < 0.45) {
        events.push({
          kind: "confuse",
          side: actor.side,
          actor: actor.name,
          text: `${actor.name} 混乱中，无法行动`,
        });
        continue;
      }
    }
    const command =
      actor.side === "player"
        ? byId.get(actor.id) ?? { g: actor.id, a: "attack" as const, target: battle.target }
        : aiCommand(battle, actor);
    executeCommand(battle, actor, command, state, events);
    checkBattleEnd(battle);
  }
  if (battle.phase === "select") {
    battle.round += 1;
    for (const general of [...battle.party, ...battle.enemies]) {
      if (general.buff > 0) general.buff -= 1;
    }
  } else {
    finishBattle(battle, state, events);
  }
  battle.lastEvents = events;
  battle.log = [...battle.log, ...events].slice(-48);
  const target = battle.enemies.findIndex((enemy) => !enemy.downed);
  if (target >= 0) battle.target = target;
}
