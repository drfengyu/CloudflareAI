/**
 * 「在线充值订单」卡片的展示结构。服务端组件、server action 与客户端卡片共用，
 * 这里只放纯数据转换，不要引入 db 等仅服务端可用的依赖。
 */

export const PAY_ORDER_PAGE_SIZE = 10;

export interface SerializedPayOrder {
  orderNo: string;
  amountCny: number;
  credits: number;
  status: number;
  channel: string | null;
  paidAt: string | null;
  createdAt: string;
}

export function serializePayOrder(order: {
  orderNo: string;
  amountCny: number;
  credits: number;
  status: number;
  channel: string | null;
  paidAt: Date | null;
  createdAt: Date | null;
}): SerializedPayOrder {
  return {
    orderNo: order.orderNo,
    amountCny: order.amountCny,
    credits: order.credits,
    status: order.status,
    channel: order.channel ?? null,
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    createdAt: new Date(order.createdAt ?? Date.now()).toISOString(),
  };
}
