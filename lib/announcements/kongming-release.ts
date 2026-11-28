/** 本版更新公告与活动券补偿的唯一配置源。 */
export const KONGMING_RELEASE = {
  version: "0.107.5",
  title: "诸葛孔明传 v0.107.5 更新：出城切场、虚拟键与移动端全屏",
  items: [
    "未登场的隐藏 NPC 不再占住格子，徐州南门的陈登不再挡路，出皇宫与出城可连续切场",
    "从大地图进城后落在门口不再立刻被送回大地图，走出门洞范围后才恢复出城触发",
    "虚拟方向键抬手后补发释放，点一次只走一格、按住才连续走，不再粘键冲过门口",
    "触屏 J / K 点按补齐释放，标题、对白与军帐菜单不会残留按键状态",
    "移动端全屏增加固定层兜底，iOS Safari 与部分 App WebView 也能铺满屏幕并退出恢复",
  ],
} as const;

/** 补偿张数：按最新一次公告的更新内容条数发放。 */
export const KONGMING_RELEASE_COMPENSATION_TICKETS = KONGMING_RELEASE.items.length;
