import type {
  FormationId,
  GearSlot,
  SagaChapterDef,
  SagaCorps,
  SagaFormationDef,
  SagaGeneralDef,
  SagaItemDef,
  SagaItemKind,
  SagaTacticDef,
  SagaTraitDef,
  TacticId,
  WeaponType,
} from "./types";

/** 武将固有特性：民间改版里那种「此人独一份」的长板。 */
export const SAGA_TRAITS: SagaTraitDef[] = [
  { id: "wushuang", name: "无双", desc: "武力 +6，普攻伤害 +10%，两成概率追击一次", force: 6, attackPct: 0.1, extraAttack: 0.2 },
  { id: "zhisheng", name: "智圣", desc: "智力 +8，开局计策点 +1，计策效果 +20%", intellect: 8, tacticPoints: 1, tacticPct: 0.2 },
  { id: "huixin", name: "会心", desc: "暴击率 +22%，暴击伤害 ×1.7", crit: 0.22 },
  { id: "mengjiang", name: "猛将", desc: "武力 +6，普攻伤害 +12%", force: 6, attackPct: 0.12 },
  { id: "tiebi", name: "铁壁", desc: "防御 +8，受到伤害 -12%", defense: 8, damageCut: 0.12 },
  { id: "shensu", name: "神速", desc: "速度 +8，一成概率追击一次", speed: 8, extraAttack: 0.1 },
  { id: "rende", name: "仁德", desc: "开局计策点 +1，计策效果 +15%", tacticPoints: 1, tacticPct: 0.15 },
  { id: "xiaoxiong", name: "枭雄", desc: "武力 +3，智力 +4，计策点 +1，暴击率 +8%", force: 3, intellect: 4, tacticPoints: 1, crit: 0.08 },
  { id: "ganglie", name: "刚烈", desc: "武力 +3，防御 +6，受到伤害 -8%", force: 3, defense: 6, damageCut: 0.08 },
  { id: "shendao", name: "神算", desc: "智力 +10，计策效果 +25%", intellect: 10, tacticPct: 0.25 },
  { id: "baizhan", name: "百战", desc: "武力 +4，暴击率 +10%，受到伤害 -6%", force: 4, crit: 0.1, damageCut: 0.06 },
  { id: "zhenjun", name: "镇军", desc: "防御 +10，开局计策点 +1", defense: 10, tacticPoints: 1 },
  { id: "xiaoyong", name: "骁勇", desc: "武力 +5，一成二概率追击一次", force: 5, extraAttack: 0.12 },
  { id: "jizhi", name: "机智", desc: "智力 +6，速度 +4，计策效果 +10%", intellect: 6, speed: 4, tacticPct: 0.1 },
  { id: "tongshuai", name: "统率", desc: "防御 +5，开局计策点 +1，普攻伤害 +5%", defense: 5, tacticPoints: 1, attackPct: 0.05 },
  { id: "xianfeng", name: "先锋", desc: "速度 +6，暴击率 +12%", speed: 6, crit: 0.12 },
];

export const SAGA_TRAIT_BY_ID = new Map(SAGA_TRAITS.map((trait) => [trait.id, trait]));

/** 武将图鉴：史实人物与演义称号，数值为原创平衡。 */
export const SAGA_GENERALS: SagaGeneralDef[] = [
  { id: "liubei", name: "刘备", title: "仁德之主", force: 70, intellect: 72, defense: 66, speed: 64, tactics: ["huifu", "guwu"], learn: [{ level: 10, tactic: "hunluan" }], traits: ["rende"], baseTroops: 180, growth: 10, color: "#3f6212", accent: "#bef264" },
  { id: "guanyu", name: "关羽", title: "武圣", force: 97, intellect: 75, defense: 82, speed: 60, tactics: ["guwu"], learn: [{ level: 12, tactic: "hunluan" }], traits: ["mengjiang"], baseTroops: 200, growth: 12, color: "#166534", accent: "#fde68a" },
  { id: "zhangfei", name: "张飞", title: "燕人", force: 98, intellect: 32, defense: 84, speed: 55, tactics: ["hunluan"], traits: ["mengjiang"], baseTroops: 210, growth: 12, color: "#7f1d1d", accent: "#fca5a5" },
  { id: "zhaoyun", name: "赵云", title: "常山赵子龙", force: 96, intellect: 76, defense: 84, speed: 78, tactics: ["huoji"], learn: [{ level: 10, tactic: "guwu" }, { level: 16, tactic: "hunluan" }], traits: ["huixin"], baseTroops: 195, growth: 11, color: "#1e40af", accent: "#bfdbfe", recruitable: true },
  { id: "huangzhong", name: "黄忠", title: "老当益壮", force: 93, intellect: 62, defense: 76, speed: 56, tactics: ["huoji"], traits: ["huixin"], baseTroops: 190, growth: 11, color: "#a16207", accent: "#fde68a", recruitable: true },
  { id: "machao", name: "马超", title: "锦马超", force: 97, intellect: 48, defense: 78, speed: 80, tactics: ["guwu"], traits: ["huixin"], baseTroops: 200, growth: 11, color: "#475569", accent: "#e2e8f0", recruitable: true },
  { id: "weiyan", name: "魏延", title: "镇北将军", force: 90, intellect: 58, defense: 72, speed: 68, tactics: ["hunluan"], traits: ["mengjiang"], baseTroops: 185, growth: 10, color: "#6b21a8", accent: "#e9d5ff", recruitable: true },
  { id: "pangtong", name: "庞统", title: "凤雏", force: 42, intellect: 96, defense: 50, speed: 58, tactics: ["huoji", "hunluan"], learn: [{ level: 8, tactic: "guwu" }, { level: 14, tactic: "huifu" }], traits: ["zhisheng"], baseTroops: 150, growth: 8, color: "#4b5563", accent: "#fbbf24", recruitable: true },
  { id: "fazheng", name: "法正", title: "蜀郡谋主", force: 48, intellect: 92, defense: 54, speed: 62, tactics: ["huifu", "hunluan"], learn: [{ level: 10, tactic: "huoji" }, { level: 16, tactic: "guwu" }], traits: ["zhisheng"], baseTroops: 150, growth: 8, color: "#0f766e", accent: "#99f6e4", recruitable: true },
  { id: "yanyan", name: "严颜", title: "巴郡老将", force: 88, intellect: 60, defense: 78, speed: 50, tactics: ["guwu"], traits: ["tiebi"], baseTroops: 180, growth: 10, color: "#78350f", accent: "#fcd34d", recruitable: true },
  { id: "zhangren", name: "张任", title: "西川枪王", force: 89, intellect: 68, defense: 76, speed: 66, tactics: ["huoji"], traits: ["shensu"], baseTroops: 180, growth: 10, color: "#7c2d12", accent: "#fdba74", recruitable: true },
  { id: "taishici", name: "太史慈", title: "神亭岭", force: 94, intellect: 66, defense: 78, speed: 72, tactics: ["guwu"], traits: ["shensu"], baseTroops: 195, growth: 11, color: "#0e7490", accent: "#a5f3fc", recruitable: true },
  { id: "ganning", name: "甘宁", title: "锦帆贼", force: 92, intellect: 60, defense: 74, speed: 80, tactics: ["huoji"], traits: ["shensu"], baseTroops: 190, growth: 11, color: "#9a3412", accent: "#fdba74", recruitable: true },
  { id: "huaxiong", name: "华雄", title: "汜水关", force: 92, intellect: 40, defense: 76, speed: 62, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 195, growth: 11, color: "#7f1d1d", accent: "#fecaca", recruitable: true },
  { id: "lvbu", name: "吕布", title: "飞将", force: 100, intellect: 36, defense: 88, speed: 86, tactics: ["guwu"], traits: ["wushuang"], baseTroops: 240, growth: 13, color: "#4c1d95", accent: "#fbbf24", recruitable: true, recruitHard: true },
  { id: "zhugeliang", name: "诸葛亮", title: "卧龙", force: 38, intellect: 100, defense: 58, speed: 60, tactics: ["huoji", "huifu", "hunluan", "guwu"], traits: ["zhisheng"], baseTroops: 160, growth: 8, color: "#1e3a8a", accent: "#bfdbfe", recruitable: true },
  { id: "zhanghe", name: "张郃", title: "巧变", force: 90, intellect: 66, defense: 78, speed: 72, tactics: ["guwu"], traits: ["shensu"], baseTroops: 190, growth: 11, color: "#365314", accent: "#d9f99d", recruitable: true },
  { id: "zhangjiao", name: "张角", title: "天公将军", force: 55, intellect: 92, defense: 60, speed: 50, tactics: ["huoji", "huifu", "hunluan", "guwu"], traits: ["zhisheng"], baseTroops: 220, growth: 12, color: "#581c87", accent: "#e9d5ff", enemyOnly: true },
  { id: "zhangbao", name: "张宝", title: "地公将军", force: 60, intellect: 70, defense: 58, speed: 55, tactics: ["huoji"], baseTroops: 180, growth: 10, color: "#6b21a8", accent: "#d8b4fe", enemyOnly: true },
  { id: "zhangliang", name: "张梁", title: "人公将军", force: 65, intellect: 55, defense: 60, speed: 54, tactics: ["guwu"], baseTroops: 180, growth: 10, color: "#7e22ce", accent: "#e9d5ff", enemyOnly: true },
  { id: "huangjin_lishi", name: "黄巾力士", title: "黄巾", force: 70, intellect: 20, defense: 62, speed: 48, tactics: [], baseTroops: 150, growth: 8, color: "#a16207", accent: "#fde68a", enemyOnly: true },
  { id: "chengyuanzhi", name: "程远志", title: "黄巾渠帅", force: 78, intellect: 30, defense: 62, speed: 48, tactics: [], baseTroops: 160, growth: 9, color: "#92400e", accent: "#fde68a", enemyOnly: true },
  { id: "dengmao", name: "邓茂", title: "黄巾渠帅", force: 72, intellect: 28, defense: 58, speed: 50, tactics: [], baseTroops: 150, growth: 9, color: "#a16207", accent: "#fef3c7", enemyOnly: true },
  { id: "lisu", name: "李肃", title: "董卓部将", force: 70, intellect: 50, defense: 62, speed: 56, tactics: [], baseTroops: 160, growth: 9, color: "#57534e", accent: "#e7e5e4", enemyOnly: true },
  { id: "huzhen", name: "胡轸", title: "董卓部将", force: 76, intellect: 40, defense: 66, speed: 52, tactics: [], baseTroops: 165, growth: 9, color: "#44403c", accent: "#d6d3d1", enemyOnly: true },
  { id: "dongzhuo", name: "董卓", title: "太师", force: 70, intellect: 60, defense: 80, speed: 40, tactics: ["guwu"], traits: ["tiebi"], baseTroops: 240, growth: 13, color: "#7c2d12", accent: "#fbbf24", enemyOnly: true },
  { id: "caobao", name: "曹豹", title: "徐州部将", force: 70, intellect: 40, defense: 64, speed: 50, tactics: [], baseTroops: 160, growth: 9, color: "#365314", accent: "#bef264", enemyOnly: true },
  { id: "chezhou", name: "车胄", title: "徐州刺史", force: 72, intellect: 50, defense: 66, speed: 52, tactics: [], baseTroops: 165, growth: 9, color: "#3f6212", accent: "#d9f99d", enemyOnly: true },
  { id: "xiahoudun", name: "夏侯惇", title: "独眼", force: 90, intellect: 55, defense: 78, speed: 66, tactics: ["guwu"], baseTroops: 210, growth: 12, color: "#1e3a8a", accent: "#93c5fd", enemyOnly: true },
  { id: "xiahouyuan", name: "夏侯渊", title: "疾行", force: 88, intellect: 58, defense: 76, speed: 70, tactics: ["guwu"], traits: ["shensu"], baseTroops: 205, growth: 11, color: "#1d4ed8", accent: "#bfdbfe", enemyOnly: true },
  { id: "caoren", name: "曹仁", title: "铁壁", force: 82, intellect: 60, defense: 80, speed: 58, tactics: ["hunluan"], traits: ["tiebi"], baseTroops: 205, growth: 11, color: "#172554", accent: "#93c5fd", enemyOnly: true },
  { id: "yanliang", name: "颜良", title: "河北上将", force: 92, intellect: 40, defense: 74, speed: 60, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 210, growth: 12, color: "#7f1d1d", accent: "#fecaca", enemyOnly: true },
  { id: "wenchou", name: "文丑", title: "河北上将", force: 91, intellect: 36, defense: 72, speed: 62, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 210, growth: 12, color: "#991b1b", accent: "#fca5a5", enemyOnly: true },
  { id: "gaolan", name: "高览", title: "河北四庭柱", force: 86, intellect: 50, defense: 72, speed: 60, tactics: [], baseTroops: 190, growth: 10, color: "#78350f", accent: "#fcd34d", enemyOnly: true },
  { id: "yuanshao", name: "袁绍", title: "四世三公", force: 70, intellect: 72, defense: 78, speed: 54, tactics: ["huoji", "guwu"], learn: [{ level: 16, tactic: "hunluan" }], baseTroops: 240, growth: 13, color: "#4c1d95", accent: "#ddd6fe", enemyOnly: true },
  { id: "caimao", name: "蔡瑁", title: "水军都督", force: 68, intellect: 50, defense: 64, speed: 58, tactics: ["huoji"], baseTroops: 185, growth: 10, color: "#0f766e", accent: "#99f6e4", enemyOnly: true },
  { id: "zhangyun", name: "张允", title: "水军副将", force: 66, intellect: 48, defense: 62, speed: 60, tactics: ["huoji"], baseTroops: 180, growth: 10, color: "#115e59", accent: "#5eead4", enemyOnly: true },
  { id: "caocao", name: "曹操", title: "魏武帝", force: 78, intellect: 88, defense: 82, speed: 64, tactics: ["huoji", "huifu", "hunluan", "guwu"], traits: ["zhisheng"], baseTroops: 260, growth: 14, color: "#1e3a8a", accent: "#fbbf24", enemyOnly: true },
  { id: "liuzhang", name: "刘璋", title: "益州牧", force: 52, intellect: 60, defense: 70, speed: 44, tactics: ["huifu"], baseTroops: 230, growth: 12, color: "#3f6212", accent: "#fde68a", enemyOnly: true },
  { id: "liukui", name: "刘璝", title: "益州将", force: 78, intellect: 50, defense: 70, speed: 54, tactics: [], baseTroops: 175, growth: 10, color: "#365314", accent: "#d9f99d", enemyOnly: true },
  { id: "lengbao", name: "冷苞", title: "益州将", force: 76, intellect: 46, defense: 68, speed: 56, tactics: [], baseTroops: 175, growth: 10, color: "#4d7c0f", accent: "#ecfccb", enemyOnly: true },
  { id: "xuhuang", name: "徐晃", title: "公明", force: 90, intellect: 62, defense: 80, speed: 66, tactics: ["guwu"], baseTroops: 205, growth: 11, color: "#1e40af", accent: "#bfdbfe", enemyOnly: true },
  { id: "caohong", name: "曹洪", title: "子廉", force: 84, intellect: 50, defense: 76, speed: 58, tactics: [], baseTroops: 195, growth: 10, color: "#1d4ed8", accent: "#dbeafe", enemyOnly: true },
  { id: "simayi", name: "司马懿", title: "冢虎", force: 60, intellect: 98, defense: 76, speed: 70, tactics: ["huoji", "huifu", "hunluan", "guwu"], traits: ["zhisheng"], baseTroops: 260, growth: 14, color: "#3b0764", accent: "#d8b4fe", enemyOnly: true },
  { id: "guohuai", name: "郭淮", title: "雍州刺史", force: 82, intellect: 70, defense: 74, speed: 64, tactics: ["huoji"], learn: [{ level: 18, tactic: "hunluan" }], baseTroops: 200, growth: 11, color: "#312e81", accent: "#c7d2fe", enemyOnly: true },
  { id: "sunli", name: "孙礼", title: "曹魏将", force: 80, intellect: 58, defense: 70, speed: 62, tactics: [], baseTroops: 190, growth: 10, color: "#3730a3", accent: "#e0e7ff", enemyOnly: true },
  { id: "jiling", name: "纪灵", title: "三尖刀", force: 88, intellect: 46, defense: 76, speed: 60, tactics: ["guwu"], baseTroops: 195, growth: 11, color: "#713f12", accent: "#fde68a", enemyOnly: true },
  { id: "qiaorui", name: "桥蕤", title: "袁术上将", force: 80, intellect: 40, defense: 68, speed: 56, tactics: [], baseTroops: 180, growth: 10, color: "#854d0e", accent: "#fef08a", enemyOnly: true },
  { id: "zhangxun", name: "张勋", title: "袁术大将", force: 82, intellect: 48, defense: 70, speed: 58, tactics: [], baseTroops: 185, growth: 10, color: "#92400e", accent: "#fde68a", enemyOnly: true },
  { id: "yuanshu", name: "袁术", title: "仲家皇帝", force: 62, intellect: 58, defense: 74, speed: 48, tactics: ["huifu", "guwu"], baseTroops: 230, growth: 12, color: "#78350f", accent: "#fbbf24", enemyOnly: true },
  { id: "gaoshun", name: "高顺", title: "陷阵营", force: 89, intellect: 58, defense: 82, speed: 64, tactics: ["guwu"], traits: ["tiebi"], baseTroops: 200, growth: 11, color: "#4c1d95", accent: "#ddd6fe", recruitable: true },
  { id: "chengong", name: "陈宫", title: "吕布军师", force: 50, intellect: 92, defense: 58, speed: 60, tactics: ["huoji", "hunluan", "huifu"], learn: [{ level: 12, tactic: "guwu" }], baseTroops: 170, growth: 9, color: "#5b21b6", accent: "#e9d5ff", enemyOnly: true },
  { id: "zhangliao", name: "张辽", title: "文远", force: 94, intellect: 78, defense: 82, speed: 74, tactics: ["guwu"], learn: [{ level: 14, tactic: "huoji" }], traits: ["shensu"], baseTroops: 205, growth: 12, color: "#312e81", accent: "#c7d2fe", recruitable: true, recruitHard: true },
  { id: "caoxing", name: "曹性", title: "吕布部将", force: 78, intellect: 40, defense: 66, speed: 62, tactics: [], baseTroops: 170, growth: 9, color: "#581c87", accent: "#d8b4fe", enemyOnly: true },
  { id: "guanping", name: "关平", title: "校尉", force: 86, intellect: 56, defense: 74, speed: 66, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 185, growth: 10, color: "#166534", accent: "#fde68a", recruitable: true },
  { id: "guanxing", name: "关兴", title: "少将军", force: 84, intellect: 58, defense: 72, speed: 68, tactics: ["guwu"], baseTroops: 180, growth: 10, color: "#15803d", accent: "#bbf7d0", recruitable: true },
  { id: "madai", name: "马岱", title: "西凉骑将", force: 82, intellect: 56, defense: 72, speed: 72, tactics: ["guwu"], traits: ["shensu"], baseTroops: 180, growth: 10, color: "#475569", accent: "#e2e8f0", recruitable: true },
  { id: "wangping", name: "王平", title: "无当飞军", force: 78, intellect: 64, defense: 78, speed: 62, tactics: ["guwu"], traits: ["tiebi"], baseTroops: 180, growth: 10, color: "#4d7c0f", accent: "#ecfccb", recruitable: true },
  { id: "jiangwei", name: "姜维", title: "天水麒麟", force: 89, intellect: 90, defense: 80, speed: 74, tactics: ["huoji", "guwu"], learn: [{ level: 14, tactic: "hunluan" }], traits: ["zhisheng"], baseTroops: 195, growth: 11, color: "#1e3a8a", accent: "#bfdbfe", recruitable: true },
  { id: "liaohua", name: "廖化", title: "前将军", force: 78, intellect: 54, defense: 72, speed: 60, tactics: [], baseTroops: 170, growth: 9, color: "#3f6212", accent: "#d9f99d", recruitable: true },
  { id: "zhoucang", name: "周仓", title: "关西大汉", force: 76, intellect: 30, defense: 68, speed: 58, tactics: [], traits: ["mengjiang"], baseTroops: 175, growth: 9, color: "#7f1d1d", accent: "#fca5a5", recruitable: true },
  { id: "guanhai", name: "管亥", title: "黄巾渠帅", force: 82, intellect: 34, defense: 66, speed: 54, tactics: ["guwu"], baseTroops: 180, growth: 9, color: "#92400e", accent: "#fde68a", enemyOnly: true },
  { id: "peiyuanshao", name: "裴元绍", title: "黄巾余部", force: 74, intellect: 26, defense: 62, speed: 56, tactics: [], baseTroops: 165, growth: 9, color: "#a16207", accent: "#fef3c7", enemyOnly: true },
  { id: "xuchu", name: "许褚", title: "虎痴", force: 95, intellect: 32, defense: 82, speed: 62, tactics: ["guwu"], traits: ["wushuang"], baseTroops: 210, growth: 12, color: "#1e3a8a", accent: "#fbbf24", recruitable: true, recruitHard: true },
  { id: "dianwei", name: "典韦", title: "古之恶来", force: 96, intellect: 30, defense: 80, speed: 66, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 210, growth: 12, color: "#7f1d1d", accent: "#fde68a", recruitable: true, recruitHard: true },
  { id: "yujin", name: "于禁", title: "五子良将", force: 84, intellect: 62, defense: 80, speed: 60, tactics: ["guwu"], traits: ["tiebi"], baseTroops: 200, growth: 11, color: "#1e40af", accent: "#bfdbfe", recruitable: true },
  { id: "yuejin", name: "乐进", title: "先登死士", force: 85, intellect: 56, defense: 74, speed: 70, tactics: ["guwu"], traits: ["shensu"], baseTroops: 195, growth: 10, color: "#1d4ed8", accent: "#dbeafe", recruitable: true },
  { id: "lidian", name: "李典", title: "破虏将军", force: 80, intellect: 64, defense: 74, speed: 60, tactics: [], traits: ["jizhi"], baseTroops: 185, growth: 10, color: "#172554", accent: "#93c5fd", recruitable: true },
  { id: "pangde", name: "庞德", title: "抬棺决战", force: 92, intellect: 62, defense: 80, speed: 66, tactics: ["guwu"], traits: ["baizhan"], baseTroops: 205, growth: 11, color: "#7c2d12", accent: "#fdba74", recruitable: true, recruitHard: true },
  { id: "zhangxiu", name: "张绣", title: "北地枪王", force: 88, intellect: 54, defense: 76, speed: 68, tactics: ["guwu"], traits: ["shensu"], baseTroops: 195, growth: 10, color: "#57534e", accent: "#e7e5e4", recruitable: true },
  { id: "caozhen", name: "曹真", title: "大司马", force: 80, intellect: 68, defense: 78, speed: 58, tactics: [], traits: ["tongshuai"], baseTroops: 200, growth: 11, color: "#1e3a8a", accent: "#93c5fd", enemyOnly: true },
  { id: "guojia", name: "郭嘉", title: "鬼才", force: 42, intellect: 97, defense: 52, speed: 58, tactics: ["huoji", "hunluan", "guwu"], traits: ["zhisheng"], baseTroops: 150, growth: 8, color: "#312e81", accent: "#c7d2fe", recruitable: true },
  { id: "xunyu", name: "荀彧", title: "王佐之才", force: 40, intellect: 94, defense: 56, speed: 54, tactics: ["huifu", "guwu"], traits: ["jizhi"], baseTroops: 150, growth: 8, color: "#0f766e", accent: "#99f6e4", recruitable: true },
  { id: "dengai", name: "邓艾", title: "偷渡阴平", force: 82, intellect: 86, defense: 78, speed: 66, tactics: ["huoji", "guwu"], traits: ["zhisheng"], baseTroops: 200, growth: 11, color: "#312e81", accent: "#c7d2fe", enemyOnly: true },
  { id: "zhonghui", name: "钟会", title: "钟司徒", force: 70, intellect: 88, defense: 72, speed: 64, tactics: ["huoji", "hunluan"], traits: ["jizhi"], baseTroops: 190, growth: 10, color: "#3b0764", accent: "#d8b4fe", enemyOnly: true },
  { id: "haozhao", name: "郝昭", title: "守城名将", force: 78, intellect: 70, defense: 86, speed: 54, tactics: [], traits: ["tiebi"], baseTroops: 200, growth: 11, color: "#334155", accent: "#cbd5e1", enemyOnly: true },
  { id: "wangshuang", name: "王双", title: "流星锤", force: 90, intellect: 36, defense: 76, speed: 64, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 200, growth: 11, color: "#7f1d1d", accent: "#fecaca", enemyOnly: true },
  { id: "sunjian", name: "孙坚", title: "江东猛虎", force: 90, intellect: 62, defense: 80, speed: 68, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 205, growth: 11, color: "#0e7490", accent: "#a5f3fc", recruitable: true },
  { id: "sunce", name: "孙策", title: "小霸王", force: 94, intellect: 60, defense: 80, speed: 74, tactics: ["guwu"], traits: ["wushuang"], baseTroops: 210, growth: 12, color: "#0e7490", accent: "#fbbf24", recruitable: true, recruitHard: true },
  { id: "sunquan", name: "孙权", title: "吴大帝", force: 70, intellect: 78, defense: 78, speed: 58, tactics: ["huifu", "guwu"], traits: ["tongshuai"], baseTroops: 205, growth: 11, color: "#115e59", accent: "#5eead4", recruitable: true },
  { id: "zhouyu", name: "周瑜", title: "美周郎", force: 72, intellect: 96, defense: 78, speed: 70, tactics: ["huoji", "huifu", "guwu"], traits: ["zhisheng"], baseTroops: 190, growth: 10, color: "#0f766e", accent: "#fde68a", recruitable: true, recruitHard: true },
  { id: "lusu", name: "鲁肃", title: "江东大都督", force: 52, intellect: 92, defense: 70, speed: 60, tactics: ["huifu", "guwu"], traits: ["jizhi"], baseTroops: 175, growth: 9, color: "#0f766e", accent: "#99f6e4", recruitable: true },
  { id: "lvmeng", name: "吕蒙", title: "白衣渡江", force: 82, intellect: 84, defense: 78, speed: 66, tactics: ["huoji", "guwu"], traits: ["jizhi"], baseTroops: 195, growth: 10, color: "#115e59", accent: "#5eead4", recruitable: true },
  { id: "luxun", name: "陆逊", title: "火烧连营", force: 66, intellect: 95, defense: 76, speed: 68, tactics: ["huoji", "hunluan", "guwu"], traits: ["shendao"], baseTroops: 190, growth: 10, color: "#0f766e", accent: "#a7f3d0", recruitable: true, recruitHard: true },
  { id: "huanggai", name: "黄盖", title: "苦肉计", force: 86, intellect: 64, defense: 78, speed: 58, tactics: ["huoji"], traits: ["ganglie"], baseTroops: 190, growth: 10, color: "#9a3412", accent: "#fdba74", recruitable: true },
  { id: "chengpu", name: "程普", title: "江东老将", force: 84, intellect: 66, defense: 80, speed: 60, tactics: ["guwu"], traits: ["zhenjun"], baseTroops: 195, growth: 10, color: "#115e59", accent: "#ccfbf1", recruitable: true },
  { id: "handang", name: "韩当", title: "江东老将", force: 85, intellect: 52, defense: 76, speed: 64, tactics: ["guwu"], traits: ["xianfeng"], baseTroops: 190, growth: 10, color: "#0e7490", accent: "#cffafe", recruitable: true },
  { id: "zhoutai", name: "周泰", title: "身被数创", force: 88, intellect: 48, defense: 80, speed: 66, tactics: [], traits: ["ganglie"], baseTroops: 200, growth: 11, color: "#0f766e", accent: "#d1fae5", recruitable: true },
  { id: "lingtong", name: "凌统", title: "江东虎臣", force: 86, intellect: 54, defense: 74, speed: 72, tactics: ["guwu"], traits: ["huixin"], baseTroops: 190, growth: 10, color: "#115e59", accent: "#5eead4", recruitable: true },
  { id: "xusheng", name: "徐盛", title: "疑城退敌", force: 82, intellect: 64, defense: 76, speed: 62, tactics: [], traits: ["tiebi"], baseTroops: 185, growth: 10, color: "#0e7490", accent: "#a5f3fc", recruitable: true },
  { id: "dingfeng", name: "丁奉", title: "雪中奋短兵", force: 84, intellect: 66, defense: 76, speed: 70, tactics: ["guwu"], traits: ["shensu"], baseTroops: 185, growth: 10, color: "#155e75", accent: "#cffafe", recruitable: true },
  { id: "liru", name: "李儒", title: "董卓军师", force: 40, intellect: 90, defense: 58, speed: 56, tactics: ["huoji", "hunluan"], traits: ["shendao"], baseTroops: 160, growth: 9, color: "#3f1d38", accent: "#e9d5ff", enemyOnly: true },
  { id: "lijue", name: "李傕", title: "董卓部将", force: 84, intellect: 48, defense: 74, speed: 60, tactics: ["guwu"], baseTroops: 195, growth: 10, color: "#44403c", accent: "#d6d3d1", enemyOnly: true },
  { id: "guosi", name: "郭汜", title: "董卓部将", force: 82, intellect: 44, defense: 72, speed: 58, tactics: [], baseTroops: 190, growth: 10, color: "#57534e", accent: "#e7e5e4", enemyOnly: true },
  { id: "fanchou", name: "樊稠", title: "董卓部将", force: 80, intellect: 40, defense: 70, speed: 56, tactics: [], baseTroops: 185, growth: 10, color: "#44403c", accent: "#d6d3d1", enemyOnly: true },
  { id: "niufu", name: "牛辅", title: "董卓女婿", force: 76, intellect: 38, defense: 68, speed: 54, tactics: [], baseTroops: 180, growth: 9, color: "#57534e", accent: "#d6d3d1", enemyOnly: true },
  { id: "zhangji", name: "张济", title: "董卓部将", force: 80, intellect: 42, defense: 72, speed: 58, tactics: ["guwu"], baseTroops: 185, growth: 10, color: "#7c2d12", accent: "#fdba74", enemyOnly: true },
  { id: "shenpei", name: "审配", title: "河北名士", force: 62, intellect: 82, defense: 74, speed: 56, tactics: ["huifu", "guwu"], traits: ["zhenjun"], baseTroops: 185, growth: 10, color: "#4c1d95", accent: "#ddd6fe", enemyOnly: true },
  { id: "jushou", name: "沮授", title: "河北谋主", force: 54, intellect: 90, defense: 70, speed: 58, tactics: ["huoji", "huifu"], traits: ["shendao"], baseTroops: 170, growth: 9, color: "#5b21b6", accent: "#e9d5ff", enemyOnly: true },
  { id: "tianfeng", name: "田丰", title: "刚而犯上", force: 48, intellect: 92, defense: 66, speed: 54, tactics: ["huoji", "hunluan"], traits: ["jizhi"], baseTroops: 165, growth: 9, color: "#6b21a8", accent: "#d8b4fe", enemyOnly: true },
  { id: "chunyuqiong", name: "淳于琼", title: "乌巢守将", force: 76, intellect: 40, defense: 68, speed: 56, tactics: [], baseTroops: 190, growth: 10, color: "#7c2d12", accent: "#fde68a", enemyOnly: true },
  { id: "yuanshang", name: "袁尚", title: "河北公子", force: 74, intellect: 58, defense: 70, speed: 62, tactics: ["guwu"], baseTroops: 185, growth: 10, color: "#4c1d95", accent: "#ddd6fe", enemyOnly: true },
  { id: "yuanxi", name: "袁熙", title: "河北公子", force: 70, intellect: 56, defense: 68, speed: 60, tactics: [], baseTroops: 180, growth: 9, color: "#5b21b6", accent: "#e9d5ff", enemyOnly: true },
  { id: "yangfeng", name: "杨奉", title: "白波帅", force: 80, intellect: 46, defense: 70, speed: 64, tactics: ["guwu"], baseTroops: 185, growth: 10, color: "#78350f", accent: "#fde68a", enemyOnly: true },
  { id: "leibo", name: "雷薄", title: "袁术部将", force: 74, intellect: 38, defense: 66, speed: 56, tactics: [], baseTroops: 175, growth: 9, color: "#854d0e", accent: "#fef08a", enemyOnly: true },
  { id: "chenlan", name: "陈兰", title: "袁术部将", force: 72, intellect: 36, defense: 66, speed: 58, tactics: [], baseTroops: 175, growth: 9, color: "#92400e", accent: "#fde68a", enemyOnly: true },
  { id: "liuxun", name: "刘勋", title: "庐江太守", force: 76, intellect: 52, defense: 70, speed: 58, tactics: [], traits: ["tongshuai"], baseTroops: 180, growth: 10, color: "#78350f", accent: "#fcd34d", enemyOnly: true },
  { id: "zangba", name: "臧霸", title: "泰山寇", force: 86, intellect: 60, defense: 76, speed: 70, tactics: ["guwu"], traits: ["baizhan"], baseTroops: 195, growth: 10, color: "#4c1d95", accent: "#ddd6fe", recruitable: true },
  { id: "houcheng", name: "侯成", title: "吕布部将", force: 76, intellect: 40, defense: 68, speed: 58, tactics: [], baseTroops: 180, growth: 9, color: "#581c87", accent: "#d8b4fe", enemyOnly: true },
  { id: "weixu", name: "魏续", title: "吕布部将", force: 74, intellect: 38, defense: 66, speed: 56, tactics: [], baseTroops: 175, growth: 9, color: "#581c87", accent: "#d8b4fe", enemyOnly: true },
  { id: "songxian", name: "宋宪", title: "吕布部将", force: 74, intellect: 40, defense: 66, speed: 58, tactics: [], baseTroops: 175, growth: 9, color: "#6b21a8", accent: "#e9d5ff", enemyOnly: true },
  { id: "liubiao", name: "刘表", title: "荆州牧", force: 64, intellect: 76, defense: 78, speed: 52, tactics: ["huifu", "guwu"], traits: ["tongshuai"], baseTroops: 220, growth: 12, color: "#0f766e", accent: "#99f6e4", enemyOnly: true },
  { id: "wenpin", name: "文聘", title: "江夏守将", force: 84, intellect: 66, defense: 80, speed: 62, tactics: ["guwu"], traits: ["zhenjun"], baseTroops: 195, growth: 10, color: "#115e59", accent: "#ccfbf1", recruitable: true },
  { id: "kuaiyue", name: "蒯越", title: "荆州谋士", force: 46, intellect: 86, defense: 62, speed: 58, tactics: ["huoji", "hunluan"], traits: ["jizhi"], baseTroops: 165, growth: 9, color: "#0f766e", accent: "#a7f3d0", recruitable: true },
  { id: "wuyi", name: "吴懿", title: "益州将", force: 80, intellect: 56, defense: 74, speed: 62, tactics: ["guwu"], traits: ["tiebi"], baseTroops: 185, growth: 10, color: "#365314", accent: "#d9f99d", enemyOnly: true },
  { id: "liyan", name: "李严", title: "托孤大臣", force: 78, intellect: 80, defense: 76, speed: 58, tactics: ["huifu", "guwu"], traits: ["tongshuai"], baseTroops: 190, growth: 10, color: "#4d7c0f", accent: "#ecfccb", enemyOnly: true },
  { id: "mengda", name: "孟达", title: "反复之人", force: 80, intellect: 72, defense: 72, speed: 64, tactics: ["huoji"], traits: ["jizhi"], baseTroops: 185, growth: 10, color: "#3f6212", accent: "#bef264", enemyOnly: true },
  { id: "menghuo", name: "孟获", title: "南蛮王", force: 88, intellect: 40, defense: 82, speed: 60, tactics: ["guwu"], traits: ["mengjiang"], baseTroops: 215, growth: 12, color: "#7c2d12", accent: "#fdba74", enemyOnly: true },
  { id: "zhurong", name: "祝融", title: "蛮后", force: 82, intellect: 48, defense: 74, speed: 70, tactics: ["huoji"], traits: ["huixin"], baseTroops: 190, growth: 10, color: "#9a3412", accent: "#fdba74", enemyOnly: true },
  { id: "shamoke", name: "沙摩柯", title: "五溪蛮王", force: 86, intellect: 34, defense: 76, speed: 64, tactics: ["guwu"], baseTroops: 195, growth: 10, color: "#9a3412", accent: "#fca5a5", enemyOnly: true },
];

export const SAGA_GENERAL_BY_ID = new Map(SAGA_GENERALS.map((g) => [g.id, g]));

export const SAGA_STARTER_IDS = ["liubei", "guanyu", "zhangfei"] as const;

/**
 * 计策表：照《吞食天地2》原版口径做——习得等级与 SP 消耗尽量贴原表，
 * 只把超出 30 级的原版习得等级收拢到 30（封顶抬到 50 后，顶阶计策 30 级就能练满，
 * 后 20 级靠四维与兵力继续长）。
 * 威力按原版伤害比（炼火 100 / 业火 360 / 炎热 1000 / 大热 2500 / 火神 4000 一类）折成系数。
 *
 * 入门四计（炼火 / 赤心 / 疑心 / 鼓舞）沿用旧 id，旧战报里的指令仍能重放。
 */
export const SAGA_TACTICS: SagaTacticDef[] = [
  // 火系：原版 炼火2/业火4/炎热6/大热6/火神8，习得 1/11/20/34/40
  { id: "huoji", name: "炼火计", desc: "火计初阶，灼烧全体敌军", cost: 2, level: 1, kind: "fire", power: 1 },
  { id: "yehuo", name: "业火计", desc: "火势四倍，全体敌军重伤", cost: 4, level: 10, kind: "fire", power: 2.2 },
  { id: "yanre", name: "炎热计", desc: "烈焰覆阵，全体敌军大损", cost: 6, level: 18, kind: "fire", power: 4.4 },
  { id: "dare", name: "大热计", desc: "四面成火海，全体敌军重创", cost: 6, level: 25, kind: "fire", power: 8 },
  { id: "huoshen", name: "火神计", desc: "火神降世，火系最强一击", cost: 8, level: 30, kind: "fire", power: 14 },
  // 水系：原版 水途3/水星5/水雷6/洪水8/水龙10，习得 3/12/24/36/44
  { id: "shutu", name: "水途计", desc: "掘堤放水，冲散全体敌军", cost: 3, level: 3, kind: "water", power: 1 },
  { id: "shuixing", name: "水星计", desc: "水势暴涨，全体敌军受伤", cost: 5, level: 11, kind: "water", power: 2.4 },
  { id: "shuilei", name: "水雷计", desc: "聚流成雷，全体敌军大损", cost: 6, level: 18, kind: "water", power: 4.6 },
  { id: "hongshui", name: "洪水计", desc: "引来洪水，全军水没", cost: 8, level: 25, kind: "water", power: 8.6 },
  { id: "shuilong", name: "水龙计", desc: "水龙翻江，水系最强一击", cost: 10, level: 30, kind: "water", power: 14.5 },
  // 石系：原版 落木4/流木4/落石6/投石8/激石10，习得 15/26/37/47（收拢到 30）
  { id: "luomu", name: "落木计", desc: "滚木砸阵，单体受创", cost: 4, level: 5, kind: "rock", power: 1.2 },
  { id: "liushui", name: "流木计", desc: "乱木倾泻，单体重伤", cost: 4, level: 13, kind: "rock", power: 2.6 },
  { id: "luoshi", name: "落石计", desc: "巨石自崖顶砸下，单体重创", cost: 6, level: 20, kind: "rock", power: 5.2 },
  { id: "toushi", name: "投石计", desc: "投石车齐发，单体大损", cost: 8, level: 26, kind: "rock", power: 9 },
  { id: "jishi", name: "激石计", desc: "山石崩落，石系最强一击", cost: 10, level: 30, kind: "rock", power: 16 },
  // 回复系：原版 赤心2/铜仙4/银仙6/完复8/金仙4，习得 2/17/28/38/46
  { id: "huifu", name: "赤心计", desc: "为兵力最少的友军回兵", cost: 2, level: 1, kind: "heal", power: 1 },
  { id: "tongxian", name: "铜仙计", desc: "为兵力最少的友军回一批兵", cost: 4, level: 12, kind: "heal", power: 4 },
  { id: "yinxian", name: "银仙计", desc: "为兵力最少的友军回大量兵", cost: 6, level: 20, kind: "heal", power: 10 },
  { id: "wanfu", name: "完复计", desc: "一名友军兵力几乎回满", cost: 8, level: 26, kind: "heal", power: 25 },
  { id: "jinxian", name: "金仙计", desc: "全队一起回兵（原版 SP 反而低）", cost: 4, level: 29, kind: "healAll", power: 6 },
  // 特殊系：原版 疑心6/缚杀12/陷阱12/解阵16/暗杀16
  { id: "hunluan", name: "疑心计", desc: "令一名敌将生疑，2 回合不能行动", cost: 6, level: 8, kind: "confuse", turns: 2 },
  { id: "fusha", name: "缚杀计", desc: "以术缚住敌将，3 回合不能行动", cost: 12, level: 22, kind: "confuse", turns: 3 },
  { id: "xianjing", name: "陷阱计", desc: "诱敌入坑，削掉目标当前四成兵力", cost: 12, level: 25, kind: "trap", power: 0.4 },
  { id: "jiezhen", name: "解阵计", desc: "破去敌军阵形，打回散开", cost: 10, level: 29, kind: "break" },
  { id: "ansha", name: "暗杀计", desc: "直接取一名敌将性命，成算不高", cost: 10, level: 28, kind: "assassin" },
  { id: "guwu", name: "鼓舞", desc: "全队攻击提升 3 回合", cost: 2, level: 3, kind: "buff" },
  // 辅助计：原版里的免击 / 免策 / 招魂 / 心乱，补成四支可实战的策。
  { id: "mianji", name: "免击计", desc: "一队友军 2 回合内不受普攻伤害", cost: 8, level: 20, kind: "ward", turns: 2 },
  { id: "miance", name: "免策计", desc: "一队友军 2 回合内不受攻击计策伤害", cost: 10, level: 28, kind: "wardTactic", turns: 2 },
  { id: "zhaohun", name: "招魂计", desc: "唤回一名败退友军，以三成兵力归队", cost: 12, level: 36, kind: "revive" },
  { id: "xinluan", name: "心乱计", desc: "扰乱敌将心神，削去 30 点策略值", cost: 6, level: 40, kind: "drain", power: 30 },
];

export const SAGA_TACTIC_BY_ID = new Map(SAGA_TACTICS.map((t) => [t.id, t]));

/**
 * 阵形表：按《吞食天地2》原版十阵重排——散开 / 鹤翼6 / 冲方10 / 白马16 / 鱼鳞21 / 锋矢27 /
 * 一字37 / 背水43 / 静寂45 / 八卦48。原版的站位差异（两端攻击衰减、生门死门）在本作里
 * 收成队级攻防速修正，保证七人队伍也能直观感到阵形强弱；静寂另带「不能回复」。
 * 旧版自拟的方圆 / 长蛇 / 雁行 / 衡轭 / 车悬 / 八门保留为 legacy，只供老存档与老战报重放。
 */
export const SAGA_FORMATIONS: SagaFormationDef[] = [
  { id: "sankai", name: "散开", desc: "不设阵势，攻防速均无增减", atk: 100, def: 100, spd: 100, beats: "sankai", level: 0, cost: 0 },
  { id: "heyi", name: "鹤翼", desc: "两翼张开：攻击 +10%，防御 -10%", atk: 110, def: 90, spd: 105, beats: "fengshi", level: 0, cost: 2 },
  { id: "chongfang", name: "冲方", desc: "正面硬冲：攻击 +20%，防御 +15%，速度 -30%", atk: 120, def: 115, spd: 70, beats: "yulin", level: 10, cost: 3 },
  { id: "baima", name: "白马", desc: "轻骑疾进：速度 +30%，克冲方", atk: 100, def: 100, spd: 130, beats: "chongfang", level: 16, cost: 3 },
  { id: "yulin", name: "鱼鳞", desc: "层层叠阵：攻击 +15%，防御 -5%", atk: 115, def: 95, spd: 100, beats: "heyi", level: 0, cost: 1 },
  { id: "fengshi", name: "锋矢", desc: "锐锋直进：攻击 +25%，防御 -15%", atk: 125, def: 85, spd: 105, beats: "yizi", level: 0, cost: 2 },
  { id: "yizi", name: "一字", desc: "横列展开：攻击 +15%，速度 +15%，防御 -20%", atk: 115, def: 80, spd: 115, beats: "fengshi", level: 37, cost: 6 },
  { id: "beishui", name: "背水", desc: "置之死地：攻击 +45%，防御 -50%，速度 +10%", atk: 145, def: 50, spd: 110, beats: "bagua", level: 43, cost: 8 },
  { id: "jingji", name: "静寂", desc: "全员隐伏：防御 +40%，敌军命中下降，但不能用回复计", atk: 95, def: 140, spd: 105, beats: "baima", level: 45, cost: 10, noHeal: true },
  { id: "bagua", name: "八卦", desc: "生门死门：攻击 +15%，防御 +30%，速度 -5%", atk: 115, def: 130, spd: 95, beats: "heyi", level: 48, cost: 12 },
  // 旧版自拟阵：保留定义供老存档、老战报与旧测试解析，变阵菜单里不再列出。
  { id: "fangyuan", name: "方圆", desc: "旧阵：防御 +25%，速度 -10%", atk: 90, def: 125, spd: 90, beats: "changshe", level: 0, cost: 2, legacy: true },
  { id: "changshe", name: "长蛇", desc: "旧阵：速度 +25%，防御 -10%", atk: 100, def: 90, spd: 125, beats: "yulin", level: 0, cost: 2, legacy: true },
  { id: "yanxing", name: "雁行", desc: "旧阵：攻击 +8%，防御 +2%，速度 +12%", atk: 108, def: 102, spd: 112, beats: "yulin", level: 6, cost: 3, legacy: true },
  { id: "hengzhe", name: "衡轭", desc: "旧阵：攻击 +18%，防御 +5%，速度 -8%", atk: 118, def: 105, spd: 92, beats: "fengshi", level: 10, cost: 4, legacy: true },
  { id: "chexuan", name: "车悬", desc: "旧阵：攻击 +22%，防御 -8%，速度 +18%", atk: 122, def: 92, spd: 118, beats: "changshe", level: 16, cost: 4, legacy: true },
  { id: "bamen", name: "八门", desc: "旧阵：攻击 -5%，防御 +30%，速度 -15%", atk: 95, def: 130, spd: 85, beats: "heyi", level: 27, cost: 8, legacy: true },
];

export const SAGA_FORMATION_BY_ID = new Map(SAGA_FORMATIONS.map((f) => [f.id, f]));

/** 计策是否已练到：入门计策（level 0）永远可用。 */
export function tacticUnlocked(tactic: TacticId, level: number): boolean {
  const def = SAGA_TACTIC_BY_ID.get(tactic);
  return !def || level >= def.level;
}

/** 阵形是否已解锁：按队伍里练得最高的那位算。 */
export function formationUnlocked(formation: FormationId, maxLevel: number): boolean {
  const def = SAGA_FORMATION_BY_ID.get(formation);
  return !def || maxLevel >= def.level;
}

export const SAGA_ITEMS: SagaItemDef[] = [
  // 兵器：剑 / 斧 / 枪 / 弓 / 刀 / 戟分开，武将只会使其中几类。
  { id: "iron_sword", name: "铁剑", kind: "weapon", priceTickets: 1, atk: 8, weaponType: "sword", chapter: 0, desc: "攻击 +8" },
  { id: "spear", name: "长枪", kind: "weapon", priceTickets: 2, atk: 14, weaponType: "spear", chapter: 0, desc: "攻击 +14" },
  { id: "blade", name: "大刀", kind: "weapon", priceTickets: 3, atk: 20, weaponType: "blade", chapter: 0, desc: "攻击 +20" },
  { id: "guandao", name: "偃月刀", kind: "weapon", priceTickets: 5, atk: 27, weaponType: "blade", chapter: 1, desc: "攻击 +27" },
  { id: "huan_shou", name: "环首刀", kind: "weapon", priceTickets: 7, atk: 34, weaponType: "sword", chapter: 2, desc: "攻击 +34" },
  { id: "shuangji", name: "双戟", kind: "weapon", priceTickets: 8, atk: 40, weaponType: "axe", chapter: 3, desc: "攻击 +40" },
  { id: "dafu", name: "大斧", kind: "weapon", priceTickets: 9, atk: 48, weaponType: "axe", chapter: 3, desc: "攻击 +48" },
  { id: "qinglong", name: "青龙偃月刀", kind: "weapon", priceTickets: 12, atk: 58, weaponType: "blade", chapter: 4, desc: "攻击 +58，关将军的成名之器" },
  { id: "zhangba_shemao", name: "丈八蛇矛", kind: "weapon", priceTickets: 12, atk: 56, weaponType: "spear", chapter: 4, desc: "攻击 +56，燕人手中那条蛇" },
  { id: "yitian", name: "倚天剑", kind: "weapon", priceTickets: 11, atk: 52, weaponType: "sword", chapter: 5, desc: "攻击 +52，剑长三尺，锋芒照人" },
  { id: "fangtian", name: "方天画戟", kind: "weapon", priceTickets: 14, atk: 64, weaponType: "halberd", chapter: 5, desc: "攻击 +64，温侯的招牌" },
  { id: "crescent_bow", name: "半月弓", kind: "weapon", priceTickets: 10, atk: 44, weaponType: "bow", chapter: 3, desc: "攻击 +44，远射之器" },
  // 甲胄：胸甲一系。
  { id: "cloth", name: "布甲", kind: "armor", priceTickets: 1, def: 6, chapter: 0, desc: "防御 +6" },
  { id: "leather", name: "皮甲", kind: "armor", priceTickets: 2, def: 11, chapter: 0, desc: "防御 +11" },
  { id: "iron_armor", name: "铁甲", kind: "armor", priceTickets: 3, def: 17, chapter: 1, desc: "防御 +17" },
  { id: "heavy_armor", name: "重铠", kind: "armor", priceTickets: 5, def: 23, chapter: 2, desc: "防御 +23" },
  { id: "yulinjia", name: "鱼鳞甲", kind: "armor", priceTickets: 7, def: 30, chapter: 3, desc: "防御 +30" },
  { id: "mingguang", name: "明光铠", kind: "armor", priceTickets: 9, def: 38, chapter: 4, desc: "防御 +38" },
  { id: "shoumian", name: "兽面吞头铠", kind: "armor", priceTickets: 12, def: 46, chapter: 5, desc: "防御 +46" },
  // 盔 / 腰带 / 吊坠 / 靴：各占一个槽，后城卖得更好。
  { id: "cloth_helm", name: "布盔", kind: "helmet", priceTickets: 1, def: 3, chapter: 0, desc: "防御 +3" },
  { id: "iron_helm", name: "铁盔", kind: "helmet", priceTickets: 3, def: 7, chapter: 1, desc: "防御 +7" },
  { id: "silver_helm", name: "银盔", kind: "helmet", priceTickets: 6, def: 12, chapter: 3, desc: "防御 +12" },
  { id: "gold_helm", name: "金盔", kind: "helmet", priceTickets: 10, def: 18, chapter: 5, desc: "防御 +18" },
  { id: "leather_belt", name: "皮带", kind: "belt", priceTickets: 1, def: 2, chapter: 0, desc: "防御 +2" },
  { id: "bronze_belt", name: "铜带", kind: "belt", priceTickets: 4, def: 5, chapter: 2, desc: "防御 +5" },
  { id: "jade_belt", name: "玉带", kind: "belt", priceTickets: 9, def: 10, chapter: 5, desc: "防御 +10" },
  { id: "jade_pendant", name: "玉佩", kind: "pendant", priceTickets: 2, def: 1, speed: 1, chapter: 0, desc: "防御 +1，速度 +1" },
  { id: "tiger_pendant", name: "虎符坠", kind: "pendant", priceTickets: 7, def: 4, speed: 2, chapter: 3, desc: "防御 +4，速度 +2" },
  { id: "straw_boots", name: "草鞋", kind: "boots", priceTickets: 1, speed: 1, chapter: 0, desc: "速度 +1" },
  { id: "leather_boots", name: "皮靴", kind: "boots", priceTickets: 3, speed: 2, chapter: 1, desc: "速度 +2" },
  { id: "cloud_boots", name: "云靴", kind: "boots", priceTickets: 8, speed: 4, chapter: 4, desc: "速度 +4" },
  // 名马：只加小额速度，不抢兵器的主导地位。
  { id: "white_horse", name: "白马", kind: "mount", priceTickets: 3, speed: 2, chapter: 1, desc: "速度 +2" },
  { id: "dilu", name: "的卢", kind: "mount", priceTickets: 6, speed: 3, chapter: 2, desc: "速度 +3，越涧如飞" },
  { id: "jueying", name: "绝影", kind: "mount", priceTickets: 9, speed: 4, chapter: 3, desc: "速度 +4，奔逸绝尘" },
  { id: "zhuahuang", name: "爪黄飞电", kind: "mount", priceTickets: 11, speed: 4, chapter: 4, desc: "速度 +4，御驾之名驹" },
  { id: "chitu", name: "赤兔", kind: "mount", priceTickets: 15, speed: 6, chapter: 5, desc: "速度 +6，日行千里" },
  // 药品：新增可随身携带的复活丹，药铺与军需都有售。
  { id: "herb", name: "伤药", kind: "consumable", priceTickets: 1, heal: 120, chapter: 0, desc: "回复 120 兵力", stack: true },
  { id: "medicine", name: "良药", kind: "consumable", priceTickets: 2, heal: 300, chapter: 0, desc: "回复 300 兵力", stack: true },
  { id: "jinchuang", name: "金疮药", kind: "consumable", priceTickets: 3, heal: 600, chapter: 1, desc: "回复 600 兵力", stack: true },
  { id: "qingxin", name: "清心散", kind: "consumable", priceTickets: 2, heal: 220, chapter: 1, desc: "回复 220 兵力，行军途中安神", stack: true },
  { id: "dahuan", name: "大还丹", kind: "consumable", priceTickets: 5, heal: 1200, chapter: 2, desc: "回复 1200 兵力", stack: true },
  { id: "junliang", name: "军粮", kind: "consumable", priceTickets: 2, heal: 400, chapter: 0, desc: "回复 400 兵力，随军携带的干粮", stack: true },
  { id: "lingzhi", name: "灵芝", kind: "consumable", priceTickets: 4, heal: 900, chapter: 2, desc: "回复 900 兵力，山中所采的灵药", stack: true },
  { id: "zhaohun_dan", name: "招魂丹", kind: "consumable", priceTickets: 4, revive: 0.3, chapter: 0, desc: "复活一名败将，回三成兵力", stack: true },
  { id: "huihun_dan", name: "回魂丹", kind: "consumable", priceTickets: 8, revive: 0.5, chapter: 4, desc: "复活一名败将，回五成兵力", stack: true },
  // 军需：只在本次行军生效的补给。
  { id: "secret_medicine", name: "秘药", kind: "supply", priceTickets: 1, supply: "heal", desc: "此行：一名武将兵力回满", stack: true },
  { id: "revive_token", name: "兵符", kind: "supply", priceTickets: 2, supply: "revive", desc: "此行：复活一名败将（四成兵力）", stack: true },
  { id: "tiger_tally", name: "虎符", kind: "supply", priceTickets: 2, supply: "troops", desc: "此行：全队兵力上限 +10%" },
  { id: "wind_talisman", name: "风行符", kind: "supply", priceTickets: 1, supply: "speed", desc: "此行：全队速度 +3" },
  { id: "war_drum", name: "战鼓", kind: "supply", priceTickets: 2, supply: "attack", desc: "此行：全队攻击 +15%" },
  { id: "stratagem", name: "锦囊", kind: "supply", priceTickets: 1, supply: "tactic", desc: "此行：每名武将开局计策点 +2" },
];

export const SAGA_ITEM_BY_ID = new Map(SAGA_ITEMS.map((i) => [i.id, i]));

/** 一只手的兵器谱：按武将 id 给出会使的兵器，未列的按剑。 */
const SAGA_ARMS_BY_ID: Record<string, WeaponType[]> = {
  liubei: ["sword"],
  guanyu: ["blade"],
  zhangfei: ["spear"],
  zhaoyun: ["spear"],
  huangzhong: ["bow", "blade"],
  machao: ["spear"],
  weiyan: ["blade"],
  pangtong: ["sword"],
  fazheng: ["sword"],
  yanyan: ["blade"],
  zhangren: ["spear"],
  taishici: ["spear", "bow"],
  ganning: ["blade"],
  lvbu: ["halberd"],
  caocao: ["sword"],
  xiahoudun: ["spear"],
  xiahouyuan: ["bow"],
  caoren: ["blade"],
  dianwei: ["axe"],
  xuchu: ["axe"],
  xuhuang: ["axe"],
  zhangliao: ["halberd"],
  sunce: ["spear"],
  sunquan: ["sword"],
  zhouyu: ["sword"],
  huanggai: ["blade"],
  luxun: ["sword"],
  simayi: ["sword"],
  jiangwei: ["spear"],
  dengai: ["spear"],
  wenchou: ["spear"],
  yanliang: ["blade"],
  huaxiong: ["blade"],
  dongzhuo: ["sword"],
  yuanshao: ["sword"],
  yuanshu: ["sword"],
  gongsunzan: ["spear"],
  madai: ["spear"],
  guanping: ["blade"],
  guanxing: ["blade"],
  zhangbao: ["spear"],
  zhugedan: ["sword"],
  mengda: ["sword"],
  liuzhang: ["sword"],
  liubiao: ["sword"],
  zhangjiao: ["sword"],
  zhangliang: ["sword"],
  chengyuanzhi: ["sword"],
  dengmao: ["spear"],
  lisu: ["sword"],
  huzhen: ["sword"],
  caobao: ["sword"],
  chezhou: ["sword"],
  gaolan: ["spear"],
  caimao: ["sword"],
  zhangyun: ["spear"],
  liukui: ["sword"],
  lengbao: ["spear"],
  caohong: ["blade"],
  guohuai: ["halberd"],
  sunli: ["sword"],
  jiling: ["sword"],
  qiaorui: ["sword"],
  zhangxun: ["spear"],
  gaoshun: ["spear"],
  chengong: ["sword"],
  caoxing: ["sword"],
  wangping: ["spear"],
  liaohua: ["spear"],
  zhoucang: ["blade"],
  guanhai: ["blade"],
  peiyuanshao: ["sword"],
  yujin: ["spear"],
  yuejin: ["spear"],
  lidian: ["spear"],
  pangde: ["spear", "blade"],
  zhangxiu: ["spear"],
  caozhen: ["halberd"],
  guojia: ["sword"],
  xunyu: ["sword"],
  zhonghui: ["sword"],
  haozhao: ["sword"],
  wangshuang: ["halberd"],
  sunjian: ["blade"],
  lusu: ["sword"],
  lvmeng: ["blade"],
  chengpu: ["spear"],
  handang: ["blade"],
  zhoutai: ["blade"],
  lingtong: ["blade"],
  xusheng: ["blade"],
  dingfeng: ["blade"],
  liru: ["sword"],
  lijue: ["spear"],
  guosi: ["spear"],
  fanchou: ["spear"],
  niufu: ["axe"],
  zhangji: ["spear"],
  shenpei: ["sword"],
  jushou: ["sword"],
  tianfeng: ["sword"],
  chunyuqiong: ["spear"],
  yuanshang: ["sword"],
  yuanxi: ["sword"],
  yangfeng: ["spear"],
  leibo: ["spear"],
  chenlan: ["spear"],
  liuxun: ["sword"],
  zangba: ["spear"],
  houcheng: ["spear"],
  weixu: ["spear"],
  songxian: ["spear"],
  wenpin: ["spear"],
  kuaiyue: ["sword"],
};

/** 武将会使的兵器；没有专门配置的按剑算。 */
export function weaponTypesFor(def: SagaGeneralDef | undefined): WeaponType[] {
  if (!def) return ["sword"];
  return def.arms ?? SAGA_ARMS_BY_ID[def.id] ?? ["sword"];
}

/** 装备类物品的槽位；消耗品与军需返回 null。 */
export function gearSlotOf(item: SagaItemDef | undefined): GearSlot | null {
  if (!item) return null;
  if (item.slot) return item.slot;
  if (item.kind === "weapon" || item.kind === "armor" || item.kind === "helmet" || item.kind === "belt"
    || item.kind === "pendant" || item.kind === "boots" || item.kind === "mount") {
    return item.kind;
  }
  return null;
}

/** 店铺上架：按当前章节只放已到年份的货，后面的城自然卖得更好。 */
export function shopStock(kind: SagaItemKind, chapter: number): SagaItemDef[] {
  return SAGA_ITEMS.filter((item) => item.kind === kind && (item.chapter ?? 0) <= chapter);
}

/**
 * 智将随等级领悟计策：基础计策 + 已到等级的领悟计策，
 * 并统一按计策表里的领悟等级再滤一次（没练到等级的高级计策不会提前出现）。
 */
/**
 * 计策谱：照吞食天地那套「智力够、等级到就领悟」的规矩。
 * 智力决定能摸到哪几阶的计策，具体哪一级会，看计策表里的 `level`。
 */
const TACTIC_LINES: { id: TacticId; intellect: number }[] = [
  { id: "huoji", intellect: 55 },
  { id: "yehuo", intellect: 70 },
  { id: "yanre", intellect: 82 },
  { id: "dare", intellect: 91 },
  { id: "huoshen", intellect: 97 },
  { id: "shutu", intellect: 66 },
  { id: "shuixing", intellect: 76 },
  { id: "shuilei", intellect: 86 },
  { id: "hongshui", intellect: 93 },
  { id: "shuilong", intellect: 98 },
  { id: "luomu", intellect: 58 },
  { id: "liushui", intellect: 71 },
  { id: "luoshi", intellect: 81 },
  { id: "toushi", intellect: 89 },
  { id: "jishi", intellect: 96 },
  { id: "huifu", intellect: 62 },
  { id: "tongxian", intellect: 74 },
  { id: "yinxian", intellect: 84 },
  { id: "wanfu", intellect: 91 },
  { id: "jinxian", intellect: 96 },
  { id: "hunluan", intellect: 70 },
  { id: "fusha", intellect: 86 },
  { id: "xianjing", intellect: 92 },
  { id: "mianji", intellect: 76 },
  { id: "miance", intellect: 86 },
  { id: "zhaohun", intellect: 92 },
  { id: "xinluan", intellect: 88 },
];

/** 一名武将同时能记的计策上限：够装下所有已解锁的阶数，不再为省位砍掉低阶。 */
const TACTIC_MEMORY_CAP = 30;
const TACTIC_FAMILY_ORDER = ["fire", "water", "rock", "heal", "confuse", "trap", "ward", "wardTactic", "revive", "drain"] as const;

export function tacticsFor(def: SagaGeneralDef | undefined, level: number): TacticId[] {
  if (!def) return [];
  const learned = (def.learn ?? [])
    .filter((entry) => level >= entry.level)
    .map((entry) => entry.tactic);
  const byIntellect: TacticId[] = [];
  for (const family of TACTIC_FAMILY_ORDER) {
    // 同系各阶威力随等级不同，全部列出（按消耗从高到低），不再只留最强的两条。
    const picks = TACTIC_LINES.filter((line) => {
      const kind = SAGA_TACTIC_BY_ID.get(line.id)?.kind;
      return kind === family && def.intellect >= line.intellect;
    })
      .map((line) => line.id)
      .filter((id) => tacticUnlocked(id, level))
      .sort((a, b) => (SAGA_TACTIC_BY_ID.get(b)?.cost ?? 0) - (SAGA_TACTIC_BY_ID.get(a)?.cost ?? 0));
    byIntellect.push(...picks);
  }
  const all = [...new Set([...def.tactics, ...learned, ...byIntellect])].filter((id) => tacticUnlocked(id, level));
  return all.slice(0, TACTIC_MEMORY_CAP);
}

/** 特性带来的四维加成；战斗伤害里的暴击 / 追击另算。 */
export function traitStats(def: SagaGeneralDef | undefined): {
  force: number;
  intellect: number;
  defense: number;
  speed: number;
} {
  const stats = { force: 0, intellect: 0, defense: 0, speed: 0 };
  for (const id of def?.traits ?? []) {
    const trait = SAGA_TRAIT_BY_ID.get(id);
    if (!trait) continue;
    stats.force += trait.force ?? 0;
    stats.intellect += trait.intellect ?? 0;
    stats.defense += trait.defense ?? 0;
    stats.speed += trait.speed ?? 0;
  }
  return stats;
}

export const SAGA_CHAPTERS: SagaChapterDef[] = [
  {
    index: 0,
    name: "桃园起兵",
    subtitle: "讨伐黄巾",
    town: "涿郡",
    blurb: "黄巾四起，涿郡募兵。桃园三人带着乡勇出城，先破黄巾前哨。",
    story: [
      "汉室倾颓，黄巾席卷八州，涿郡张榜募兵。",
      "刘关张桃园结义，聚乡勇五百，首战程远志、邓茂。",
      "广宗城下会战张角，破了黄巾本阵，讨逆之路从这里开始。",
    ],
    stages: ["涿郡郊外", "黄巾哨营", "青州道口", "长社坡", "阳城驿", "广宗城下", "黄巾本阵"],
    landmarks: ["楼桑村", "三义庙", "拒马河渡"],
    terrain: "plain",
    field: ["chengyuanzhi", "dengmao", "huangjin_lishi", "zhangbao", "guanhai", "peiyuanshao", "zhoucang", "liaohua"],
    elite: ["zhangbao", "zhangliang", "guanhai"],
    boss: "zhangjiao",
    guards: ["zhangbao", "zhangliang", "guanhai"],
    branch: {
      a: {
        name: "楼桑村·护乡邻",
        blurb: "黄巾溃兵围了楼桑村，乡邻还在里面。护住他们，涿郡人心才归你。",
        pool: ["peiyuanshao", "zhoucang"],
        bonus: "gold",
      },
      b: {
        name: "涿郡道·截粮车",
        blurb: "张角的粮车夜里过涿郡道，车上粮食够黄巾吃半月。",
        pool: ["guanhai", "liaohua"],
        bonus: "exp",
      },
    },
    unlock: null,
  },
  {
    index: 1,
    name: "汜水关",
    subtitle: "讨伐董卓",
    town: "陈留",
    blurb: "诸侯会盟，兵进汜水。华雄连斩数将，关外战鼓震天。",
    story: [
      "董卓入京，废立天子，天下震动。",
      "曹操发檄，诸侯会盟，孙坚为先锋直逼汜水关。",
      "华雄连斩数将，关羽温酒斩之，联军进抵洛阳。",
    ],
    stages: ["陈留城外", "汜水关前", "虎牢关道", "荥阳坂", "偃师古道", "洛阳郊野", "洛阳宫阙"],
    landmarks: ["枯井村", "关帝庙", "汜水渡"],
    terrain: "mountain",
    field: ["lisu", "huzhen", "huaxiong", "liru", "lijue", "guosi", "fanchou", "niufu", "zhangji"],
    elite: ["huaxiong", "huzhen", "lijue"],
    boss: "dongzhuo",
    guards: ["lvbu", "huaxiong", "lijue", "guosi"],
    branch: {
      a: {
        name: "汜水关前·救盟军",
        blurb: "华雄趁夜袭盟军粮营，营里还有几十个受伤的盟军士卒。",
        pool: ["fanchou", "niufu"],
        bonus: "gold",
      },
      b: {
        name: "虎牢侧道·夺马",
        blurb: "西凉军马队在虎牢关侧道歇脚，夺了马，明日阵前就快人一步。",
        pool: ["lijue", "zhangji"],
        bonus: "exp",
      },
    },
    unlock: null,
  },
  {
    index: 2,
    name: "徐州风云",
    subtitle: "讨伐袁术",
    town: "小沛",
    blurb: "陶谦让徐州，袁术称帝来争。小沛城小兵少，只能以战养战。",
    story: [
      "曹操为父报仇兴兵徐州，刘备借兵救陶谦。",
      "陶谦三让徐州，刘备领徐州牧；袁术遣纪灵来争，辕门射戟。",
      "袁术称帝，众叛亲离，终败于江亭；赵云在古城来投。",
    ],
    stages: ["小沛城郊", "盱眙道口", "纪灵营寨", "淮北平原", "寿春城下", "江亭渡口", "仲家宫阙"],
    landmarks: ["彭城集", "子房庙", "泗水渡"],
    terrain: "forest",
    field: ["jiling", "qiaorui", "zhangxun", "caobao", "yangfeng", "leibo", "chenlan", "liuxun"],
    elite: ["jiling", "qiaorui", "yangfeng"],
    boss: "yuanshu",
    guards: ["jiling", "zhangxun", "yangfeng"],
    branch: {
      a: {
        name: "郯城野·收流民",
        blurb: "袁术的兵在郯城外抢粮，流民堵在道上哭。护住他们，徐州才认你这个主。",
        pool: ["leibo", "chenlan"],
        bonus: "gold",
      },
      b: {
        name: "淮水渡·烧舟",
        blurb: "袁术的粮舟泊在淮水渡口，一把火烧了，前线的兵就得饿三天。",
        pool: ["yangfeng", "liuxun"],
        bonus: "exp",
      },
    },
    unlock: "zhaoyun",
  },
  {
    index: 3,
    name: "白门楼",
    subtitle: "讨伐吕布",
    town: "下邳",
    blurb: "吕布袭取徐州，曹操亲征下邳。水淹城池，温侯困守白门楼。",
    story: [
      "吕布袭取徐州，与袁术时和时战。",
      "曹操亲征下邳，引沂泗之水灌城，吕布困守白门楼。",
      "陈宫就义，高顺不屈；吕布殒命，张辽归心。",
    ],
    stages: ["徐州城外", "泗水渡口", "下邳道", "陷阵大营", "白门楼前", "水淹城垣", "温侯本阵"],
    landmarks: ["白门里", "泗水祠", "下邳渡"],
    terrain: "river",
    field: ["gaoshun", "zhangliao", "chengong", "caoxing", "zangba", "houcheng", "weixu", "songxian"],
    elite: ["gaoshun", "zhangliao", "zangba"],
    boss: "lvbu",
    guards: ["gaoshun", "zhangliao", "zangba"],
    branch: {
      a: {
        name: "下邳巷·清残部",
        blurb: "吕布败了，残部还缩在下邳巷子里抢掠百姓。清干净，才算真拿下此城。",
        pool: ["houcheng", "weixu"],
        bonus: "gold",
      },
      b: {
        name: "白门楼外·截马",
        blurb: "并州铁骑趁乱往北跑，拦下这批人马，正好补进自家骑队。",
        pool: ["songxian", "zangba"],
        bonus: "exp",
      },
    },
    unlock: "zhangliao",
  },
  {
    index: 4,
    name: "官渡之战",
    subtitle: "河北争锋",
    town: "延津",
    blurb: "袁绍兵多粮足，颜良文丑当先。延津渡口，一场硬仗。",
    story: [
      "袁绍并河北四州，南下攻许都。",
      "白马延津，关羽斩颜良、诛文丑。",
      "曹操夜袭乌巢，一把火烧尽河北粮草；刘备南走荆州，三顾茅庐。",
    ],
    stages: ["延津渡口", "白马坡", "延津南岸", "乌巢粮道", "官渡壁垒", "黎阳古道", "邺城本阵"],
    landmarks: ["乌巢村", "官渡祠", "延津渡"],
    terrain: "plain",
    field: ["yanliang", "wenchou", "gaolan", "zhanghe", "shenpei", "jushou", "tianfeng", "chunyuqiong", "yuanshang", "yuanxi"],
    elite: ["yanliang", "wenchou", "chunyuqiong"],
    boss: "yuanshao",
    guards: ["zhanghe", "gaolan", "chunyuqiong"],
    branch: {
      a: {
        name: "乌巢北·护粮",
        blurb: "袁军游骑摸到乌巢北面，淳于琼的粮囤还没烧完，护住一处是一处。",
        pool: ["chunyuqiong", "yuanshang"],
        bonus: "gold",
      },
      b: {
        name: "延津道·焚粮",
        blurb: "袁绍的第二批粮车正在延津道上，田丰派了人接应——烧不烧得掉，就看这一趟。",
        pool: ["tianfeng", "jushou"],
        bonus: "exp",
      },
    },
    unlock: "zhugeliang",
  },
  {
    index: 5,
    name: "赤壁之战",
    subtitle: "孙刘联军",
    town: "江夏",
    blurb: "曹军南下，江夏整军。水寨连舟，火计可破百万兵。",
    story: [
      "曹操挟八十三万之众饮马长江。",
      "孙刘结盟，周瑜督水军，黄盖献诈降火船。",
      "东南风起，赤壁烈焰烧尽连环船，曹军北还。",
    ],
    stages: ["江夏水寨", "三江口", "赤壁矶", "乌林港", "华容道", "南郡城郊", "荆襄大营"],
    landmarks: ["赤壁村", "东风祠", "三江口渡"],
    terrain: "river",
    field: ["caimao", "zhangyun", "caoren", "xiahouyuan", "yujin", "yuejin", "lidian", "xuchu", "dianwei", "pangde", "zhangxiu", "guojia", "xunyu", "wenpin", "kuaiyue", "liubiao", "sunjian", "sunce", "sunquan", "zhouyu", "lusu", "lvmeng", "luxun", "huanggai", "chengpu", "handang", "zhoutai", "lingtong", "xusheng", "dingfeng"],
    elite: ["caimao", "zhangyun", "xuchu", "huanggai"],
    boss: "caocao",
    guards: ["caoren", "xuhuang", "xuchu"],
    branch: {
      a: {
        name: "乌林滩·护船",
        blurb: "江上起了南风，吴军火船还没到位，先护住自己这边的战船。",
        pool: ["wenpin", "kuaiyue"],
        bonus: "gold",
      },
      b: {
        name: "华容道·截骑",
        blurb: "曹军轻骑从华容小道撤，道上泥深——拦住他们，能捡一批好马好甲。",
        pool: ["pangde", "zhangxiu"],
        bonus: "exp",
      },
    },
    unlock: "huangzhong",
  },
  {
    index: 6,
    name: "入蜀之路",
    subtitle: "西川归心",
    town: "涪城",
    blurb: "西川险道，张任严颜扼守。取涪城，方可图成都。",
    story: [
      "刘璋暗弱，张松献西川图本。",
      "刘备入川，涪城会盟后反目；雒城折了庞统。",
      "孔明张飞入援，成都开城，西川归心。",
    ],
    stages: ["涪城道", "雒城关", "绵竹隘", "巴郡江岸", "葭萌关", "成都郊外", "成都宫门"],
    landmarks: ["落凤坡", "涪水祠", "雒城渡"],
    terrain: "mountain",
    field: ["liukui", "lengbao", "zhangren", "yanyan", "wuyi", "liyan", "mengda", "shamoke"],
    elite: ["zhangren", "yanyan", "wuyi"],
    boss: "liuzhang",
    guards: ["zhangren", "yanyan", "wuyi"],
    branch: {
      a: {
        name: "葭萌关·护民",
        blurb: "李严的兵在葭萌关下拉夫征粮，百姓躲进山里。把关口护住，西川人心才稳。",
        pool: ["liyan", "wuyi"],
        bonus: "gold",
      },
      b: {
        name: "雒城道·劫粮",
        blurb: "雒城的军粮正沿山道往成都运，孟达押车。截下来，成都就少守一月。",
        pool: ["mengda", "shamoke"],
        bonus: "exp",
      },
    },
    unlock: "machao",
  },
  {
    index: 7,
    name: "五丈原",
    subtitle: "秋风斜谷",
    town: "五丈原",
    blurb: "汉中已定，先主进位汉中王。斜谷秋风，魏军坚守，冢虎不出。",
    story: [
      "汉中已定，先主进位汉中王，荆州却已易手。",
      "先主崩于白帝，托孤孔明；南中平后，六出祁山。",
      "渭水对垒，冢虎不出；秋风五丈原，讨逆之路行至最后一战。",
    ],
    stages: ["斜谷口", "陈仓道", "渭水南岸", "北原营寨", "武功水", "五丈原上", "魏军大营"],
    landmarks: ["斜谷村", "武侯祠", "渭水渡"],
    terrain: "mountain",
    field: ["guohuai", "sunli", "caohong", "zhanghe", "dengai", "zhonghui", "wangshuang", "haozhao", "caozhen", "jiangwei", "guanping", "guanxing", "madai", "wangping", "menghuo", "zhurong"],
    elite: ["guohuai", "sunli", "dengai", "wangshuang"],
    boss: "simayi",
    guards: ["guohuai", "sunli", "dengai", "haozhao"],
    branch: {
      a: {
        name: "陈仓道·护运",
        blurb: "郝昭守陈仓，粮道断不得。把运粮队护过去，前线才不至于断炊。",
        pool: ["haozhao", "wangshuang"],
        bonus: "gold",
      },
      b: {
        name: "斜谷口·截粮",
        blurb: "魏军粮车正从斜谷口进营，邓艾亲自押送。截了这一趟，渭水对岸就得挨饿。",
        pool: ["dengai", "zhonghui"],
        bonus: "exp",
      },
    },
    unlock: "weiyan",
  },
];

export const SAGA_CHAPTER_BY_INDEX = new Map(SAGA_CHAPTERS.map((c) => [c.index, c]));

export const SAGA_SKILLS_HINT = "攻击 / 计策 / 防御 / 道具；胜后可礼聘归降";

/** 兵种简称：骑 / 枪 / 弓。 */
export const SAGA_CORPS_LABEL: Record<SagaCorps, string> = {
  cavalry: "骑",
  spear: "枪",
  bow: "弓",
};

/**
 * 兵种按武将底子推：底子不动，长的只是等级与特性。
 * 猛将（武力明显高于智力）带骑，谋士型（智力明显高于武力）带弓，其余枪兵。
 */
export function sagaCorpsOf(def?: SagaGeneralDef): SagaCorps {
  if (!def) return "spear";
  if (def.force - def.intellect >= 18) return "cavalry";
  if (def.intellect - def.force >= 8) return "bow";
  return "spear";
}

/** 名将连携：同一侧凑齐 need 人即整队生效（v10 起）。 */
export interface SagaBondDef {
  id: string;
  name: string;
  members: string[];
  /** 需要同侧出现的人数（含重复 id 只算一次）。 */
  need: number;
  attackPct?: number;
  damageCut?: number;
  speed?: number;
  tacticPoints?: number;
  desc: string;
}

export const SAGA_BONDS: SagaBondDef[] = [
  {
    id: "taoyuan",
    name: "桃园结义",
    members: ["liubei", "guanyu", "zhangfei"],
    need: 2,
    attackPct: 0.1,
    desc: "攻击 +10%",
  },
  {
    id: "wuhu",
    name: "五虎上将",
    members: ["guanyu", "zhangfei", "zhaoyun", "machao", "huangzhong"],
    need: 3,
    attackPct: 0.12,
    desc: "攻击 +12%",
  },
  {
    id: "caowei",
    name: "曹魏肱骨",
    members: ["caocao", "xiahoudun", "xiahouyuan", "caoren", "xuchu", "dianwei"],
    need: 3,
    damageCut: 0.08,
    desc: "减伤 8%",
  },
  {
    id: "jiangdong",
    name: "江东双璧",
    members: ["sunce", "zhouyu"],
    need: 2,
    speed: 6,
    tacticPoints: 2,
    desc: "速度 +6、策略点 +2",
  },
  {
    id: "wolong",
    name: "卧龙凤雏",
    members: ["zhugeliang", "pangtong"],
    need: 2,
    tacticPoints: 2,
    attackPct: 0.08,
    desc: "策略点 +2、攻击 +8%",
  },
  {
    id: "hebei",
    name: "河北双雄",
    members: ["yanliang", "wenchou"],
    need: 2,
    attackPct: 0.12,
    desc: "攻击 +12%",
  },
  {
    id: "xiliang",
    name: "西凉铁骑",
    members: ["machao", "madai", "pangde"],
    need: 2,
    speed: 8,
    attackPct: 0.06,
    desc: "速度 +8、攻击 +6%",
  },
  {
    id: "huangjin",
    name: "黄巾三公",
    members: ["zhangjiao", "zhangbao", "zhangliang"],
    need: 2,
    tacticPoints: 2,
    desc: "策略点 +2",
  },
];

/** 按上阵名单挑出生效的连携（同一连携只返回一次）。 */
export function sagaBondsFor(ids: string[]): SagaBondDef[] {
  const present = new Set(ids);
  return SAGA_BONDS.filter(
    (bond) => bond.members.filter((id) => present.has(id)).length >= bond.need,
  );
}
