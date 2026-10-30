/**
 * 对外展示用户时的统一脱敏口径：排行榜、中奖播报这类跨用户列表都用它，
 * 避免每个活动各写一份、脱敏强度不一致。
 */

/** 邮箱首字符 + *** + 域名；无邮箱退回昵称首字；都没有退回用户 ID 前 8 位。 */
export function maskUserLabel(email: string | null, name: string | null, userId: string): string {
  if (email) {
    const [local, domain] = email.split("@");
    if (local && domain) {
      return `${local.charAt(0)}***@${domain}`;
    }
  }
  if (name && name.trim()) {
    return name.trim().slice(0, 1) + "***";
  }
  return `用户${userId.slice(0, 8)}`;
}
