import "server-only";

import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { z } from "zod";
import { decryptApiKey, encryptApiKey } from "@/lib/auth/api-key";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { options } from "@/lib/db/schema";
import { setSetting } from "@/lib/settings";

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  from: string;
  fromName: string;
}

export type PublicSmtpSettings = SmtpSettings & { hasPassword: boolean };

interface StoredSmtpSettings extends SmtpSettings {
  passwordEncrypted: string;
}

const SMTP_CONFIG_KEY = "smtp_config";
const DEFAULT_SMTP_SETTINGS: StoredSmtpSettings = {
  enabled: false,
  host: "",
  port: 465,
  secure: true,
  username: "",
  from: "",
  fromName: "",
  passwordEncrypted: "",
};

function headerString(maxLength: number) {
  return z.string().max(maxLength).refine((value) => !/[\r\n]/.test(value)).trim();
}

const emailSchema = headerString(254).pipe(z.email());
const hostnameSchema = z.hostname();
const smtpSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().max(253).refine((value) =>
    value === "" || isIP(value) !== 0 || hostnameSchema.safeParse(value).success,
  ),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: headerString(320),
  from: headerString(254).refine((value) =>
    value === "" || emailSchema.safeParse(value).success,
  ),
  fromName: headerString(128),
});
const passwordSchema = z.string().max(4096);
const smtpInputSchema = smtpSettingsSchema.extend({ password: passwordSchema });
const storedSmtpSchema = smtpSettingsSchema.extend({
  passwordEncrypted: z.string().max(24_000),
});
const messageSchema = z.object({
  subject: headerString(200).min(1),
  text: z.string().min(1).max(100_000),
});

async function getStoredSmtpSettings(): Promise<StoredSmtpSettings | null> {
  let raw: string | null;
  try {
    const rows = await db.select({ value: options.value }).from(options)
      .where(eq(options.key, SMTP_CONFIG_KEY)).limit(1);
    if (!rows[0]) return null;
    raw = rows[0].value;
  } catch {
    throw new Error("SMTP 配置读取失败，请稍后重试");
  }
  let stored: unknown;
  try {
    stored = JSON.parse(raw ?? "");
  } catch {
    throw new Error("SMTP 配置无效，请重新保存配置");
  }
  const parsed = storedSmtpSchema.safeParse(stored);
  if (!parsed.success) throw new Error("SMTP 配置无效，请重新保存配置");
  return parsed.data;
}

export async function getPublicSmtpSettings(): Promise<PublicSmtpSettings> {
  const { passwordEncrypted, ...settings } =
    (await getStoredSmtpSettings()) ?? DEFAULT_SMTP_SETTINGS;
  return { ...settings, hasPassword: passwordEncrypted.length > 0 };
}

export async function saveSmtpSettings(
  input: SmtpSettings & { password: string },
): Promise<void> {
  const parsed = smtpInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("SMTP 配置无效，请检查字段类型、地址格式、端口（1–65535）及字段长度");
  }
  const { password, ...settings } = parsed.data;
  if (settings.enabled && (!settings.host || !settings.username || !settings.from)) {
    throw new Error("启用 SMTP 需要填写服务器、用户名和有效的发件邮箱");
  }

  let passwordEncrypted: string;
  if (password !== "") {
    if (!process.env.API_KEY_ENCRYPTION_SECRET?.trim()) {
      throw new Error("未配置 API_KEY_ENCRYPTION_SECRET，无法保存 SMTP 密码");
    }
    try {
      passwordEncrypted = encryptApiKey(password);
    } catch {
      throw new Error("SMTP 密码加密失败，请检查服务器加密配置");
    }
  } else {
    passwordEncrypted = (await getStoredSmtpSettings())?.passwordEncrypted ?? "";
  }
  if (settings.enabled && !passwordEncrypted) {
    throw new Error("启用 SMTP 需要设置密码或授权码");
  }

  try {
    await setSetting(SMTP_CONFIG_KEY, { ...settings, passwordEncrypted });
  } catch {
    throw new Error("SMTP 配置保存失败，请稍后重试");
  }
}

function smtpFailureMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  switch (code) {
    case "EAUTH":
      return "SMTP 身份验证失败，邮件未发送，请联系超级管理员检查配置";
    case "ETLS":
      return "SMTP 安全连接失败，邮件未发送，请检查 TLS 和证书配置";
    case "EENVELOPE":
      return "SMTP 服务器未接受发件人或收件人，邮件未发送";
    case "ETIMEDOUT":
      return "邮件发送超时，无法确认 SMTP 服务器是否已接受邮件，未自动重试";
    default:
      return "邮件发送失败或结果未确认，请联系超级管理员检查邮件服务，未自动重试";
  }
}

export async function sendSecurityEmail(input: {
  to: string | null;
  subject: string;
  text: string;
}): Promise<{ sent: boolean; error?: string }> {
  const recipient = emailSchema.safeParse(input.to);
  if (!recipient.success) {
    return { sent: false, error: "收件人邮箱无效或未设置，邮件未发送" };
  }
  const to = recipient.data;
  const domain = to.slice(to.lastIndexOf("@") + 1).toLowerCase();
  if (["local", "invalid", "privaterelay.linux.do"].some((suffix) =>
    domain === suffix || domain.endsWith(`.${suffix}`),
  )) {
    return { sent: false, error: "收件人邮箱不可用于安全邮件，邮件未发送" };
  }
  const message = messageSchema.safeParse(input);
  if (!message.success) {
    return { sent: false, error: "邮件主题或正文格式无效或过长，邮件未发送" };
  }

  let config: StoredSmtpSettings | null;
  try {
    config = await getStoredSmtpSettings();
  } catch {
    return { sent: false, error: "SMTP 配置无效或暂不可用，邮件未发送" };
  }
  if (!config) {
    return { sent: false, error: "邮件服务尚未配置或配置暂不可用，邮件未发送" };
  }
  if (!config.enabled) {
    return { sent: false, error: "邮件服务未启用，邮件未发送" };
  }
  if (!config.host || !config.username || !config.from || !config.passwordEncrypted) {
    return { sent: false, error: "SMTP 配置不完整，邮件未发送" };
  }
  if (!process.env.API_KEY_ENCRYPTION_SECRET?.trim()) {
    return { sent: false, error: "服务器未配置邮件加密密钥，邮件未发送" };
  }

  let password: string | null;
  try {
    password = decryptApiKey(config.passwordEncrypted);
  } catch {
    password = null;
  }
  if (!password || !passwordSchema.safeParse(password).success) {
    return { sent: false, error: "SMTP 密码解密失败，请重新设置密码，邮件未发送" };
  }

  try {
    const transportOptions = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const },
      auth: { user: config.username, pass: password },
      forceAuth: true,
      pool: false,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      dnsTimeout: 5_000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
      transactionLog: false,
    };
    const transport = nodemailer.createTransport(transportOptions);
    try {
      const info = await transport.sendMail({
        from: { name: config.fromName, address: config.from },
        to: { name: "", address: to },
        envelope: { from: config.from, to: [to] },
        subject: message.data.subject,
        text: message.data.text,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const accepted = info.accepted.some((address) =>
        (typeof address === "string" ? address : address.address).toLowerCase() === to.toLowerCase(),
      );
      // sent 仅表示 SMTP 服务器已接受，不保证进入收件箱。
      return accepted
        ? { sent: true }
        : { sent: false, error: "SMTP 服务器未接受收件人，邮件未发送" };
    } finally {
      transport.close();
    }
  } catch (error) {
    return { sent: false, error: smtpFailureMessage(error) };
  }
}
