import { Coins, Flag, ScrollText, Swords, Trophy, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrialGame } from "@/components/trial/game";
import { CouponCount } from "@/components/activity/coupon-badge";
import { ActivityWindowBadge } from "@/components/activity/activity-window-badge";
import { formatCredits } from "@/lib/billing/credits";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { requireUser } from "@/lib/usage/meter";
import {
  trialActivityKey,
  trialActivityWindow,
  trialGoldFor,
} from "@/lib/trial/config";
import { getTrialConfig } from "@/lib/trial/settings";
import {
  campaignComplete,
  findActiveTrialRun,
  listTrialRuns,
  loadTrialSave,
  type ActiveTrialRun,
  type TrialHistoryRow,
  type TrialSaveState,
} from "@/lib/trial/store";
import { SAGA_CHAPTERS } from "@/lib/trial/saga/data";
import { SAGA_FORGE_MAX_LEVEL } from "@/lib/trial/saga/forge";
import { SAGA_INN_PRICE_TICKETS } from "@/lib/trial/saga/inn";
import { partyPower } from "@/lib/trial/saga/state";

export const dynamic = "force-dynamic";

function Notice({ title, hint }: { title: string; hint: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-base font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flag;
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col justify-center gap-1 py-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function TrialPage() {
  const userId = await requireUser();
  const [config, coupon] = await Promise.all([
    getTrialConfig(),
    getActivityCouponView(userId, "trial"),
  ]);
  const windowInfo = trialActivityWindow(config);
  const activityKey = trialActivityKey(config);

  const track = windowInfo.status === "active" || windowInfo.status === "ended";
  const [saveState, activeRun, history]: [
    TrialSaveState,
    ActiveTrialRun | null,
    TrialHistoryRow[],
  ] = await Promise.all([
    loadTrialSave(userId, activityKey),
    windowInfo.status === "active" ? findActiveTrialRun(userId, activityKey) : Promise.resolve(null),
    track ? listTrialRuns(userId, activityKey, 8) : Promise.resolve([]),
  ]);

  const save = saveState.save;
  const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, save.chapter)];
  const place = `${chapter.town} · ${chapter.name}`;
  const dexCount = new Set([...save.met, ...save.recruited]).size;
  const finished = campaignComplete(save);

  const rulesCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">规则</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            从当前城镇出城后是一张<b>俯视行军大地图</b>：方向键 / WASD 四向自由行走，
            出城后官道、草地、海边滩涂与树林都会随机遇敌（只有城内与城门洞安全），
            点空白处可随时查看队伍、道具与装备。
            图上有 {config.questionCount} 座敌营，先打哪座由你走位决定；主帅本阵要先拔尽其余营寨。
            营寨全部攻破，剧情才会推进到下一处地方。每一步都会<b>自动存档</b>，
            撤退只结束当前这场仗，等级、金币、装备、招降武将都不会丢。
          </li>
          <li>
            战斗为<b>兵力制回合制</b>：每回合在战斗画面下方给每名武将下「攻击 / 计策 / 防御 / 道具 / 招降」指令；
            五将上阵、十二人待命，阵型（鱼鳞 / 鹤翼 / 锋矢 / 方圆 / 长蛇）互相克制，
            计策消耗计策点，敌将兵力低于三成时可以招降。武将各有<b>无双 / 智圣 / 会心 / 猛将</b>
            等固有特性，升级还会增长计策点、智将在特定等级学会新计策。
            营寨与攻城战会按种子补入带装备的士兵位，敌我上场都不超过五人；
            敌军按自己的等级配兵器甲胄，杂兵（兵士 / 山贼 / 海贼 / 盗贼）的装备比同级敌将略差；
            点战斗标题旁的<b>「敌情」</b>可查看每名敌将的四维、兵器甲胄、计策与特性。
          </li>
          <li>
            出城<b>不花券</b>。铁匠铺、药铺、客栈、军需帐与<b>训练场</b>全部用<b>活动券</b>标价（1 张 ={" "}
            {formatCredits(config.couponUnitCredits)} cr 券面），买装备、伤药、军需、住店与逐级训练都在购买时实时扣券；
            铁匠铺还能逐级<b>强化装备</b>（每件最高 +{SAGA_FORGE_MAX_LEVEL} 级，每级提升两成基础属性，换将卸装不掉级）；
            城中还有<b>活动券礼包</b>入口，可当场兑换或购买。战斗缴获的金币可在钱庄存成 tcr，
            也能按同一券面价（1 张 = {formatCredits(config.couponUnitCredits)} cr ≈ 同等金币）换成活动券当场使用。
          </li>
          <li>
            平定一处地方就<b>自动结算</b>并发平定奖励（不用再手动收兵）：
            {config.tiers
              .map((tier) => ` 攻破 ${tier.correct} 座营寨 ${formatCredits(trialGoldFor(config, tier.correct))} 金`)
              .join("，")}
            ；按达到的最高档发放，金币直接进剧情存档，未平定不发。
          </li>
          <li>
            城镇钱庄两条路：每 {config.bankGoldPerTcr} 金存成 1 tcr（每趟最多存{" "}
            {config.bankMaxGoldPerRun} 金，平定此地时自动到账），或每 {config.couponUnitCredits} 金换 1 张活动券
            （不限量，兑换后立即到账）。客栈每次住店花{" "}
            {SAGA_INN_PRICE_TICKETS} 张券，把上阵武将的兵力补满，残兵也能接着推下一处。
          </li>
          <li>
            不设次数与时限。中途关掉页面不算失败，回来接着走当前剧情；
            战报只上传编制 / 购物 / 战斗指令，由服务端按种子重放判定。
          </li>
        </ul>
      </CardContent>
    </Card>
  );

  const historyCard = (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">行军录</CardTitle>
        <span className="text-xs text-muted-foreground">已平定 {save.stats.wins} 处地方</span>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有行军记录。</p>
        ) : (
          <div className="space-y-1">
            {history.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {new Date(row.startedAt).toLocaleString("zh-CN", { hour12: false })}
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span>
                    {row.status === "active" ? "行军中" : `攻破 ${row.correct}/${row.questionCount} 座营寨`}
                  </span>
                  <span className="flex items-center gap-2">
                    {row.clearGold > 0 ? (
                      <span className="font-medium text-success">+{formatCredits(row.clearGold)} 金</span>
                    ) : null}
                    {row.reward > 0 ? (
                      <span className="font-medium text-success">+{formatCredits(row.reward)} tcr</span>
                    ) : row.clearGold > 0 ? null : (
                      <span className="text-muted-foreground">无奖励</span>
                    )}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const progressCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">讨逆路线</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {SAGA_CHAPTERS.map((row) => {
          const cleared = row.index < save.chapter;
          const current = !finished && row.index === save.chapter;
          return (
            <div
              key={row.index}
              className={
                current
                  ? "flex items-center justify-between rounded-lg border border-primary/60 bg-primary/5 px-3 py-2 text-sm"
                  : "flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              }
            >
              <span>
                {cleared ? `${row.town} · ${row.name}` : current ? place : "？？？"}
                {current ? <span className="ml-2 text-xs text-primary">当前</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {cleared ? "已定" : current ? "剧情进行中" : "未至"}
              </span>
            </div>
          );
        })}
        {finished ? (
          <p className="pt-1 text-xs text-muted-foreground">八处地方皆定，讨逆之路已经走完。</p>
        ) : (
          <p className="pt-1 text-xs text-muted-foreground">
            走完当前地方的剧情，才会出现下一处地名。
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（每日试炼）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : { title: "活动已结束", hint: `结束时间（北京时间）：${config.endAt || "未设置"}。` };
    return (
      <>
        <PageHeader title="三国讨逆传" description={place} />
        <PageBody className="space-y-4">
          <Notice title={notice.title} hint={notice.hint} />
          {track ? historyCard : null}
          {rulesCard}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="三国讨逆传"
        description={`${place} · 剧情回合制兵团战`}
        action={
          <ActivityWindowBadge
            win={windowInfo}
            tickets={coupon.tickets}
            couponName={coupon.couponName}
          />
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Flag}
            label="当前所在"
            value={chapter.town}
            hint={finished ? "讨逆之路已走完" : `${chapter.name} · ${chapter.subtitle}`}
          />
          <Stat
            icon={ScrollText}
            label="平定地方"
            value={`${save.stats.wins} / ${SAGA_CHAPTERS.length}`}
            hint={save.stats.wins > 0 ? "已走完的剧情地点" : "尚未平定第一处"}
          />
          <Stat
            icon={Coins}
            label="钱庄存金"
            value={`${config.bankGoldPerTcr} 金 = 1 tcr`}
            hint={`每趟最多存 ${config.bankMaxGoldPerRun} 金`}
          />
          <Stat
            icon={Trophy}
            label="可用活动券"
            value={<CouponCount kind="trial" count={coupon.tickets} iconClassName="h-4 w-4" />}
            hint={`图鉴 ${dexCount} 人 · 战力 ${partyPower(save)}`}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {chapter.town} · {chapter.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{chapter.subtitle}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{chapter.blurb}</p>
            <TrialGame
              initialRun={activeRun}
              save={save}
              initialTickets={coupon.tickets}
              coupon={coupon}
              bank={{
                goldPerTcr: config.bankGoldPerTcr,
                maxGoldPerRun: config.bankMaxGoldPerRun,
              }}
              nodeCount={config.questionCount}
              maxReward={trialGoldFor(config, config.questionCount)}
              rewardValidDays={config.rewardValidDays}
            />
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon={Swords}
            label="行军次数"
            value={`${save.stats.runs} 次`}
            hint={`累计胜仗 ${save.stats.battlesWon}`}
          />
          <Stat
            icon={Users}
            label="编成武将"
            value={`${save.party.length + save.reserve.length} 人`}
            hint={`上阵 ${save.party.length} 人 · 待命 ${save.reserve.length} 人`}
          />
          <Stat
            icon={ScrollText}
            label="图鉴收录"
            value={`${dexCount} 人`}
            hint={`招降 ${save.stats.recruited} 人 · 单次最远 ${save.stats.bestCleared} 处`}
          />
        </div>

        {progressCard}
        {historyCard}
        {rulesCard}
      </PageBody>
    </>
  );
}
