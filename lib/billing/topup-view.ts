/**
 * 钱包「充值记录」的展示结构。服务端组件、server action 与客户端卡片共用，
 * 这里只放纯数据转换，不要引入 db 等仅服务端可用的依赖。
 */

export const TOPUP_PAGE_SIZE = 10;

export interface SerializedTopup {
  id: string;
  type: number;
  amount: number;
  description: string | null;
  createdAt: string;
}

export function serializeTopup(record: {
  id: string;
  type: number;
  amount: number;
  description: string | null;
  createdAt: Date | null;
}): SerializedTopup {
  return {
    id: record.id,
    type: record.type,
    amount: record.amount,
    description: record.description ?? null,
    createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
  };
}
