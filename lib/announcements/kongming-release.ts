/** 本版更新公告与活动券补偿的唯一配置源。 */
export const KONGMING_RELEASE = {
  version: "0.107.8",
  title: "诸葛孔明传 v0.107.8 更新：整像素渲染与行走帧还原",
  items: [
    "场景改为整数倍缩放并把画面左上角对齐整像素，地图像素与屏幕像素 1:1，墙壁、家具下方的烘焙阴影不再被重采样切出断层",
    "摄像机偏移改为整像素，滚动时地图不再落在半像素上发虚",
    "行走条带恢复桌面版 64×64 帧，角色本体 32×32 正好占一格，不再被压成 36 帧缩成半格而站到门格外",
    "玩家、跟随者、NPC、店主的落点统一按 64 帧底边换算，进出场景时人物与门格对齐",
  ],
} as const;

/** 补偿张数：按最新一次公告的更新内容条数发放。 */
export const KONGMING_RELEASE_COMPENSATION_TICKETS = KONGMING_RELEASE.items.length;
