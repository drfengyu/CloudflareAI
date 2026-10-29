import Link from "next/link";
import { ArrowRight, BookOpen, KeyRound, Boxes } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { getRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const EXAMPLE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium">{title}</span>
        <CopyButton value={code} label="复制" />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default async function DocsPage() {
  const origin = await getRequestOrigin();
  const openaiBase = `${origin}/v1`;

  const curlChat = `curl ${openaiBase}/chat/completions \\
  -H "Authorization: Bearer $CFAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${EXAMPLE_MODEL}",
    "messages": [{"role": "user", "content": "用一个词形容云计算"}]
  }'`;

  const pythonOpenai = `from openai import OpenAI

client = OpenAI(
    api_key="sk-cfai-xxxxxxxx",
    base_url="${openaiBase}",
)

resp = client.chat.completions.create(
    model="${EXAMPLE_MODEL}",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)`;

  const pythonAnthropic = `import anthropic

client = anthropic.Anthropic(
    api_key="sk-cfai-xxxxxxxx",
    base_url="${origin}",
)

message = client.messages.create(
    model="${EXAMPLE_MODEL}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "你好"}],
)
print(message.content[0].text)`;

  const curlEmbeddings = `curl ${openaiBase}/embeddings \\
  -H "Authorization: Bearer $CFAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "@cf/baai/bge-m3", "input": ["你好，世界"]}'`;

  const envConfig = `# Claude Code / Anthropic 客户端
export ANTHROPIC_BASE_URL="${origin}"
export ANTHROPIC_AUTH_TOKEN="sk-cfai-xxxxxxxx"

# 任意 OpenAI 兼容客户端
export OPENAI_BASE_URL="${openaiBase}"
export OPENAI_API_KEY="sk-cfai-xxxxxxxx"`;

  return (
    <>
      <PageHeader
        title="API 接入指南"
        description="兼容 OpenAI 与 Anthropic 协议，替换 base_url 即可接入"
      />
      <div className="max-w-5xl space-y-4 p-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/keys"
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <KeyRound className="h-4 w-4 text-primary" />
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              1. 创建 API 密钥
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              生成 sk-cfai- 密钥，可限制额度、模型与 IP
            </p>
          </Link>
          <Link
            href="/models"
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <Boxes className="h-4 w-4 text-primary" />
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              2. 选择模型
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              模型 ID 直接填在请求体的 model 字段里
            </p>
          </Link>
          <Link
            href="/pricing"
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <BookOpen className="h-4 w-4 text-primary" />
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              3. 查看价格
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              按 cr 计费，失败的调用不计费
            </p>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">接入信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                OpenAI 兼容 base_url
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  {openaiBase}
                </code>
                <CopyButton value={openaiBase} />
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Anthropic 兼容 base_url
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  {origin}
                </code>
                <CopyButton value={origin} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              鉴权：<code className="font-mono">Authorization: Bearer sk-cfai-…</code>
              （Anthropic 端点也接受 <code className="font-mono">x-api-key</code>）。
              网关路径没有 <code className="font-mono">/api</code> 前缀。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">支持的端点</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">方法</th>
                    <th className="py-2 pr-4 font-medium">路径</th>
                    <th className="py-2 pr-4 font-medium">协议</th>
                    <th className="py-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2 pr-4 font-mono">GET</td>
                    <td className="py-2 pr-4 font-mono">/v1/models</td>
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 text-muted-foreground">
                      模型列表（公开，无需鉴权）
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">POST</td>
                    <td className="py-2 pr-4 font-mono">/v1/chat/completions</td>
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 text-muted-foreground">
                      对话补全，支持流式
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">POST</td>
                    <td className="py-2 pr-4 font-mono">/v1/messages</td>
                    <td className="py-2 pr-4">Anthropic</td>
                    <td className="py-2 text-muted-foreground">
                      Claude Code 等 Anthropic 客户端
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">POST</td>
                    <td className="py-2 pr-4 font-mono">/v1/embeddings</td>
                    <td className="py-2 pr-4">OpenAI</td>
                    <td className="py-2 text-muted-foreground">文本向量</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">调用示例</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeBlock title="curl · chat completions" code={curlChat} />
            <CodeBlock title="Python · OpenAI SDK" code={pythonOpenai} />
            <CodeBlock title="Python · Anthropic SDK" code={pythonAnthropic} />
            <CodeBlock title="curl · embeddings" code={curlEmbeddings} />
            <p className="text-xs text-muted-foreground">
              流式输出在请求体里加{" "}
              <code className="font-mono">&quot;stream&quot;: true</code>，响应为 SSE。
              示例中的模型 ID 仅作演示，实际可用模型以{" "}
              <Link href="/models" className="text-primary hover:underline">
                模型库
              </Link>{" "}
              为准。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">客户端环境变量</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock title="Shell" code={envConfig} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">错误码</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">状态码</th>
                    <th className="py-2 font-medium">含义</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2 pr-4 font-mono">400</td>
                    <td className="py-2 text-muted-foreground">
                      请求体不合法（字段缺失或类型错误）
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">401</td>
                    <td className="py-2 text-muted-foreground">
                      API Key 缺失、无效、被禁用或已过期
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">402</td>
                    <td className="py-2 text-muted-foreground">
                      余额不足，错误信息里带本次预检需要的 cr
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">403</td>
                    <td className="py-2 text-muted-foreground">
                      模型不在该 Key 的白名单内
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">429</td>
                    <td className="py-2 text-muted-foreground">
                      请求过快（每用户每分钟 60 次）
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono">500</td>
                    <td className="py-2 text-muted-foreground">
                      上游模型或网关内部错误
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              成功调用按 token 数从余额扣 cr；失败调用不计费。用量可在{" "}
              <Link href="/history" className="text-primary hover:underline">
                使用记录
              </Link>{" "}
              查看，余额与充值在{" "}
              <Link href="/wallet" className="text-primary hover:underline">
                我的钱包
              </Link>
              。
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
