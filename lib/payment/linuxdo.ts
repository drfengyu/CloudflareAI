import { getSetting } from "@/lib/settings";
import { epaySign, epayVerify } from "./epay";

/**
 * LinuxDO Credit（linux.do 积分）接入。
 * 参考：https://credit.linux.do/docs/api（本仓库同步版见 docs/creditapi.md）
 *
 * 采用「易支付兼容接口」（type=epay，MD5 签名）：
 * - 网关基址：https://credit.linux.do/epay
 * - 签名算法与彩虹易支付完全一致（排除 sign/sign_type，ASCII 升序拼接 + 密钥 MD5），
 *   因此直接复用 epay.ts 的 epaySign / epayVerify。
 * - 订单生命周期、幂等结算、对账与易支付共用 lib/payment/order.ts。
 */

export interface LinuxdoConfig {
  enabled: boolean;
  apiUrl: string;
  /** Client ID */
  pid: string;
  /** Client Secret */
  key: string;
  /** 1 积分 = ? credits */
  rate: number;
  /** 单笔最低积分 */
  minCny: number;
  /** 单笔最高积分 */
  maxCny: number;
}

export async function getLinuxdoConfig(): Promise<LinuxdoConfig> {
  const [enabled, apiUrl, pid, key, rate, minCny, maxCny] = await Promise.all([
    getSetting("ldpay_enabled", false),
    getSetting("ldpay_api_url", "https://credit.linux.do/epay"),
    getSetting("ldpay_pid", ""),
    getSetting("ldpay_key", ""),
    getSetting("ldpay_rate", 1),
    getSetting("ldpay_min", 1),
    getSetting("ldpay_max", 1000),
  ]);
  return { enabled, apiUrl, pid, key, rate, minCny, maxCny };
}

/**
 * 构建 LinuxDO Credit 收银台跳转 URL（易支付兼容协议）。
 * 返回 null 表示配置不完整。
 */
export function buildLinuxdoPayUrl(
  cfg: LinuxdoConfig,
  order: { orderNo: string; amountCny: number },
  notifyUrl: string,
  returnUrl: string,
): { url: string; params: Record<string, string> } | null {
  if (!cfg.apiUrl || !cfg.pid || !cfg.key) return null;

  const params: Record<string, string | number> = {
    pid: cfg.pid,
    type: "epay",
    out_trade_no: order.orderNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: "AI 平台充值",
    money: order.amountCny.toFixed(2),
    device: "web",
  };
  const sign = epaySign(params, cfg.key);

  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  query.set("sign", sign);
  query.set("sign_type", "MD5");

  return {
    url: `${cfg.apiUrl.replace(/\/$/, "")}/pay/submit.php?${query.toString()}`,
    params: { ...params, sign, sign_type: "MD5" },
  };
}

/** 校验回调签名（与易支付协议一致）。 */
export function linuxdoVerify(
  params: Record<string, string | number>,
  key: string,
  sign: string,
): boolean {
  return epayVerify(params, key, sign);
}

export interface LinuxdoOrderQueryResult {
  /** 是否查询到订单（code=1）。网络/解析错误或订单不存在时为 false。 */
  ok: boolean;
  code: number;
  msg?: string;
  tradeStatus?: string;
  tradeNo?: string;
  money?: number;
}

/**
 * 服务端主动查询订单真实支付状态（对账兜底，回调丢失时使用）。
 * GET /epay/api.php?act=order&pid=..&key=..&out_trade_no=..
 * 响应：code=1 且 status=1 表示支付成功；status=0 表示失败/处理中；
 * 订单不存在返回 HTTP 404 与 {"code":-1,"msg":"服务不存在或已完成"}。
 */
export async function queryLinuxdoOrder(
  cfg: LinuxdoConfig,
  outTradeNo: string,
): Promise<LinuxdoOrderQueryResult> {
  if (!cfg.apiUrl || !cfg.pid || !cfg.key) {
    return { ok: false, code: -1, msg: "LinuxDO 配置不完整" };
  }

  const endpoint = `${cfg.apiUrl.replace(/\/$/, "")}/api.php`;
  const query = new URLSearchParams({
    act: "order",
    pid: cfg.pid,
    key: cfg.key,
    out_trade_no: outTradeNo,
  });

  try {
    const res = await fetch(`${endpoint}?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) {
      return { ok: false, code: -1, msg: "服务不存在或已完成" };
    }

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, code: -1, msg: "响应解析失败" };
    }

    const code = Number(data.code);
    if (code !== 1) {
      return {
        ok: false,
        code,
        msg: typeof data.msg === "string" ? data.msg : "查询失败",
      };
    }

    const status = Number(data.status);
    if (status === 1) {
      return {
        ok: true,
        code: 1,
        tradeStatus: "TRADE_SUCCESS",
        tradeNo: data.trade_no as string | undefined,
        money: data.money !== undefined ? Number(data.money) : undefined,
        msg: typeof data.msg === "string" ? data.msg : undefined,
      };
    }

    // status=0：失败/处理中 → 保持待支付
    return { ok: true, code: 0, tradeStatus: "WAIT_BUYER_PAY", msg: "处理中" };
  } catch (err) {
    return {
      ok: false,
      code: -1,
      msg: err instanceof Error ? err.message : "查询 LinuxDO 订单失败",
    };
  }
}
