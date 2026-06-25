/**
 * 渠道适配器注册表
 * 动态加载各渠道适配器实例，提供工厂方法。
 */
import type { ChannelAdapter } from "./adapter";
import { OpenAIAdapter } from "./openai-adapter";
import { AnthropicAdapter } from "./anthropic-adapter";
import { CloudflareAdapter } from "./cloudflare-adapter";
import { DeepSeekAdapter } from "./deepseek-adapter";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter";

const registry = new Map<string, ChannelAdapter>();

/** 注册初始化 */
function init() {
  if (registry.size > 0) return;
  const adapters: ChannelAdapter[] = [
    new OpenAIAdapter(),
    new AnthropicAdapter(),
    new CloudflareAdapter(),
    new DeepSeekAdapter(),
    new OpenAICompatibleAdapter(),
  ];
  for (const a of adapters) {
    registry.set(a.type, a);
  }
}

/** 获取指定类型的适配器 */
export function getAdapter(type: string): ChannelAdapter | undefined {
  init();
  return registry.get(type);
}

/** 获取所有适配器实例 */
export function getAllAdapters(): ChannelAdapter[] {
  init();
  return Array.from(registry.values());
}

/** 渠道配置类型列表（供 UI 下拉使用） */
export const CHANNEL_TYPES = [
  { value: "cloudflare", label: "Cloudflare Workers AI" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai-compatible", label: "OpenAI 兼容 (通用)" },
] as const;

/** 各渠道类型的配置字段说明（供 UI 动态表单使用） */
export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export const CHANNEL_CONFIG_FIELDS: Record<string, ConfigField[]> = {
  openai: [
    { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-..." },
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
      required: false,
      placeholder: "https://api.openai.com/v1",
    },
    {
      key: "organizationId",
      label: "Organization ID",
      type: "text",
      required: false,
      placeholder: "org-...",
    },
  ],
  deepseek: [
    { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-..." },
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
      required: false,
      placeholder: "https://api.deepseek.com/v1",
    },
  ],
  "openai-compatible": [
    { key: "apiKey", label: "API Key", type: "password", required: false, placeholder: "sk-...（可选，部分网关免费模型无需）" },
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
      required: true,
      placeholder: "https://api.xxx.com/v1 或 https://ai-gateway.vercel.sh/v1",
    },
  ],
  anthropic: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "sk-ant-...",
    },
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
      required: false,
      placeholder: "https://api.anthropic.com/v1",
    },
    {
      key: "apiVersion",
      label: "API Version",
      type: "text",
      required: false,
      placeholder: "2023-06-01",
    },
  ],
  azure: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "...",
    },
    {
      key: "endpoint",
      label: "Endpoint",
      type: "text",
      required: true,
      placeholder: "https://<resource>.openai.azure.com",
    },
    {
      key: "deploymentName",
      label: "Deployment Name",
      type: "text",
      required: true,
      placeholder: "gpt-4",
    },
    {
      key: "apiVersion",
      label: "API Version",
      type: "text",
      required: false,
      placeholder: "2024-02-15-preview",
    },
  ],
  cloudflare: [
    {
      key: "accountId",
      label: "Account ID",
      type: "text",
      required: false,
      placeholder: "留空使用环境变量",
    },
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: false,
      placeholder: "留空使用环境变量",
    },
  ],
};

export type { ChannelAdapter };
