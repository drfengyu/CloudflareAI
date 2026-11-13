import { SAGA_CHAPTERS, SAGA_GENERAL_BY_ID } from "./data";
import type { SagaFieldPoi, SagaNode } from "./types";

/**
 * 剧情文本：开场、阵前、平定、乡野、酒馆与营帐议事。
 *
 * 全部是原创文案，只用于前端演出，不参与服务端结算；因此随便刷新页面
 * 都只是重看一遍，不会改变存档。战斗胜负仍由重放指令决定。
 */

export type SagaBackdrop = "city" | "camp" | "tent" | "tavern" | "field";

export type SagaSpeakerSide = "hero" | "enemy" | "npc" | "narrator";

export interface SagaDialogueLine {
  speaker: string;
  text: string;
  /** 有则用该武将 / NPC 的立绘。 */
  generalId?: string;
  npcId?: string;
  side?: SagaSpeakerSide;
}

export interface SagaScene {
  id: string;
  title: string;
  backdrop: SagaBackdrop;
  lines: SagaDialogueLine[];
}

export interface SagaNpcDef {
  id: string;
  name: string;
  title: string;
  greeting: string;
  lines: string[];
}

export const SAGA_NPCS: Record<string, SagaNpcDef> = {
  blacksmith: {
    id: "blacksmith",
    name: "石铁山",
    title: "铁匠铺掌柜",
    greeting: "炉火正旺。将军要打兵器，还是补一补甲叶？",
    lines: [
      "这把偃月刀是照着关将军的臂力打的，旁人来问，我都不卖。",
      "好钢要三淬三炼，急不得。将军打仗也一样。",
      "最近黄巾余部把铁料都抢走了，价钱才涨成这样。",
    ],
  },
  herbalist: {
    id: "herbalist",
    name: "孙药婆",
    title: "药铺掌柜",
    greeting: "行军辛苦，先坐下歇歇。伤药我都包好了。",
    lines: [
      "这味止血草是山里新采的，苦是苦了点，见效快。",
      "将军若信得过老身，营里伤员都送来，我连夜熬药。",
      "打仗靠的不只是刀快，能活着回来才算本事。",
    ],
  },
  innkeeper: {
    id: "innkeeper",
    name: "柳娘",
    title: "客栈掌柜",
    greeting: "热水、热饭、干净的铺盖，一样不少。住一晚再走吧？",
    lines: [
      "这几日来往的兵多，楼上只剩两间空房了。",
      "兵败的弟兄我也收。人活着回来，比什么都强。",
      "后院的井水甜，军爷们走时都爱灌一壶。",
    ],
  },
  banker: {
    id: "banker",
    name: "杜算盘",
    title: "钱庄掌柜",
    greeting: "军爷要存金子？票据给您收好，收兵时一并结算。",
    lines: [
      "这年头钱不值钱，能换成 tcr 的才是硬通货。",
      "我只收金币、只出 tcr，别的买卖一概不做。",
      "存多少您自己填，账簿上一笔一笔都记得清清楚楚。",
    ],
  },
  quartermaster: {
    id: "quartermaster",
    name: "陈仓",
    title: "军需官",
    greeting: "军需帐里都是这趟行军能用的东西，军爷慢慢挑。",
    lines: [
      "虎符能添兵，战鼓能壮胆，风行符能抢一步先机。",
      "被动军需每样限一份，多了也叠不上去。",
      "省着点用。大军未动，粮草先行。",
    ],
  },
  drillmaster: {
    id: "drillmaster",
    name: "简雍",
    title: "编成所参军",
    greeting: "五将上阵，十二人待命。要换谁，将军说一声便是。",
    lines: [
      "阵型相克比人多更管用，鱼鳞未必打得过方圆。",
      "新招降的将军先放在后备，磨合两仗再上阵。",
      "兵器甲胄都在库里，换装之后立绘也会跟着变。",
    ],
  },
  tavernkeeper: {
    id: "tavernkeeper",
    name: "田叟",
    title: "酒馆说书人",
    greeting: "将军来得正好，刚说到这地方的一段旧事。要来碗浊酒么？",
    lines: [
      "这地方的故事，三天三夜也说不完。",
      "乱世里最不缺的就是英雄，最缺的是让百姓过安生日子的官。",
      "将军若肯常来，老朽把后头那段接着讲。",
    ],
  },
  tentkeeper: {
    id: "tentkeeper",
    name: "糜竺",
    title: "行军司马",
    greeting: "营帐里已经议过一轮了。军令、兵力、辎重，都在这儿。",
    lines: [
      "五将的兵都点过名了，缺编的得尽快补。",
      "此地营寨未拔尽，主帅本阵不会应战。",
      "军令在案：先拔外营，再图中军。",
    ],
  },
  recordkeeper: {
    id: "recordkeeper",
    name: "赵伯",
    title: "桃园碑守碑人",
    greeting: "桃园碑上又添了几笔。将军要看看旧日的战史么？",
    lines: [
      "碑上刻的不只是胜仗，也刻着没回来的弟兄。",
      "八处地方，如今走到哪一处了？",
      "等天下太平，这碑上就该刻些别的了。",
    ],
  },
};

const BOSS_SCENES: { boss: string; hero: string; taunt: string; reply: string }[] = [
  {
    boss: "张角",
    hero: "刘备",
    taunt: "苍天已死，黄天当立。区区乡勇，也敢挡我黄巾大势？",
    reply: "苍天之下皆是百姓。你借太平之名，行掳掠之实，我今日必破你本阵。",
  },
  {
    boss: "董卓",
    hero: "关羽",
    taunt: "关东鼠辈，也配在虎牢关前叫阵？",
    reply: "乱臣贼子，人人得而诛之。温酒尚温，取你首级正好。",
  },
  {
    boss: "袁术",
    hero: "张飞",
    taunt: "朕受天命，登基称帝。尔等草寇，还不下马受缚！",
    reply: "呸！一个卖假玉玺的，也敢自称皇帝？吃俺老张一矛！",
  },
  {
    boss: "吕布",
    hero: "刘备",
    taunt: "天下英雄，皆惧我画戟。刘玄德，今日便叫你见识温侯之勇。",
    reply: "奉先勇则勇矣，却无信义。今日水淹下邳，你已无路可退。",
  },
  {
    boss: "袁绍",
    hero: "关羽",
    taunt: "四世三公，兵甲百万。汝等萤火之光，也敢争官渡？",
    reply: "兵多而无谋，粮足而将疑。乌巢一把火，便见分晓。",
  },
  {
    boss: "曹操",
    hero: "诸葛亮",
    taunt: "江南水军，不过疥癣之疾。待我连环船成，一举踏平赤壁。",
    reply: "丞相船连得越紧，火便烧得越旺。东南风起时，还请丞相莫要后悔。",
  },
  {
    boss: "刘璋",
    hero: "刘备",
    taunt: "同宗之谊，玄德为何引兵入蜀，夺我基业？",
    reply: "西川百姓困于暗弱之主久矣。备入蜀，只为还此地一个太平。",
  },
  {
    boss: "司马懿",
    hero: "诸葛亮",
    taunt: "孔明远来，粮道难继。我只需深沟高垒，坐待你粮尽自退。",
    reply: "冢虎不出，我便送一套巾帼之服与你。五丈原上，且看谁先熬不住。",
  },
];

/** 每章的旁白 / 主将开场。一句一行，方便逐字演出。 */
const INTROS: SagaDialogueLine[][] = [
  [
    { speaker: "旁白", text: "中平元年，黄巾席卷八州。涿郡城下，募兵的榜文被风吹得猎猎作响。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "汉室倾颓，百姓流离。备虽织席贩履，也当为天下出一份力。" },
    { speaker: "关羽", generalId: "guanyu", text: "大哥既有此志，关某愿执鞭随镫，生死相随。" },
    { speaker: "张飞", generalId: "zhangfei", text: "俺颇有家资，愿与二位哥哥共举大事！桃园已备下香案。" },
    { speaker: "旁白", text: "三人焚香结义，八百乡勇列于城下。第一面「讨逆」旗，就此立起。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "黄巾前哨盘踞郊外。先拔营寨，再图广宗！" },
  ],
  [
    { speaker: "旁白", text: "董卓入京，废立天子。关东诸侯会盟陈留，兵锋直指汜水关。", side: "narrator" },
    { speaker: "关羽", generalId: "guanyu", text: "华雄连斩数将，联军无人敢出。大哥，这一阵让关某去。" },
    { speaker: "刘备", generalId: "liubei", text: "云长小心。此战不为扬名，只为替联军开一条路。" },
    { speaker: "张飞", generalId: "zhangfei", text: "二哥若斩了华雄，俺老张就把那碗温酒喝了！" },
    { speaker: "旁白", text: "汜水关外鼓声如雷。营寨连绵，董卓亲率西凉铁骑坐镇本阵。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "先破外围营寨，再叩关斩将。出发！" },
  ],
  [
    { speaker: "旁白", text: "陶谦三让徐州，刘备领牧。袁术却在寿春称帝，遣纪灵引兵来争。", side: "narrator" },
    { speaker: "张飞", generalId: "zhangfei", text: "这袁术好大的口气，真当自己坐了金銮殿？" },
    { speaker: "刘备", generalId: "liubei", text: "小沛城小兵少，只能以战养战。纪灵营寨最靠前，先拿他开刀。" },
    { speaker: "关羽", generalId: "guanyu", text: "辕门射戟的情分还在，可惜各为其主。战场上不必留情。" },
    { speaker: "旁白", text: "淮北平原上，袁术军的旗号一眼望不到头。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "稳住阵脚，一座一座拔过去。徐州百姓还在城中等我们。" },
  ],
  [
    { speaker: "旁白", text: "吕布袭取徐州，曹操亲征下邳。沂泗之水被掘开，白门楼困于泽国。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "温侯勇冠三军，却反复无常。此战之后，徐州该有个了断。" },
    { speaker: "关羽", generalId: "guanyu", text: "陈宫有谋而不能用，高顺有勇而不肯降。吕布身边，尽是可惜之人。" },
    { speaker: "张飞", generalId: "zhangfei", text: "俺只惦记那杆方天画戟。若能夺来，倒也是一件好兵器！" },
    { speaker: "旁白", text: "水声拍打城墙。陷阵大营、白门楼、温侯本阵，层层相护。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "先破陷阵营，再逼白门楼。不要伤及城中百姓。" },
  ],
  [
    { speaker: "旁白", text: "袁绍并河北四州，兵临官渡。延津渡口，白马坡前，战云压城。", side: "narrator" },
    { speaker: "关羽", generalId: "guanyu", text: "颜良文丑，河北名将。大哥若信我，这两阵便由我打头。" },
    { speaker: "刘备", generalId: "liubei", text: "云长之勇，我从不怀疑。但袁绍兵多，须防他断我粮道。" },
    { speaker: "张飞", generalId: "zhangfei", text: "粮道交给俺！谁敢来抢，俺把他连人带车掀进河里。" },
    { speaker: "旁白", text: "乌巢粮道通向袁军大营，沿途营寨林立，守备森严。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "先拔乌巢外围，再图中军。此战若胜，河北可定。" },
  ],
  [
    { speaker: "旁白", text: "曹操挟八十三万之众饮马长江。江夏水寨里，孙刘两家终于坐到一处。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "曹军船阵连环，看似无懈可击。孔明，你有几分把握？" },
    { speaker: "诸葛亮", generalId: "zhugeliang", text: "船连得越紧，火便烧得越快。只待东南风起。" },
    { speaker: "关羽", generalId: "guanyu", text: "水战非我所长，但华容道上，关某愿立军令状。" },
    { speaker: "旁白", text: "三江口浪涛翻涌，赤壁矶上旌旗蔽日。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "先取乌林港，再破荆襄大营。此战之后，天下三分。" },
  ],
  [
    { speaker: "旁白", text: "刘璋暗弱，西川门户洞开。涪城会盟的酒还未凉，两军已在雒城对峙。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "同宗相残，非我所愿。可西川百姓，不能再困于暗弱之主。" },
    { speaker: "庞统", generalId: "pangtong", text: "主公，雒城张任善守，落凤坡一带须得小心。" },
    { speaker: "张飞", generalId: "zhangfei", text: "军师放心，俺走旱路，孔明走水路，看谁先到成都！" },
    { speaker: "旁白", text: "巴山蜀水间，关隘重重。涪城道、绵竹隘、成都宫门，一步一险。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "先拔涪城诸营，再取成都。传令下去，不得扰民。" },
  ],
  [
    { speaker: "旁白", text: "汉中已定，先主进位汉中王。斜谷秋风里，魏军深沟高垒，闭门不出。", side: "narrator" },
    { speaker: "诸葛亮", generalId: "zhugeliang", text: "司马懿善守，粮道又远。这一仗，比的是谁先撑不住。" },
    { speaker: "刘备", generalId: "liubei", text: "孔明，你的身子……罢了，此战之后，便回成都歇一歇吧。" },
    { speaker: "魏延", generalId: "weiyan", text: "末将愿领一支奇兵，出子午谷直取长安！" },
    { speaker: "旁白", text: "五丈原上，秋风卷着枯草。魏军大营绵延，司马懿的中军就在最深处。", side: "narrator" },
    { speaker: "诸葛亮", generalId: "zhugeliang", text: "先破北原营寨，再撼魏军本阵。此战，讨逆之路便走到头了。" },
  ],
];

const OUTROS: SagaDialogueLine[][] = [
  [
    { speaker: "旁白", text: "广宗城下，黄巾本阵溃散。张角遁走，涿郡郊外重归安宁。", side: "narrator" },
    { speaker: "张飞", generalId: "zhangfei", text: "痛快！这一路杀得俺手都热了！" },
    { speaker: "关羽", generalId: "guanyu", text: "大哥，黄巾虽破，天下未定。" },
    { speaker: "刘备", generalId: "liubei", text: "收拾兵马，明日继续南下。讨逆之路，才刚开头。" },
  ],
  [
    { speaker: "旁白", text: "汜水关破，董卓焚洛阳西走。联军入城时，只剩一片焦土。", side: "narrator" },
    { speaker: "关羽", generalId: "guanyu", text: "温酒未凉，华雄已斩。可惜这一城百姓，再也回不来了。" },
    { speaker: "刘备", generalId: "liubei", text: "诸侯各怀私心，联军早晚要散。我们走自己的路。" },
    { speaker: "张飞", generalId: "zhangfei", text: "管他散不散，俺跟着大哥走就是！" },
  ],
  [
    { speaker: "旁白", text: "寿春城破，袁术呕血而亡。小沛城头，重新挂起了刘字旗。", side: "narrator" },
    { speaker: "旁白", text: "古城来投的赵云单骑入营，枪挑落日的剪影，让全军都安静了一瞬。", side: "narrator" },
    { speaker: "刘备", generalId: "liubei", text: "子龙肯来，胜过十万甲兵。" },
    { speaker: "关羽", generalId: "guanyu", text: "徐州初定，袁绍又起。下一处地方，只怕更险。" },
  ],
  [
    { speaker: "旁白", text: "白门楼前，吕布受缚。陈宫就义，高顺不屈。", side: "narrator" },
    { speaker: "张飞", generalId: "zhangfei", text: "温侯勇了一辈子，到头来还是输在反复无常。" },
    { speaker: "关羽", generalId: "guanyu", text: "文远归心，胜过徐州千里。大哥，该整军北上了。" },
    { speaker: "刘备", generalId: "liubei", text: "传令厚葬陈宫。乱世里，忠义二字最难得。" },
  ],
  [
    { speaker: "旁白", text: "乌巢火起，袁绍大军一夜崩解。官渡的秋风里，河北旗号倒了一地。", side: "narrator" },
    { speaker: "关羽", generalId: "guanyu", text: "颜良文丑已诛，河北再无名将。" },
    { speaker: "张飞", generalId: "zhangfei", text: "俺守粮道守得手痒，下回可得让俺打头阵！" },
    { speaker: "刘备", generalId: "liubei", text: "曹操势大，早晚南下。该去荆州，见一见那位卧龙先生了。" },
  ],
  [
    { speaker: "旁白", text: "东南风起，赤壁烈焰映红半条长江。曹军连环船化为灰烬。", side: "narrator" },
    { speaker: "诸葛亮", generalId: "zhugeliang", text: "华容道已留生路。天下三分之势，成了。" },
    { speaker: "关羽", generalId: "guanyu", text: "关某立了军令状，却终究下不去手。请大哥责罚。" },
    { speaker: "刘备", generalId: "liubei", text: "云长重义，我岂不知。收兵吧，荆州还需要我们。" },
  ],
  [
    { speaker: "旁白", text: "成都开城，西川归心。涪城道上的烽烟，终于散在锦官城的晚霞里。", side: "narrator" },
    { speaker: "庞统", generalId: "pangtong", text: "落凤坡的箭，险些要了庞统的命。这一遭，值了。" },
    { speaker: "马超", generalId: "machao", text: "西凉铁骑，愿为将军效命。" },
    { speaker: "刘备", generalId: "liubei", text: "益州初定，汉中便是下一道门槛。整军，北上。" },
  ],
  [
    { speaker: "旁白", text: "五丈原的秋风吹了整夜。魏军大营终于拔旗后撤，斜谷口放晴。", side: "narrator" },
    { speaker: "诸葛亮", generalId: "zhugeliang", text: "冢虎退矣。只是这天下，还远没有太平。" },
    { speaker: "刘备", generalId: "liubei", text: "八处地方皆定，讨逆之路走完了。回成都，给将士们摆一桌酒。" },
    { speaker: "旁白", text: "营中鼓声响起，一遍又一遍。那些没能回来的名字，也被风带回了故乡。", side: "narrator" },
  ],
];

const TAVERN_TALES: [string, string][] = [
  ["田叟", "桃园结义那年，张翼德把家里的桃树都摇秃了。他说，结义要见红，桃花的红也是红。"],
  ["田叟", "华雄在汜水关前骂阵，骂了整整一个时辰。关将军只回了一句：酒尚温。"],
  ["田叟", "纪灵使三尖刀，重八十斤。辕门射戟那日，他把刀往地上一插，说这是天意。"],
  ["田叟", "下邳城破前，吕布还在白门楼上喝酒。他至死都信，自己还能杀出去。"],
  ["田叟", "官渡那阵子，袁绍粮车排了十里长。一把火烧完，才叫曹操捡了个大便宜。"],
  ["田叟", "赤壁那夜，江面上的火比星星还亮。曹营的船连在一起，跑都跑不脱。"],
  ["田叟", "雒城张任死守，庞统军师在落凤坡中箭。那一带至今还叫落凤坡。"],
  ["田叟", "五丈原的秋风最凉。司马懿隔着渭水望着蜀营灯火，一夜没敢合眼。"],
];

function clampChapter(index: number): number {
  return Math.max(0, Math.min(SAGA_CHAPTERS.length - 1, Math.trunc(index) || 0));
}

export function chapterIntroScene(chapterIndex: number): SagaScene {
  const index = clampChapter(chapterIndex);
  const chapter = SAGA_CHAPTERS[index];
  return {
    id: `intro-${index}`,
    title: `${chapter.town} · ${chapter.name}`,
    backdrop: "city",
    lines: INTROS[index].map((line) => ({ ...line, side: line.side ?? "hero" })),
  };
}

export function chapterVictoryScene(chapterIndex: number): SagaScene {
  const index = clampChapter(chapterIndex);
  const chapter = SAGA_CHAPTERS[index];
  return {
    id: `victory-${index}`,
    title: `${chapter.town}已定`,
    backdrop: "field",
    lines: OUTROS[index].map((line) => ({ ...line, side: line.side ?? "hero" })),
  };
}

export function campScene(
  chapterIndex: number,
  node: Pick<SagaNode, "name" | "kind" | "enemies">,
  bossGeneralId?: string,
): SagaScene {
  const index = clampChapter(chapterIndex);
  const boss = node.kind === "boss";
  const first = node.enemies[0];
  const bossLine = BOSS_SCENES[index];
  const enemySpeaker = boss ? bossLine.boss : first?.name ?? "敌将";
  const enemyId = boss ? bossGeneralId ?? first?.id : first?.id;
  const taunt = boss
    ? bossLine.taunt
    : `${first?.name ?? "来将"}横枪阵前，喝道：「${node.name}重地，闲人止步！」`;
  const reply = boss
    ? bossLine.reply
    : `${bossLine.hero}按剑而出：「讨逆军到此。让路者活，挡路者破。」`;
  return {
    id: `camp-${index}-${node.name}`,
    title: node.name,
    backdrop: "camp",
    lines: [
      {
        speaker: "旁白",
        text: boss
          ? `营门大开，亲卫分列两侧。${enemySpeaker}的中军大帐就在前方。`
          : `营外拒马森严，哨骑来回游弋。${enemySpeaker}的旗号在风里翻卷。`,
        side: "narrator",
      },
      { speaker: enemySpeaker, generalId: enemyId, text: taunt, side: "enemy" },
      { speaker: bossLine.hero, generalId: heroIdFor(bossLine.hero), text: reply, side: "hero" },
      ...(boss
        ? [
            {
              speaker: enemySpeaker,
              generalId: enemyId,
              text: "好胆。那就看看，你的兵先倒，还是我的营先破。",
              side: "enemy" as const,
            },
          ]
        : []),
    ],
  };
}

function heroIdFor(name: string): string | undefined {
  for (const def of SAGA_GENERAL_BY_ID.values()) {
    if (def.name === name) return def.id;
  }
  return undefined;
}

export function poiScene(
  chapterIndex: number,
  poi: Pick<SagaFieldPoi, "kind" | "name">,
): SagaScene {
  const index = clampChapter(chapterIndex);
  const chapter = SAGA_CHAPTERS[index];
  const stage = chapter.stages[Math.min(chapter.stages.length - 1, index % chapter.stages.length)];
  const lines: SagaDialogueLine[] = [
    {
      speaker: "旁白",
      text:
        poi.kind === "village"
          ? `${poi.name}的炊烟从屋脊后升起。几个孩童躲在门后，探头望着这支军队。`
          : poi.kind === "shrine"
            ? `${poi.name}的山门半掩。香火将尽，檐角的铜铃被风吹得轻响。`
            : `${poi.name}的渡船停在岸边。艄公正把缆绳一圈圈收好。`,
      side: "narrator",
    },
  ];
  if (poi.kind === "village") {
    lines.push(
      {
        speaker: "老农",
        npcId: "villager",
        text: `将军，此处叫${poi.name}。前些日子溃兵过境，把存粮都抢走了。听说${chapter.stages[chapter.stages.length - 1]}那边，又扎了新营。`,
        side: "npc",
      },
      {
        speaker: "刘备",
        generalId: "liubei",
        text: "老丈放心。等拔了这些营寨，我留一队人下来，替你们把田埂修好。",
        side: "hero",
      },
    );
  } else if (poi.kind === "shrine") {
    lines.push(
      {
        speaker: "守庙道人",
        npcId: "taoist",
        text: `将军眉宇有正气。贫道别无所赠，只送一句：${chapter.blurb}`,
        side: "npc",
      },
      {
        speaker: "关羽",
        generalId: "guanyu",
        text: "借道长吉言。待此地平定，关某再来添一炷香。",
        side: "hero",
      },
    );
  } else {
    lines.push(
      {
        speaker: "艄公",
        npcId: "boatman",
        text: `将军要渡河？往${stage}去，水路比陆路近。只是水流急，兵马得一批一批过。`,
        side: "npc",
      },
      {
        speaker: "张飞",
        generalId: "zhangfei",
        text: "有俺老张在，翻不了船！船家，先渡先锋营！",
        side: "hero",
      },
    );
  }
  return {
    id: `poi-${index}-${poi.kind}-${poi.name}`,
    title: poi.name,
    backdrop: "field",
    lines,
  };
}

export function tavernScene(chapterIndex: number): SagaScene {
  const index = clampChapter(chapterIndex);
  const tale = TAVERN_TALES[index];
  return {
    id: `tavern-${index}`,
    title: "酒馆 · 一段旧事",
    backdrop: "tavern",
    lines: [
      { speaker: "旁白", text: "酒馆里人声嘈杂。说书人一拍醒木，四周渐渐安静下来。", side: "narrator" },
      { speaker: tale[0], npcId: "tavernkeeper", text: tale[1], side: "npc" },
      {
        speaker: "张飞",
        generalId: "zhangfei",
        text: "好！说得比俺自己打的还热闹。掌柜的，再添两碗酒！",
        side: "hero",
      },
    ],
  };
}

export function councilScene(chapterIndex: number, partyIds: string[]): SagaScene {
  const index = clampChapter(chapterIndex);
  const chapter = SAGA_CHAPTERS[index];
  const speakers = partyIds
    .map((id) => SAGA_GENERAL_BY_ID.get(id))
    .filter((def): def is NonNullable<typeof def> => Boolean(def))
    .slice(0, 3);
  const banks = [
    "末将愿领一军为先锋，替将军试一试敌军虚实。",
    "此地的山川粮道，末将已看过一遍。可先断其外援。",
    "只待将军一声令下，末将愿死战不退。",
  ];
  const lines: SagaDialogueLine[] = [
    {
      speaker: "旁白",
      text: `${chapter.town}的营帐里，烛火摇曳。众将围在地图前，${chapter.stages[chapter.stages.length - 1]}被圈了一圈又一圈。`,
      side: "narrator",
    },
    ...speakers.map((def, i) => ({
      speaker: def.name,
      generalId: def.id,
      text: banks[i] ?? banks[banks.length - 1],
      side: "hero" as const,
    })),
    {
      speaker: "刘备",
      generalId: "liubei",
      text: "明日拔营。先拔外营，再图中军。诸位各自整军，莫要轻敌。",
      side: "hero",
    },
  ];
  return { id: `council-${index}`, title: "营帐议事", backdrop: "tent", lines };
}

export function npcChatLines(npcId: string): string[] {
  return SAGA_NPCS[npcId]?.lines ?? [];
}
