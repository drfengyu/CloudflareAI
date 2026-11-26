import type { Scene } from "./data";

/**
 * 徐州“券房”是活动期自建场景，不改原版 scene 数据：
 * - 徐州城内 (7,-2) 的民居改为券房入口；
 * - 房间直接借用原版「武」武器店的 18×17 柜台地图与碰撞，外观、
 *   门口与柜台都和武器店一致；
 * - 房内券商事件由 `executeLua` 专门处理，不写进 Lua 包。
 */
export const COUPON_ROOM_LEVEL = 172;
export const COUPON_EVENT_ID = "99001";
export const COUPON_ENTER_TAG = "徐州券房";

export function installCouponRoom(scenes: Scene[]): Scene[] {
  const base = scenes.find((s) => s.level === 5);
  if (!base) return scenes;
  const city = scenes.find((s) => s.level === 11);
  if (!city) return scenes;

  const room: Scene = {
    ...base,
    level: COUPON_ROOM_LEVEL,
    id: "level172",
    name: "徐州券房",
    legacyName: undefined,
    // 券房使用自绘的「券」字底图，不能沿用武器店的 Foreground 牌匾覆盖层。
    map: { ...base.map!, src: "/game-assets/kongming/maps/level172.png", fg: undefined },
    // 原版 `level5` 的 TilemapCollider 没有把中央柜台单独标成障碍，玩家能
    // 直接跨到柜台后面。券房沿用同一地图，补一块和柜台等宽的阻挡盒。
    boxes: [[6.5, 3.5, 3.4, 1.1]],
    events: [
      {
        id: COUPON_EVENT_ID,
        when: 2,
        pos: [5, 2],
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
      { pos: [4.43, -7.04], type: 3, scene: "大地图", tag: "徐州", destTag: 0, when: 1 },
    ],
    destinations: [{ pos: [4, -5], tag: COUPON_ENTER_TAG, destTag: 0 }],
    chests: [],
    start: [4, 0],
    previous: "徐州",
    isWorld: false,
    isCave: false,
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
