import { NextRequest } from "next/server";
import { getEpayConfig, epayVerify } from "@/lib/payment/epay";
import { getOrderByNo, settleRechargeOrder } from "@/lib/payment/order";

export const dynamic = "force-dynamic";

/**
 * 易支付异步通知回调。
 * 易支付会 POST 表单参数，必须返回纯文本 "success" 才算处理成功，否则会重试。
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = String(value);
  }

  const cfg = await getEpayConfig();
  if (!cfg.enabled || !cfg.key) {
    console.error("[epay:notify] 支付未开启或缺少密钥配置");
    return new Response("fail");
  }

  const { pid, trade_no, out_trade_no, type, name, money, trade_status, sign } = params;

  // 参数完整性检查
  if (!out_trade_no || !trade_no || !money || !trade_status || !sign) {
    console.error("[epay:notify] 参数不完整", params);
    return new Response("fail");
  }

  // 签名验证
  if (!epayVerify(params, cfg.key, sign)) {
    console.error(`[epay:notify] 签名验证失败 orderNo=${out_trade_no}`);
    return new Response("fail");
  }

  // 商户 ID 校验（防伪造）
  if (pid !== cfg.pid) {
    console.error(`[epay:notify] 商户 ID 不匹配 orderNo=${out_trade_no} pid=${pid}`);
    return new Response("fail");
  }

  // 订单查询 + 金额核对
  const order = await getOrderByNo(out_trade_no);
  if (!order) {
    console.error(`[epay:notify] 订单不存在 orderNo=${out_trade_no}`);
    return new Response("fail");
  }

  const paidAmount = parseFloat(money);
  if (Math.abs(paidAmount - order.amountCny) > 0.01) {
    console.error(
      `[epay:notify] 金额不符 orderNo=${out_trade_no} 期望=${order.amountCny} 实际=${paidAmount}`,
    );
    return new Response("fail");
  }

  // 支付状态（易支付：TRADE_SUCCESS=支付成功）
  if (trade_status !== "TRADE_SUCCESS") {
    console.warn(`[epay:notify] 非成功状态 orderNo=${out_trade_no} status=${trade_status}`);
    return new Response("success"); // 非成功状态不重复处理，但返回 success 避免重试
  }

  // 幂等发放
  const result = await settleRechargeOrder(out_trade_no, trade_no, params);
  if (result.settled) {
    console.log(
      `[epay:notify] 充值成功 orderNo=${out_trade_no} userId=${result.userId} +${result.credits} cr`,
    );
  } else {
    // 订单已处理过（重复回调/已关闭）→ 幂等成功
    console.log(`[epay:notify] 重复/跳过回调 orderNo=${out_trade_no}`);
  }

  return new Response("success");
}
