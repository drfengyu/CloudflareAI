"use client";

import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { updateBasicSettings, updatePricingSettings, updateCheckinSettings, updateInviteSettings, updateCashbackSettings, updateRechargeBonusSettings, updateTaskSettings, updateAuthChannels, updateEpaySettings, updateLinuxdoSettings, updateSmtpSettings } from "./actions";
import { toast } from "sonner";
import type { PublicSmtpSettings } from "@/lib/email";

export function SmtpSettingsForm({ initialSettings }: { initialSettings: PublicSmtpSettings }) {
  const { hasPassword: initialHasPassword, ...initialValues } = initialSettings;
  const [settings, setSettings] = useState(initialValues);
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await updateSmtpSettings({ ...settings, password });
      setHasPassword(hasPassword || Boolean(password));
      setPassword("");
      toast.success("SMTP 设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />
        启用 SMTP 邮件通知
      </label>
      <p className="text-xs text-muted-foreground">管理员重置密码后自动向用户邮箱发信，同时发送双方站内信；邮件失败会在重置结果中提示。</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ["host", "SMTP 服务器", "text"],
          ["username", "SMTP 用户名", "text"],
          ["from", "发件邮箱", "email"],
          ["fromName", "发件人名称（选填）", "text"],
        ] as const).map(([key, label, type]) => (
          <label key={key} className="space-y-1 text-sm">
            <span>{label}</span>
            <input
              type={type}
              value={settings[key]}
              onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
              required={settings.enabled && key !== "fromName"}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </label>
        ))}
        <label className="space-y-1 text-sm">
          <span>SMTP 端口</span>
          <input type="number" min={1} max={65535} required value={settings.port} onChange={(event) => setSettings({ ...settings, port: Number(event.target.value) })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1 text-sm">
          <span>连接加密</span>
          <select value={settings.secure ? "tls" : "starttls"} onChange={(event) => setSettings({ ...settings, secure: event.target.value === "tls" })} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <option value="tls">TLS（通常端口 465）</option>
            <option value="starttls">STARTTLS（通常端口 587）</option>
          </select>
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span>SMTP 密码 / 授权码</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required={settings.enabled && !hasPassword} placeholder={hasPassword ? "已设置，留空保持原密码" : "请输入邮箱的 SMTP 授权码"} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          <span className="block text-xs text-muted-foreground">加密保存，不回显；仅超级管理员可修改。发件邮箱需获 SMTP 服务商允许。</span>
        </label>
      </div>
      <Button type="submit" disabled={loading}>{loading ? "保存中..." : "保存 SMTP 设置"}</Button>
    </form>
  );
}

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
          美元汇率（1 USD = ? cr）
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
          界面与账本统一以 cr 计价；此处仅在从渠道导入美元定价时用于换算
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
              step="any"
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
            step="any"
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
            最小奖励额度（tcr）
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
            用户每次签到最少获得的 tcr
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            最大奖励额度（tcr）
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
            用户每次签到最多获得的 tcr
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
tcr 有效期（天）
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
          签到奖励作为 tcr 的有效期（过期自动删除）
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
              额外奖励（tcr）
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
          • 奖励形式：tcr（有效期 {validDays} 天）
          <br />
          • 连签奖励：连续签到每满 {streakDays} 天额外发放 {streakReward} tcr
          <br />• 扣费顺序：先扣 tcr，不够再扣 cr
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
            邀请人奖励（cr）
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
            好友注册成功后发给邀请人的 cr
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            被邀请人奖励（cr）
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
            通过邀请链接注册的新用户额外获得的 cr
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
    validDays: string;
    leaderboardDays: string;
    /** 已配好的档位；表单按行编辑，不让管理员手写 JSON。 */
    tiers: Array<{ minCredits: number; minReward: number; maxReward: number }>;
  };
}

export function CashbackSettingsForm({ initialSettings }: CashbackSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [leaderboardDays, setLeaderboardDays] = useState(initialSettings.leaderboardDays);
  const [tiers, setTiers] = useState(() =>
    initialSettings.tiers.map((t) => ({
      minCredits: String(t.minCredits),
      minReward: String(t.minReward),
      maxReward: String(t.maxReward),
    })),
  );
  const [loading, setLoading] = useState(false);

  const patchTier = (
    index: number,
    next: Partial<{ minCredits: string; minReward: string; maxReward: string }>,
  ) => setTiers((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateCashbackSettings({ enabled, validDays, leaderboardDays, tiers });
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
        <span className="text-sm font-medium">启用累计消费返利（默认关闭）</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
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
            placeholder="7"
          />
          <p className="mt-1 text-xs text-muted-foreground">发 tcr 时按这个有效期作废</p>
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

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium">累计消费档位</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!enabled}
            onClick={() =>
              setTiers((prev) => [...prev, { minCredits: "", minReward: "", maxReward: "" }])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加档位
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-14 shrink-0">档位</span>
          <span className="flex-1">累计满（cr）</span>
          <span className="flex-1">最少奖励（cr 等值）</span>
          <span className="flex-1">最多奖励（cr 等值）</span>
          <span className="w-10 shrink-0" />
        </div>
        {tiers.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            还没有档位。开启返利需要至少一档：活动期内累计消费满 X，随机发 Y–Z cr 等值（tcr / cr / 活动券）或 1–3 张转盘活动券。
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {tiers.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                  第 {i + 1} 档
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={row.minCredits}
                  onChange={(e) => patchTier(i, { minCredits: e.target.value })}
                  disabled={!enabled}
                  className={ROW_INPUT}
                  placeholder="500"
                />
                <input
                  type="number"
                  step="0.01"
                  value={row.minReward}
                  onChange={(e) => patchTier(i, { minReward: e.target.value })}
                  disabled={!enabled}
                  className={ROW_INPUT}
                  placeholder="10"
                />
                <input
                  type="number"
                  step="0.01"
                  value={row.maxReward}
                  onChange={(e) => patchTier(i, { maxReward: e.target.value })}
                  disabled={!enabled}
                  className={ROW_INPUT}
                  placeholder="100"
                />
                <button
                  type="button"
                  onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={!enabled}
                  className={ROW_DELETE}
                  title="删除这一档"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          与充值阶梯赠送共用同一个活动时间段；按活动期内<b>累计消费</b>判定，达到多档时每档都可领取一次。每档随机发放 tcr / cr / 当期活动券 / 1–3 张转盘活动券，奖励区间随档位递增。顺序不用管，保存时按门槛从小到大重排。
        </p>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>口径：</strong>
          <br />
          • 活动时间与充值赠送一致（开始 / 结束日期在「充值阶梯赠送」里配）
          <br />
          • 消费取 <code className="font-mono">usage_log.creditsUsed</code> 的真实值，失败调用记 0，不参与返利
          <br />
          • 用户在活动页逐档发放到站内信，领取后才进余额或券包
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

/**
 * 行编辑里窄输入框与删除按钮的公共样式（与看板信息卡表单同一套）。
 * 注意：这些数字框**故意不写 min/max**——HTML5 的范围校验会在提交非法值时静默挡住 submit，
 * 表现成「点了保存没反应」；范围一律交给服务端校验，管理员能看到具体是哪一行不对。
 */
const ROW_INPUT =
  "min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums disabled:opacity-50";
const ROW_DELETE =
  "shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50";

interface RechargeBonusSettingsFormProps {
  initialSettings: {
    enabled: boolean;
    validDays: string;
    /** 活动窗口（北京时间，含首尾两天）；结束日期留空表示长期开放。 */
    startDate: string;
    endDate: string;
    /** 已配好的档位；表单按行编辑，不让管理员手写 JSON。 */
    tiers: Array<{ minCny: number; bonus: number }>;
  };
}

export function RechargeBonusSettingsForm({ initialSettings }: RechargeBonusSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [startDate, setStartDate] = useState(initialSettings.startDate);
  const [endDate, setEndDate] = useState(initialSettings.endDate);
  const [tiers, setTiers] = useState(() =>
    initialSettings.tiers.map((t) => ({ minCny: String(t.minCny), bonus: String(t.bonus) })),
  );
  const [loading, setLoading] = useState(false);

  const patchTier = (index: number, next: Partial<{ minCny: string; bonus: string }>) =>
    setTiers((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateRechargeBonusSettings({ enabled, validDays, startDate, endDate, tiers });
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium mb-1">活动开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">活动结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-muted-foreground">留空表示长期开放；按北京时间含首尾两天</p>
        </div>
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
          <p className="mt-1 text-xs text-muted-foreground">赠送 tcr，到期作废</p>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium">赠送档位</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!enabled}
            onClick={() => setTiers((prev) => [...prev, { minCny: "", bonus: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加档位
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-14 shrink-0">档位</span>
          <span className="flex-1">实付满（元，LinuxDO 按积分）</span>
          <span className="flex-1">赠送（tcr）</span>
          <span className="w-10 shrink-0" />
        </div>
        {tiers.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            还没有档位。开启赠送需要至少一档：实付满 X 送 Y tcr。
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {tiers.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                  第 {i + 1} 档
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={row.minCny}
                  onChange={(e) => patchTier(i, { minCny: e.target.value })}
                  disabled={!enabled}
                  className={ROW_INPUT}
                  placeholder="50"
                />
                <input
                  type="number"
                  step="1"
                  value={row.bonus}
                  onChange={(e) => patchTier(i, { bonus: e.target.value })}
                  disabled={!enabled}
                  className={ROW_INPUT}
                  placeholder="200"
                />
                <button
                  type="button"
                  onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={!enabled}
                  className={ROW_DELETE}
                  title="删除这一档"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          按活动期内<b>累计实付</b>判定，达到多档时每档都可领取一次（不叠加计算）；用户在「限时返利」页逐档发放到站内信，领取后以 tcr 到账。顺序不用管，保存时按门槛从小到大重排。
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
  };
}

export function TaskSettingsForm({ initialSettings }: TaskSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [validDays, setValidDays] = useState(initialSettings.validDays);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateTaskSettings({ enabled, validDays });
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
        <span className="text-sm font-medium">启用每日 / 每周任务（默认关闭）</span>
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
          <p className="mt-1 text-xs text-muted-foreground">里程碑奖励按这个有效期作废</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>任务规则（写死在代码里）：</strong>
          <br />
          • 每日 6 项任务，手动领取后累计活跃度，满分 100
          <br />
          • 每周 6 项任务，满分 300，奖励显著更丰厚
          <br />
          • 每日每 25 / 每周每 50 活跃度一档，达到后自动发站内信随机奖励（金额逐档递增，发 tcr）
          <br />
          • 进度现场读签到、对话、API、消费、玩法与站内信领取记录，不改历史数据
        </p>
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
            1 元 = {rateNum} cr（如 ¥100 → {Math.floor(100 * rateNum)} cr，直接到账，不过期）
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
            （如 100 积分 → {Math.floor(100 * rateNum)} cr，直接到账，不过期）
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
