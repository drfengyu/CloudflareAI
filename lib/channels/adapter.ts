/**
 * 渠道适配器接口
 */

/** 来自上游的模型元数据（扩展 OpenAI /models 标准字段） */
export interface UpstreamModel {
  id: string;
  object: string;
  /** 友好名称（如 'Qwen3-14B'） */
  name?: string;
  /** 模型描述 */
  description?: string;
  /** 类型：language / embedding / image / speech / transcription / video / reranking / realtime */
  type?: string;
  /** 厂商（如 'alibaba', 'openai'） */
  owned_by?: string;
  /** 上下文窗口（token 数） */
  context_window?: number;
  /** 单次输出 token 上限 */
  max_tokens?: number;
  /** 能力标签（如 ['reasoning', 'tool-use']） */
  tags?: string[];
  /** 定价（每 token 美元） */
  pricing?: {
    input?: string;
    output?: string;
  };
}

export interface ChannelAdapter {
  id: string;
  name: string;
  type: string;
  route(path: string, request: Request, context: Record<string, unknown>): Promise<Response>;
  healthCheck?(context: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;
  listModels?(context: Record<string, unknown>): Promise<UpstreamModel[]>;
}

export type { ChannelAdapter as ChannelAdapterType };
