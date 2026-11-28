/** 本版更新公告与活动券补偿的唯一配置源。 */
export const KONGMING_RELEASE = {
  version: "0.107.9",
  title: "诸葛孔明传 v0.107.9 更新：NPC 与主角同高、清理主城静态路人",
  items: [
    "NPC 行走贴图按桌面版 32×32 角色尺寸重新导出，老人、书生、董承等与玩家、队伍同高，不再比主角矮一截",
    "城内静态单帧 NPC 改按 64×64 帧落格，与行走 NPC 共用同一套脚底基准，不再缩成半格、站到门格外",
    "主城只保留有名有姓的剧情 NPC，大爷 / 中年人 / 书生这类原地不动的无名路人不参与绘制",
    "徐州城底图里烘死的那几处小人一并擦除并按周边地形修补，宿店右侧、武店前与城门口不再有人影站着不动",
  ],
} as const;

/** 补偿张数：按最新一次公告的更新内容条数发放。 */
export const KONGMING_RELEASE_COMPENSATION_TICKETS = KONGMING_RELEASE.items.length;
