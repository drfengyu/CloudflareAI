import { couponNameFor } from "@/lib/activity/coupons";
import { d1Run } from "@/lib/db/d1-http";
import { sendMessage } from "@/lib/message/messages";
import { trialActivityKey, trialActivityWindow, type TrialConfig } from "@/lib/trial/config";
import { SAGA_NOTICES, updateGiftTickets } from "@/lib/trial/saga/notice";

export interface TrialUpdateGift {
  /** 本次更新公告的条目数，也是发放张数。 */
  tickets: number;
  /** 券面 cr：张数 × 当期券单价。 */
  credits: number;
  /** false = 这次已经发过，本次只是读取，不重复发信。 */
  sent: boolean;
}

/**
 * 版本更新礼：按最新公告的更新条目数，一项发一张当期活动券。
 *
 * 只发一封站内信，券放在附件里，玩家点「领取」后才入当期券包。
 * 幂等标记写在 activity_coupon 里（`activityKey = update-gift:<版本>`，credits = 0）：
 * 这行不属于任何活动轮次，券面视图读不到，但会永久留档；同版本重复进页面不会再发信。
 * 先插标记再发信，插入失败说明别的请求已经发过；发信失败则删标记，允许下次重试。
 */
export async function ensureTrialUpdateGift(
  userId: string,
  config: TrialConfig,
): Promise<TrialUpdateGift | null> {
  const latest = SAGA_NOTICES[0];
  const tickets = updateGiftTickets(latest);
  if (!latest || tickets <= 0) return null;

  const activityKey = trialActivityKey(config);
  if (!activityKey || trialActivityWindow(config).status !== "active") return null;

  const unit = config.couponUnitCredits;
  if (!Number.isFinite(unit) || unit <= 0) return null;

  const markerKey = `update-gift:${latest.version}`;
  const markerId = crypto.randomUUID();
  const now = Date.now();
  const { changes } = await d1Run(
    `INSERT OR IGNORE INTO activity_coupon
       (id, userId, activityKind, activityKey, couponName, credits, createdAt, updatedAt)
     VALUES (?, ?, 'trial', ?, '版本更新礼', 0, ?, ?)`,
    [markerId, userId, markerKey, now, now],
  );
  if (changes !== 1) return { tickets, credits: 0, sent: false };

  const credits = Math.round(tickets * unit * 100) / 100;
  try {
    await sendMessage({
      userId,
      kind: "reward",
      title: `版本更新礼 · v${latest.version}`,
      body: `本次更新公告共 ${tickets} 项内容，发放 ${tickets} 张当期活动券（一项一张）。点「领取」后放入券包，活动结束后作废。`,
      attachment: {
        kind: "coupon",
        activityKind: "trial",
        activityKey,
        couponName: couponNameFor("trial", activityKey),
        unitCredits: unit,
        tickets,
        credits,
      },
    });
  } catch (err) {
    // 信没发出去就把幂等标记撤掉，免得这次更新礼被永久吞掉。
    await d1Run("DELETE FROM activity_coupon WHERE id = ?", [markerId]).catch(() => undefined);
    throw err;
  }
  return { tickets, credits, sent: true };
}

