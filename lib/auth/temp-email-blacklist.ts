/**
 * 临时邮箱域名黑名单
 * 参考：https://github.com/disposable-email-domains/disposable-email-domains
 */
export const TEMP_EMAIL_DOMAINS = [
  // 常见临时邮箱服务
  "10minutemail.com",
  "10minutemail.net",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamailblock.com",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "throwaway.email",
  "mailinator.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "fakeinbox.com",
  "fakeinbox.net",
  "maildrop.cc",
  "trashmail.com",
  "getnada.com",
  "mohmal.com",
  "emailondeck.com",
  "spambox.us",
  "mailnesia.com",
  "dispostable.com",
  "mintemail.com",
  "tempinbox.com",
  "sharklasers.com",
  "grr.la",
  "guerrillamail.org",
  "guerrillamail.de",
  "guerrillamail.biz",
  "spam4.me",
  "mytemp.email",
  "disposable-email.ml",
  "tmpmail.net",
  "tmpmail.org",
  "mailsac.com",
  "bugmenot.com",
  "jetable.org",
  "mailforspam.com",
  "tmail.ws",
  "incognitomail.com",
  "anonymbox.com",
  "mytrashmail.com",
  "discard.email",
  "fakermail.com",
  "inboxbear.com",
  "tempr.email",
  "zetmail.com",
  "oopi.org",
  "armyspy.com",
  "cuvox.de",
  "dayrep.com",
  "einrot.com",
  "fleckens.hu",
  "gustr.com",
  "jourrapide.com",
  "rhyta.com",
  "superrito.com",
  "teleworm.us",
];

/**
 * 检查邮箱是否为临时邮箱
 * @param email - 邮箱地址
 * @returns true 表示是临时邮箱，false 表示不是
 */
export function isTempEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;

  return TEMP_EMAIL_DOMAINS.includes(domain);
}

/**
 * 检查邮箱域名是否在黑名单中
 * @param domain - 邮箱域名
 * @returns true 表示在黑名单中
 */
export function isTempEmailDomain(domain: string): boolean {
  return TEMP_EMAIL_DOMAINS.includes(domain.toLowerCase());
}
