import { createHash } from "crypto";
import { getSetting } from "@/lib/settings";

/**
 * 易支付（彩虹易支付）接入封装。
 * 文档：https://www.epaycore.com/
 * 签名算法：参数按 key 升序排序，value 拼接（不包含 sign 和空值），末尾追加商户密钥，整体 MD5。
 */

export interface EpayConfig {
  enabled: boolean;
  apiUrl: string;
  pid: string;
  key: string;
  /** 1 CNY = ? credits */
  rate: number;
  /** 单笔最低金额（元） */
  minCny: number;
  /** 单笔最高金额（元） */
  maxCny: number;
}

export async function getEpayConfig(): Promise<EpayConfig> {
  const [enabled, apiUrl, pid, key, rate, minCny, maxCny] = await Promise.all([
    getSetting("epay_enabled", false),
    getSetting("epay_api_url", ""),
    getSetting("epay_pid", ""),
    getSetting("epay_key", ""),
    getSetting("recharge_rate", 10),
    getSetting("recharge_min", 1),
    getSetting("recharge_max", 1000),
  ]);
  return { enabled, apiUrl, pid, key, rate, minCny, maxCny };
}

/** 计算易支付 MD5 签名（参数按 key 排序拼接 + 密钥）。 */
export function epaySign(params: Record<string, string | number>, key: string): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5").update(`${sorted}${key}`).digest("hex");
}

/** 验证回调签名（排除 sign 与 sign_type，与易支付官方规则一致）。 */
export function epayVerify(
  params: Record<string, string | number>,
  key: string,
  sign: string,
): boolean {
  const { sign: _sign, sign_type: _signType, ...rest } = params;
  const expected = epaySign(rest, key);
  return expected.toLowerCase() === String(sign).toLowerCase();
}

/**
 * 构建易支付收银台下单 URL。
 * 返回 false 表示配置不完整。
 */
export function buildEpayPayUrl(
  cfg: EpayConfig,
  order: { orderNo: string; amountCny: number; channel: string },
  notifyUrl: string,
  returnUrl: string,
): { url: string; params: Record<string, string> } | null {
  if (!cfg.apiUrl || !cfg.pid || !cfg.key) return null;

  const params: Record<string, string | number> = {
    pid: cfg.pid,
    type: order.channel, // alipay / wechat / qqpay
    out_trade_no: order.orderNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: "AI 平台充值",
    money: order.amountCny.toFixed(2),
    // 附加参数：把 userId 传给回调，便于对账（sign 会覆盖它，易支付不校验非标参数）
    param: order.orderNo,
  };
  const sign = epaySign(params, cfg.key);

  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  query.set("sign", sign);
  query.set("sign_type", "MD5");

  return { url: `${cfg.apiUrl.replace(/\/$/, "")}/submit.php?${query.toString()}`, params: { ...params, sign, sign_type: "MD5" } };
}

export interface EpayOrderQueryResult {
  /** 是否查询到订单（code=1）。 */
  ok: boolean;
  /** 易支付返回的业务码：1=成功，0=失败。网络/解析错误时为 -1。 */
  code: number;
  msg?: string;
  tradeStatus?: string;
  tradeNo?: string;
  money?: number;
}

/**
 * 服务端主动查询订单真实支付状态（对账兜底，回调丢失时使用）。
 * 彩虹易支付订单查询接口：POST {api_url}/api.php?act=order
 * 返回 JSON：code=1 时 trade_order 内含 trade_status / trade_no / money。
 */
export async function queryEpayOrder(
  cfg: EpayConfig,
  outTradeNo: string,
): Promise<EpayOrderQueryResult> {
  if (!cfg.apiUrl || !cfg.pid || !cfg.key) {
    return { ok: false, code: -1, msg: "易支付配置不完整" };
  }

  const endpoint = `${cfg.apiUrl.replace(/\/$/, "")}/api.php?act=order`;
  const form = new URLSearchParams({
    pid: cfg.pid,
    key: cfg.key,
    out_trade_no: outTradeNo,
  });

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await res.text();
    const data = JSON.parse(text);
    const tradeOrder = data.trade_order ?? {};
    return {
      ok: Number(data.code) === 1,
      code: Number(data.code),
      msg: data.msg,
      tradeStatus: tradeOrder.trade_status,
      tradeNo: tradeOrder.trade_no,
      money: tradeOrder.money !== undefined ? Number(tradeOrder.money) : undefined,
    };
  } catch (err) {
    return { ok: false, code: -1, msg: err instanceof Error ? err.message : "查询易支付订单失败" };
  }
}
