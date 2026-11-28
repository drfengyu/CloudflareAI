/** 本版更新公告与活动券补偿的唯一配置源。 */
export const KONGMING_RELEASE = {
  version: "0.107.7",
  title: "诸葛孔明传 v0.107.7 更新：原版锚点对照与去除自绘阴影",
  items: [
    "按桌面版 SpriteRenderer 的左下角 pivot 校正人物、队伍与店主落格位置，不再按网页自造的中心锚点偏移",
    "移除玩家、跟随者、NPC、店主与宝箱脚下的自绘黑色椭圆；原版运行时不生成动态脚下阴影，场景阴影只保留瓦片底图烘焙层",
    "去掉宝箱上方自绘的「宝」字标签，只保留原版箱体与开宝判定",
    "店主独立精灵按原版 32×32、PPU 32 落格；客栈柜台前按 J 仍可正常触发住宿对话",
    "补齐方向键移动：箭头键与 WASD 走同一套四向判定；事件锚点带小数时，阻挡格按最近格判定，不再误判成墙",
  ],
} as const;

/** 补偿张数：按最新一次公告的更新内容条数发放。 */
export const KONGMING_RELEASE_COMPENSATION_TICKETS = KONGMING_RELEASE.items.length;
