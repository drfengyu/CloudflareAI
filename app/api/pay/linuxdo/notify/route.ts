import { NextRequest } from "next/server";
import { getLinuxdoConfig, linuxdoVerify } from "@/lib/payment/linuxdo";
import { getOrderByNo, settleRechargeOrder } from "@/lib/payment/order";

export const dynamic = "force-dynamic";

/**
 * LinuxDO Credit 异步通知回调。
 * 协议：易支付兼容（type=epay）。LinuxDO 以 HTTP GET 通知（也可兼容 POST 表单）。
 * 验签通过后返回 HTTP 200 + 纯文本 "success"，否则返回非 success 触发平台重试（最多 5 次）。
 */
async function handle(params: Record<string, string>): Promise<Response> {
  const cfg = await getLinuxdoConfig();
  if (!cfg.enabled || !cfg.key) {
    console.error("[ldpay:notify] 支付未开启或缺少密钥配置");
    return new Response("fail");
  }

  const { pid, trade_no, out_trade_no, money, trade_status, sign } = params;

  // 参数完整性检查
  if (!out_trade_no || !trade_no || !money || !trade_status || !sign) {
    console.error("[ldpay:notify] 参数不完整", params);
    return new Response("fail");
  }

  // 签名验证（易支付兼容协议，MD5）
  if (!linuxdoVerify(params, cfg.key, sign)) {
    console.error(`[ldpay:notify] 签名验证失败 orderNo=${out_trade_no}`);
    return new Response("fail");
  }

  // 商户 ID 校验（防伪造）
  if (pid !== cfg.pid) {
    console.error(`[ldpay:notify] 商户 ID 不匹配 orderNo=${out_trade_no} pid=${pid}`);
    return new Response("fail");
  }

  // 订单查询 + 金额核对
  const order = await getOrderByNo(out_trade_no);
  if (!order) {
    console.error(`[ldpay:notify] 订单不存在 orderNo=${out_trade_no}`);
    return new Response("fail");
  }

  const paidAmount = parseFloat(money);
  if (Math.abs(paidAmount - order.amountCny) > 0.01) {
    console.error(
      `[ldpay:notify] 金额不符 orderNo=${out_trade_no} 期望=${order.amountCny} 实际=${paidAmount}`,
    );
    return new Response("fail");
  }

  // 支付状态（LinuxDO：TRADE_SUCCESS=支付成功）
  if (trade_status !== "TRADE_SUCCESS") {
    console.warn(`[ldpay:notify] 非成功状态 orderNo=${out_trade_no} status=${trade_status}`);
    return new Response("success"); // 非成功状态不重复处理，但返回 success 避免重试
  }

  // 幂等发放
  const result = await settleRechargeOrder(out_trade_no, trade_no, params);
  if (result.settled) {
    console.log(
      `[ldpay:notify] 充值成功 orderNo=${out_trade_no} userId=${result.userId} +${result.credits} cr`,
    );
  } else {
    // 订单已处理过（重复回调/已关闭）→ 幂等成功
    console.log(`[ldpay:notify] 重复/跳过回调 orderNo=${out_trade_no}`);
  }

  return new Response("success");
}

export async function GET(req: NextRequest) {
  const params: Record<string, string> = {};
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    params[key] = value;
  }
  return handle(params);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = String(value);
  }
  return handle(params);
}
