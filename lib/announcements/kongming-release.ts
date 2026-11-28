/** 本版更新公告与活动券补偿的唯一配置源。 */
export const KONGMING_RELEASE = {
  version: "0.107.6",
  title: "诸葛孔明传 v0.107.6 更新：原版场景 BGM 与柜台交互",
  items: [
    "169 个场景的 BGM 全部按桌面版 SceneData.backgroundMusic 接入，城、宫殿、店铺、村庄、寺庙、山洞、森林、山、岛与结局各用原曲",
    "从桌面版资源导出 19 首 OGG，含单独提取的标题曲；标题、序章、世界地图、普通战斗、Boss 战、最终战与英杰之语分别对应原版曲目",
    "世界地图按章节切曲，第五章起使用 World2；八场特殊战斗分别使用 Boss 与 Battle3，其余战斗使用 Battle2",
    "修复室内斜角对话：站在 NPC 影子的斜角格不再因为 1.414 的距离被判成没碰到，正交与斜角贴身都能按 J 对话",
    "修复店内柜台交互：店主身体、阴影和阻挡统一到实体格，对话锚点留在柜台前沿并放宽到柜台前，玩家不再站在影子旁却按 J 没有反应",
  ],
} as const;

/** 补偿张数：按最新一次公告的更新内容条数发放。 */
export const KONGMING_RELEASE_COMPENSATION_TICKETS = KONGMING_RELEASE.items.length;
