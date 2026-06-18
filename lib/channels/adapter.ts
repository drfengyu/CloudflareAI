/**
 * 渠道适配器接口
 */
export interface ChannelAdapter {
  id: string;
  name: string;
  type: string;
  route(path: string, request: Request, context: Record<string, unknown>): Promise<Response>;
  healthCheck?(context: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;
  listModels?(context: Record<string, unknown>): Promise<{ id: string; object: string }[]>;
}

export type { ChannelAdapter as ChannelAdapterType };
