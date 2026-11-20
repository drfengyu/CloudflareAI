import type { FieldFacilityId } from "./renderer";

/**
 * 其他州治与野外村庄的「聚落」内容生成。
 *
 * 只负责内容，不管画面：同一处地方、同一个种子每次进来看到的是同一批铺面与乡人，
 * 不同地方之间则各不一样。客栈（宿）每处都有，其余铺面按种子抽。
 */

export type SettlementKind = "town" | "village";

export interface SettlementFacility {
  id: FieldFacilityId;
  label: string;
  sign: string;
  npc: string;
  line: string;
}

export interface SettlementNpc {
  name: string;
  title: string;
  line: string;
}

export interface Settlement {
  key: string;
  kind: SettlementKind;
  name: string;
  chapter: number;
  blurb: string;
  facilities: SettlementFacility[];
  npcs: SettlementNpc[];
}

function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FacilityDef {
  id: FieldFacilityId;
  label: string;
  sign: string;
  npc: string;
  lines: string[];
}

const TOWN_FACILITIES: FacilityDef[] = [
  {
    id: "inn",
    label: "客栈",
    sign: "宿",
    npc: "店小二",
    lines: ["客官里边请，马棚给您留着。", "被褥刚晒过，热水一壶一文不取。", "要歇脚就趁早，晚了只剩柴房。"],
  },
  {
    id: "herb",
    label: "药铺",
    sign: "药",
    npc: "药铺掌柜",
    lines: ["金疮药、大还丹都有，行军带两包稳妥。", "这方子治外伤，内伤还得静养。", "药材是山里采的，成色您放心。"],
  },
  {
    id: "forge",
    label: "铁匠铺",
    sign: "武",
    npc: "铁匠",
    lines: ["刀口卷了？拿来我看看。", "好钢要慢慢锻，急不得。", "甲片补两块，上阵能少挨一刀。"],
  },
  {
    id: "supply",
    label: "军需帐",
    sign: "军",
    npc: "军需官",
    lines: ["粮草、号衣、绳索，军中缺什么这里都有。", "打起仗来先断粮，别省这点。", "帐下缺人，将军要不要留个名帖？"],
  },
  {
    id: "bank",
    label: "钱庄",
    sign: "钱",
    npc: "账房先生",
    lines: ["金子存进来，平定之时一并折算。", "路上带着金子不安全，存着稳当。", "汇票认票不认人，收好了。"],
  },
  {
    id: "tavern",
    label: "酒馆",
    sign: "酒",
    npc: "酒保",
    lines: ["一碗浊酒，听听这一带的新鲜事？", "南边又过兵了，路上不太平。", "将军面善，这碗我请。"],
  },
  {
    id: "train",
    label: "训练场",
    sign: "训",
    npc: "教头",
    lines: ["兵不练不成器，花些券来练两趟。", "枪要扎得直，刀要收得住。", "练到累时再歇，长进最快。"],
  },
  {
    id: "hall",
    label: "编成所",
    sign: "编",
    npc: "主簿",
    lines: ["队伍、阵形、兵器甲胄，都在这里办。", "人多了要挑着上阵，别都挤在一处。", "新来的武将先在这里点卯。"],
  },
  {
    id: "coupon",
    label: "活动券",
    sign: "券",
    npc: "券铺伙计",
    lines: ["活动券换得到，也买得到。", "当期券过期作废，趁早用。", "礼包在里头，自己挑。"],
  },
  {
    id: "record",
    label: "桃园碑",
    sign: "记",
    npc: "碑前老者",
    lines: ["这一路的战功都刻在上头。", "桃园结义的事，年轻人也该知道。", "常来看看，别忘了初心。"],
  },
];

const VILLAGE_FACILITIES: FacilityDef[] = [
  ...TOWN_FACILITIES.filter((row) => row.id !== "hall" && row.id !== "record" && row.id !== "coupon"),
  {
    id: "forge",
    label: "铁匠棚",
    sign: "武",
    npc: "老铁匠",
    lines: ["村里就这一座炉子，兵器拿来我修。", "农具改的刀，也能上阵。", "慢工出细活，明早来取。"],
  },
];

const NPC_POOL: { name: string; title: string; lines: string[] }[] = [
  { name: "里正", title: "本地里正", lines: ["这一带刚过完兵，家家都在收粮。", "将军的队伍不扰民，乡里记着这份情。", "往北走是官道，往南是水洼，别走岔了。"] },
  { name: "卖花女", title: "街口卖花", lines: ["新摘的野菊，一文一把。", "打仗的日子，花也开得野。", "将军买一把吧，图个吉利。"] },
  { name: "老农", title: "种田人", lines: ["今年雨水少，收成怕是不济。", "兵过如梳，好歹留了口粮。", "前头那片坡地，年轻时我也种过。"] },
  { name: "货郎", title: "走乡串户", lines: ["针头线脑、盐巴布匹，都在担子里。", "我这担子走得比马快，就是怕兵。", "听说北边又打起来了？"] },
  { name: "塾师", title: "村塾先生", lines: ["乱世也须读书，不然连军令都看不懂。", "孩子们念的是《千字文》。", "将军若识文断字，帐前也好办事。"] },
  { name: "渔翁", title: "水边钓叟", lines: ["水急鱼少，钓的是个清静。", "上游有渡口，船家认得路。", "年轻时我也跟过队伍。"] },
  { name: "药童", title: "背药篓的孩子", lines: ["掌柜让我来采药，这山上有柴胡。", "将军受伤了？我这儿有止血的草。", "别踩那片苗，刚长出来。"] },
  { name: "游侠", title: "佩剑的过客", lines: ["天下大乱，何处是归路。", "听说刘皇叔在招贤？", "这一带的路，我熟。"] },
];

const BLURBS = [
  "夯土墙围着几十户人家，井台边晒着新收的谷子。",
  "街面不长，酒旗与药幌一左一右，来往的多是赶路的。",
  "城外一条官道穿过，车辙压得很深，店里常有行商歇脚。",
  "屋舍依坡而建，檐下挂着风干的辣椒与玉米。",
  "水渠从镇中穿过，石桥上蹲着几只晒暖的猫。",
];

export function settlementFor(input: {
  kind: SettlementKind;
  name: string;
  chapter: number;
  seed?: number;
}): Settlement {
  const seed = hash32(`${input.kind}|${input.name}|${input.chapter}|${input.seed ?? 0}`);
  const rand = rng(seed);
  const pool = input.kind === "town" ? TOWN_FACILITIES : VILLAGE_FACILITIES;
  const inn = pool.find((row) => row.id === "inn")!;
  const others = pool.filter((row) => row.id !== "inn");
  const extraCount =
    input.kind === "town" ? others.length : 1 + Math.floor(rand() * 2);
  const picked: FacilityDef[] = [inn];
  const rest = [...others];
  while (picked.length < 1 + extraCount && rest.length > 0) {
    const index = Math.floor(rand() * rest.length);
    picked.push(rest.splice(index, 1)[0]);
  }
  // 同一家铺子只出现一次；招牌按铺面类型固定。
  const facilities = picked.map((def) => ({
    id: def.id,
    label: def.label,
    sign: def.sign,
    npc: def.npc,
    line: def.lines[Math.floor(rand() * def.lines.length) % def.lines.length],
  }));
  const npcCount = input.kind === "town" ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 2);
  const npcs: SettlementNpc[] = [];
  const npcPool = [...NPC_POOL];
  for (let i = 0; i < npcCount && npcPool.length > 0; i++) {
    const row = npcPool.splice(Math.floor(rand() * npcPool.length), 1)[0];
    npcs.push({
      name: row.name,
      title: row.title,
      line: row.lines[Math.floor(rand() * row.lines.length) % row.lines.length],
    });
  }
  return {
    key: `${input.kind}:${input.chapter}:${input.name}`,
    kind: input.kind,
    name: input.name,
    chapter: input.chapter,
    blurb:
      input.kind === "town"
        ? `${BLURBS[Math.floor(rand() * BLURBS.length) % BLURBS.length]}街市比行营齐整，客栈照常迎客。`
        : `${BLURBS[Math.floor(rand() * BLURBS.length) % BLURBS.length]}村口一棵老槐，树下拴着两条耕牛。`,
    facilities,
    npcs,
  };
}
