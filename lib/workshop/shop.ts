/**
 * 工坊补给商店：金币只在本活动里流通，来源是野外/道馆战利品，去向是精灵球与药水。
 *
 * 定价按「打两三场野架买一颗球」来：1 阶野怪掉十几金，越深掉得越多；
 * 道馆首胜掉 100 金，足够补一轮补给。工坊金币不换成 tcr，也不接受 cr 充值，
 * 免得把活动券的定价体系冲垮。
 */

export type WorkshopShopItemId = "ball" | "potion";

export interface WorkshopShopItem {
  id: WorkshopShopItemId;
  name: string;
  price: number;
  desc: string;
}

export const WORKSHOP_SHOP_ITEMS: WorkshopShopItem[] = [
  { id: "ball", name: "精灵球", price: 25, desc: "捕捉野生灵宠，血量越低越好抓。" },
  { id: "potion", name: "药水", price: 20, desc: "回复一只灵宠 20 点体力，战斗内外都能用。" },
];

export const WORKSHOP_SHOP_BY_ID = new Map(
  WORKSHOP_SHOP_ITEMS.map((item) => [item.id, item] as const),
);

/** 单次最多买几个：防手滑一键清空金币，也防请求被拿来刷数量。 */
export const WORKSHOP_SHOP_MAX_QTY = 10;
