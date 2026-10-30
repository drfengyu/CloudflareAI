"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { updateBasicSettings, updatePricingSettings, updateCheckinSettings, updateInviteSettings, updateCashbackSettings, updateRechargeBonusSettings, updateTaskSettings, updateAuthChannels, updateEpaySettings, updateLinuxdoSettings } from "./actions";
import { toast } from "sonner";

interface SettingsFormProps {
  initialSettings: {
    siteName: string;
    defaultBalanceValidDays: string;
    creditsPerUsd: string;
  };
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [siteName, setSiteName] = useState(initialSettings.siteName);
  const [defaultBalanceValidDays, setDefaultBalanceValidDays] = useState(
    initialSettings.defaultBalanceValidDays,
  );
  const [creditsPerUsd, setCreditsPerUsd] = useState(initialSettings.creditsPerUsd);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateBasicSettings({
        siteName,
        defaultBalanceValidDays,
        creditsPerUsd,
      });
      toast.success("设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">站点名称</label>
        <input
          type="text"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          placeholder="Cloudflare AI Console"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          显示在浏览器标题栏和页面顶部
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          兑换码默认余额有效期（天）
        </label>
        <input
          type="number"
          value={defaultBalanceValidDays}
          onChange={(e) => setDefaultBalanceValidDays(e.target.value)}
          min={1}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          placeholder="365"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          生成兑换码时的默认有效期（充值后余额的过期时间）
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          美元汇率（1 USD = ? credits）
        </label>
        <input
          type="number"
          value={creditsPerUsd}
          onChange={(e) => setCreditsPerUsd(e.target.value)}
          min={0.0001}
          step={0.0001}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          placeholder="1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          界面与账本统一以 credits 计价；此处仅在从渠道导入美元定价时用于换算
          <span className="ml-1 opacity-70">（不影响实际扣费金额）</span>
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface PricingSettingsFormProps {
  initialSettings: {
    baseMultiplier: string;
    adjustThreshold: string;
    adjustMultiplierLow: string;
    adjustMultiplierHigh: string;
    defaultPricePerMillion: string;
  };
}

export function PricingSettingsForm({ initialSettings }: PricingSettingsFormProps) {
  const [baseMultiplier, setBaseMultiplier] = useState(initialSettings.baseMultiplier);
  const [adjustThreshold, setAdjustThreshold] = useState(initialSettings.adjustThreshold);
  const [adjustMultiplierLow, setAdjustMultiplierLow] = useState(initialSettings.adjustMultiplierLow);
  const [adjustMultiplierHigh, setAdjustMultiplierHigh] = useState(initialSettings.adjustMultiplierHigh);
  const [defaultPricePerMillion, setDefaultPricePerMillion] = useState(initialSettings.defaultPricePerMillion);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updatePricingSettings({
        baseMultiplier,
        adjustThreshold,
        adjustMultiplierLow,
        adjustMultiplierHigh,
        defaultPricePerMillion,
      });
      toast.success("定价设置已保存，正在重新同步模型价格表...", { duration: 3000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">基础倍率策略</h3>

        <div>
          <label className="block text-sm font-medium mb-1">
            基础倍率 (BASE_MULTIPLIER)
          </label>
          <input
            type="number"
            value={baseMultiplier}
            onChange={(e) => setBaseMultiplier(e.target.value)}
            min={1}
            step={1}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            placeholder="1000"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Cloudflare 官方价格的基础倍率（默认 1000）
          </p>
        </div>

        <div className="rounded-lg border border-border bg-secondary p-4">
          <p className="text-xs text-muted-foreground">
            <strong>当前策略：</strong>所有模型价格先 ×{baseMultiplier}（基础倍率），
            然后根据价格区间应用调整倍率
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">价格调整规则</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              价格阈值 (cr/1M tokens)
            </label>
            <input
              type="number"
              value={adjustThreshold}
              onChange={(e) => setAdjustThreshold(e.target.value)}
              min={0}
              step={1}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              placeholder="100"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              分界线，低于此价格应用低价倍率
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              低价倍率 (&lt; 阈值)
            </label>
            <input
              type="number"
              value={adjustMultiplierLow}
              onChange={(e) => setAdjustMultiplierLow(e.target.value)}
              min={0.01}
              step={0.1}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              placeholder="5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              基础价 &lt; {adjustThreshold} cr 时的倍率
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            高价倍率 (≥ 阈值)
          </label>
          <input
            type="number"
            value={adjustMultiplierHigh}
            onChange={(e) => setAdjustMultiplierHigh(e.target.value)}
            min={0.01}
            step={0.1}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            placeholder="1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            基础价 ≥ {adjustThreshold} cr 时的倍率（通常为 1，不再加价）
          </p>
        </div>

        <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-950/20 p-4">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            <strong>示例：</strong>某模型 catalog 基准价 0.01 cr/1M tokens
            <br />→ 基础价 = 0.01 × {baseMultiplier} = {(parseFloat(baseMultiplier) * 0.01).toFixed(2)} cr
            <br />→ {(parseFloat(baseMultiplier) * 0.01).toFixed(2)} cr &lt; {adjustThreshold} cr，应用低价倍率 ×{adjustMultiplierLow}
            <br />→ 最终价 = {(parseFloat(baseMultiplier) * 0.01).toFixed(2)} × {adjustMultiplierLow} = {(parseFloat(baseMultiplier) * 0.01 * parseFloat(adjustMultiplierLow)).toFixed(2)} cr/1M tokens
            <br />→ 界面统一按 {(parseFloat(baseMultiplier) * 0.01 * parseFloat(adjustMultiplierLow) / 1000).toFixed(4)} cr / per K input token 展示
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">兜底价格</h3>

        <div>
          <label className="block text-sm font-medium mb-1">
            无定价模型默认价格 (cr/1M tokens)
          </label>
          <input
            type="number"
            value={defaultPricePerMillion}
            onChange={(e) => setDefaultPricePerMillion(e.target.value)}
            min={0}
            step={1}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            placeholder="100"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            当模型在 Cloudflare catalog 中无定价信息时使用
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : "保存并重新同步价格表"}
        </Button>
        <p className="text-xs text-muted-foreground">
          保存后将自动重新计算所有模型价格（保留已有的自定义倍率）
        </p>
      </div>
    </form>
  );
}

interface CheckinSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    minQuota: string;
    maxQuota: string;
    validDays: string;
    streakEnabled: boolean;
    streakDays: string;
    streakReward: string;
  };
}

export function CheckinSettingsForm({ initialSettings }: CheckinSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [minQuota, setMinQuota] = useState(initialSettings.minQuota);
  const [maxQuota, setMaxQuota] = useState(initialSettings.maxQuota);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [streakEnabled, setStreakEnabled] = useState(initialSettings.streakEnabled);
  const [streakDays, setStreakDays] = useState(initialSettings.streakDays);
  const [streakReward, setStreakReward] = useState(initialSettings.streakReward);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateCheckinSettings({
        enabled,
        minQuota,
        maxQuota,
        validDays,
        streakEnabled,
        streakDays,
        streakReward,
      });
      toast.success("签到设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="checkin-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="checkin-enabled" className="text-sm font-medium">
          启用签到功能
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            最小奖励额度（credits）
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={minQuota}
            onChange={(e) => setMinQuota(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="0.01"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            用户每次签到最少获得的 credits
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            最大奖励额度（credits）
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={maxQuota}
            onChange={(e) => setMaxQuota(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="0.1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            用户每次签到最多获得的 credits
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          临时余额有效期（天）
        </label>
        <input
          type="number"
          min="1"
          value={validDays}
          onChange={(e) => setValidDays(e.target.value)}
          disabled={!enabled}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
          placeholder="7"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          签到奖励作为临时余额的有效期（过期自动删除）
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={streakEnabled}
            onChange={(e) => setStreakEnabled(e.target.checked)}
            disabled={!enabled}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm font-medium">启用连签奖励</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">连签天数</label>
            <input
              type="number"
              min="2"
              max="365"
              value={streakDays}
              onChange={(e) => setStreakDays(e.target.value)}
              disabled={!enabled || !streakEnabled}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
              placeholder="7"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              连续签到每满这么多天发一次额外奖励
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              额外奖励（credits）
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={streakReward}
              onChange={(e) => setStreakReward(e.target.value)}
              disabled={!enabled || !streakEnabled}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
              placeholder="200"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              达到连签天数时，在当日签到奖励之外额外发放
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>签到规则：</strong>
          <br />
          • 每人每天只能签到一次
          <br />
          • 随机奖励：在最小和最大额度之间随机生成
          <br />
          • 奖励形式：临时余额（有效期 {validDays} 天）
          <br />
          • 连签奖励：连续签到每满 {streakDays} 天额外发放 {streakReward} cr
          <br />• 优先消耗：使用时优先扣减临时余额，不够再扣永久余额
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface InviteSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    inviterReward: string;
    inviteeReward: string;
  };
}

export function InviteSettingsForm({ initialSettings }: InviteSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [inviterReward, setInviterReward] = useState(initialSettings.inviterReward);
  const [inviteeReward, setInviteeReward] = useState(initialSettings.inviteeReward);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateInviteSettings({ enabled, inviterReward, inviteeReward });
      toast.success("邀请设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="invite-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="invite-enabled" className="text-sm font-medium">
          启用邀请奖励
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            邀请人奖励（credits）
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={inviterReward}
            onChange={(e) => setInviterReward(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="300"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            好友注册成功后发给邀请人的永久余额
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            被邀请人奖励（credits）
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={inviteeReward}
            onChange={(e) => setInviteeReward(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="200"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            通过邀请链接注册的新用户额外获得的永久余额
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>邀请规则：</strong>
          <br />
          • 奖励在注册时直接发放，并写入双方钱包的充值记录
          <br />
          • 同一邀请人 24 小时内最多获得 10 次邀请奖励
          <br />
          • 注册仍受 IP 频率限制（24 小时最多 3 个账号）
          <br />• 邀请码在用户首次打开「邀请好友」页时自动生成
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface CashbackSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    rate: string;
    minCredits: string;
    cap: string;
    validDays: string;
    backfillDays: string;
    leaderboardDays: string;
  };
}

export function CashbackSettingsForm({ initialSettings }: CashbackSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [rate, setRate] = useState(initialSettings.rate);
  const [minCredits, setMinCredits] = useState(initialSettings.minCredits);
  const [cap, setCap] = useState(initialSettings.cap);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [backfillDays, setBackfillDays] = useState(initialSettings.backfillDays);
  const [leaderboardDays, setLeaderboardDays] = useState(initialSettings.leaderboardDays);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateCashbackSettings({
        enabled,
        rate,
        minCredits,
        cap,
        validDays,
        backfillDays,
        leaderboardDays,
      });
      toast.success("消费返利设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          id="cashback-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium">启用消费返利（默认关闭）</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">返利比例（0–1）</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="0.1"
          />
          <p className="mt-1 text-xs text-muted-foreground">0.1 表示按当日消费的 10% 返</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">单日封顶（credits）</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="200"
          />
          <p className="mt-1 text-xs text-muted-foreground">每人每天最多返多少</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">起返门槛（credits）</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={minCredits}
            onChange={(e) => setMinCredits(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="20"
          />
          <p className="mt-1 text-xs text-muted-foreground">当日消费不满这个数不返</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">返利有效期（天）</label>
          <input
            type="number"
            min="1"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="7"
          />
          <p className="mt-1 text-xs text-muted-foreground">返到临时余额，过期作废</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">可补领天数</label>
          <input
            type="number"
            min="1"
            max="31"
            value={backfillDays}
            onChange={(e) => setBackfillDays(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="3"
          />
          <p className="mt-1 text-xs text-muted-foreground">最多能往前补领几天的返利</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">冲榜窗口（天）</label>
          <input
            type="number"
            min="1"
            max="90"
            value={leaderboardDays}
            onChange={(e) => setLeaderboardDays(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="7"
          />
          <p className="mt-1 text-xs text-muted-foreground">用量排行榜统计最近多少天</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>口径：</strong>
          <br />
          • 按北京自然日结算，只算已经结束的日子；今天的消费次日才可领
          <br />
          • 消费取 <code className="font-mono">usage_log.creditsUsed</code> 的真实值，失败调用记 0，不参与返利
          <br />
          • 领取时把当日消费与实发额度快照进 <code className="font-mono">cashback_claim</code>，之后改比例/改价不影响历史
          <br />
          • 钱包流水记 type=8「消费返利」
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface RechargeBonusSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    validDays: string;
    tiersJson: string;
  };
}

export function RechargeBonusSettingsForm({ initialSettings }: RechargeBonusSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [tiersJson, setTiersJson] = useState(initialSettings.tiersJson);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateRechargeBonusSettings({ enabled, validDays, tiersJson });
      toast.success("充值赠送设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          id="recharge-bonus-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium">启用充值阶梯赠送（默认关闭）</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">赠送有效期（天）</label>
          <input
            type="number"
            min="1"
            max="365"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="30"
          />
          <p className="mt-1 text-xs text-muted-foreground">赠送进临时余额，到期作废</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">档位（JSON）</label>
        <textarea
          rows={5}
          value={tiersJson}
          onChange={(e) => setTiersJson(e.target.value)}
          disabled={!enabled}
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs disabled:opacity-50"
          placeholder='[{"minCny":50,"bonus":200},{"minCny":100,"bonus":600}]'
        />
        <p className="mt-1 text-xs text-muted-foreground">
          <code className="font-mono">minCny</code> 为实付金额下限（元；LinuxDO 通道按积分同口径），
          <code className="font-mono">bonus</code> 为该档赠送的 credits；取能满足的最高一档，不叠加。
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface TaskSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    validDays: string;
    rewardOverridesJson: string;
  };
  /** 代码里的任务清单，只用来给管理员看 key 和默认额度。 */
  catalog: Array<{ key: string; title: string; target: number; defaultReward: number }>;
}

export function TaskSettingsForm({ initialSettings, catalog }: TaskSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [rewardOverridesJson, setRewardOverridesJson] = useState(initialSettings.rewardOverridesJson);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateTaskSettings({ enabled, validDays, rewardOverridesJson });
      toast.success("任务成就设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          id="tasks-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium">启用任务成就奖励（默认关闭）</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">奖励有效期（天）</label>
          <input
            type="number"
            min="1"
            max="365"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="30"
          />
          <p className="mt-1 text-xs text-muted-foreground">任务奖励进临时余额，到期作废</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">按任务覆盖奖励（JSON，可留空）</label>
        <textarea
          rows={4}
          value={rewardOverridesJson}
          onChange={(e) => setRewardOverridesJson(e.target.value)}
          disabled={!enabled}
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs disabled:opacity-50"
          placeholder='{"first_api":20,"checkin_streak":30}'
        />
        <p className="mt-1 text-xs text-muted-foreground">
          键是下面列表里的 <code className="font-mono">key</code>，值是一次性发放的 credits；留空则用默认额度。
          已领过的任务不受改数影响。
        </p>
        <div className="mt-2 overflow-hidden rounded-lg border border-border">
          {catalog.map((task) => (
            <div
              key={task.key}
              className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5 text-xs last:border-b-0"
            >
              <span className="truncate">
                <span className="font-medium">{task.title}</span>
                <span className="ml-2 font-mono text-muted-foreground">{task.key}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {task.target > 1 ? `${task.target} 次 · ` : ""}默认 {task.defaultReward} cr
              </span>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface AuthChannelsFormProps {
  initialSettings: {
    emailEnabled: boolean;
    githubEnabled: boolean;
    linuxdoEnabled: boolean;
  };
}

export function AuthChannelsForm({ initialSettings }: AuthChannelsFormProps) {
  const [emailEnabled, setEmailEnabled] = useState(initialSettings.emailEnabled);
  const [githubEnabled, setGithubEnabled] = useState(initialSettings.githubEnabled);
  const [linuxdoEnabled, setLinuxdoEnabled] = useState(initialSettings.linuxdoEnabled);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 至少保留一个渠道
    if (!emailEnabled && !githubEnabled && !linuxdoEnabled) {
      toast.error("至少需要启用一个登录渠道");
      return;
    }

    setLoading(true);

    try {
      await updateAuthChannels({
        emailEnabled,
        githubEnabled,
        linuxdoEnabled,
      });
      toast.success("认证渠道设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => setEmailEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <div>
            <span className="text-sm font-medium">邮箱+密码登录</span>
            <p className="text-xs text-muted-foreground">允许用户使用邮箱和密码注册/登录</p>
          </div>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={githubEnabled}
            onChange={(e) => setGithubEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <div>
            <span className="text-sm font-medium">GitHub OAuth</span>
            <p className="text-xs text-muted-foreground">允许用户使用 GitHub 账号登录</p>
          </div>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={linuxdoEnabled}
            onChange={(e) => setLinuxdoEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <div>
            <span className="text-sm font-medium">LinuxDO OAuth</span>
            <p className="text-xs text-muted-foreground">允许用户使用 LinuxDO 账号登录</p>
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>注意：</strong>至少需要保留一个登录渠道，否则用户将无法访问系统。
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface EpaySettingsFormProps {
  initialSettings: {
    enabled: boolean;
    apiUrl: string;
    pid: string;
    key: string;
    rate: string;
    minCny: string;
    maxCny: string;
  };
}

export function EpaySettingsForm({ initialSettings }: EpaySettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [apiUrl, setApiUrl] = useState(initialSettings.apiUrl);
  const [pid, setPid] = useState(initialSettings.pid);
  const [key, setKey] = useState(initialSettings.key);
  const [rate, setRate] = useState(initialSettings.rate);
  const [minCny, setMinCny] = useState(initialSettings.minCny);
  const [maxCny, setMaxCny] = useState(initialSettings.maxCny);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateEpaySettings({ enabled, apiUrl, pid, key, rate, minCny, maxCny });
      toast.success("支付设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  const rateNum = parseFloat(rate);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="epay-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="epay-enabled" className="text-sm font-medium">
          启用在线充值（易支付）
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">网关地址</label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="https://pay.example.com"
          />
          <p className="mt-1 text-xs text-muted-foreground">易支付站点地址（不带结尾斜杠）</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">商户 ID (PID)</label>
          <input
            type="text"
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="1000"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">商户密钥 (KEY)</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={!enabled}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono disabled:opacity-50"
          placeholder="32 位密钥"
        />
        <p className="mt-1 text-xs text-muted-foreground">用于 MD5 签名，仅服务端使用</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">汇率 (1 元 = ? cr)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="10"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">最低充值 (元)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={minCny}
            onChange={(e) => setMinCny(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">最高充值 (元)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={maxCny}
            onChange={(e) => setMaxCny(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="1000"
          />
        </div>
      </div>

      {enabled && Number.isFinite(rateNum) && rateNum > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">
            <strong>当前规则：</strong>¥{minCny || "1"} – ¥{maxCny || "1000"}，
            1 元 = {rateNum} cr（如 ¥100 → {Math.floor(100 * rateNum)} cr，永久余额，无有效期）
            <br />
            回调地址：<code className="font-mono">https://cloudai.fuwari.fun/api/pay/epay/notify</code>
          </p>
        </div>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

interface LinuxdoSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    apiUrl: string;
    pid: string;
    key: string;
    rate: string;
    minCny: string;
    maxCny: string;
  };
}

export function LinuxdoSettingsForm({ initialSettings }: LinuxdoSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [apiUrl, setApiUrl] = useState(initialSettings.apiUrl);
  const [pid, setPid] = useState(initialSettings.pid);
  const [key, setKey] = useState(initialSettings.key);
  const [rate, setRate] = useState(initialSettings.rate);
  const [minCny, setMinCny] = useState(initialSettings.minCny);
  const [maxCny, setMaxCny] = useState(initialSettings.maxCny);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateLinuxdoSettings({ enabled, apiUrl, pid, key, rate, minCny, maxCny });
      toast.success("LinuxDO 积分支付设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  const rateNum = parseFloat(rate);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="ldpay-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="ldpay-enabled" className="text-sm font-medium">
          启用 LinuxDO 积分支付
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">网关地址</label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="https://credit.linux.do/epay"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            LinuxDO 网关基址（不带结尾斜杠），默认官方地址即可
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client ID (PID)</label>
          <input
            type="text"
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="在 credit.linux.do 控制台创建 API Key"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Client Secret (KEY)</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={!enabled}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono disabled:opacity-50"
          placeholder="API Key 密钥，仅服务端使用"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          用于 MD5 签名，仅服务端使用，请妥善保管
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">汇率 (1 积分 = ? cr)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">最低充值 (积分)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={minCny}
            onChange={(e) => setMinCny(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">最高充值 (积分)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={maxCny}
            onChange={(e) => setMaxCny(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
            placeholder="1000"
          />
        </div>
      </div>

      {enabled && Number.isFinite(rateNum) && rateNum > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">
            <strong>当前规则：</strong>
            {minCny || "1"} – {maxCny || "1000"} 积分，1 积分 = {rateNum} cr
            （如 100 积分 → {Math.floor(100 * rateNum)} cr，永久余额，无有效期）
            <br />
            回调地址：<code className="font-mono">https://cloudai.fuwari.fun/api/pay/linuxdo/notify</code>
            <br />
            文档：<code className="font-mono">https://credit.linux.do/docs/api</code>
          </p>
        </div>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}
