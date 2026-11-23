import type { Scene } from "./data";

/**
 * 徐州“券房”是活动期自建场景，不改原版 scene 数据：
 * - 徐州城内 (7,-2) 的“役”上方民房改为券房入口；
 * - 房间借用原版 16×12 民居地图，保留原版碰撞，去掉原场景宝箱；
 * - 房内 Gupta 券商的场景事件由 `executeLua` 专门处理，不写进 Lua 包。
 */
export const COUPON_ROOM_LEVEL = 172;
export const COUPON_EVENT_ID = "99001";
export const COUPON_ENTER_TAG = "徐州券房";

export function installCouponRoom(scenes: Scene[]): Scene[] {
  const base = scenes.find((s) => s.level === 18);
  if (!base) return scenes;
  const city = scenes.find((s) => s.level === 11);
  if (!city) return scenes;

  const room: Scene = {
    ...base,
    level: COUPON_ROOM_LEVEL,
    id: "level172",
    name: "徐州券房",
    map: { ...base.map!, src: "/game-assets/kongming/maps/level18.png" },
    events: [
      {
        id: COUPON_EVENT_ID,
        when: 2,
        pos: [0, 1],
        go: 0,
        params: [],
        names: [{ name: "券商", profile: "券商" }],
        show: "",
        hide: "",
        chapter: null,
        battles: [],
        startHide: false,
        hideAfter: false,
        model: null,
      },
    ],
    npcs: [],
    transitions: [
      { pos: [0, -5.0], type: 0, scene: "徐州", tag: COUPON_ENTER_TAG, destTag: 0, when: 1 },
    ],
    destinations: [{ pos: [0, -3], tag: COUPON_ENTER_TAG, destTag: 0 }],
    chests: [],
    start: [0, -3],
    previous: "徐州",
    isWorld: false,
    isCave: true,
    terrain: base.terrain,
    hasBoat: false,
  };

  // 只改“役”正上方那一间：level11 原 tag 民房1，坐标 (7,-2)。
  const door = city.transitions.find((t) => t.pos[0] === 7 && t.pos[1] === -2);
  if (door) {
    door.scene = "徐州券房";
    door.tag = COUPON_ENTER_TAG;
  }
  const dest = city.destinations.find((d) => d.pos[0] === 7 && d.pos[1] === -2);
  if (dest) dest.tag = COUPON_ENTER_TAG;

  return [...scenes, room];
}
