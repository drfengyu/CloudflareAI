/**
 * Cloudflare REST 调用的统一出口。
 *
 * Vercel 上的每次渲染都要跨网络打 api.cloudflare.com，链路抖动（连接被掐、5xx、429）
 * 在冷启动时尤其常见。裸 fetch 会一直挂着，直到整页渲染超时——所以这里给每个请求加超时，
 * 并只对「重复执行没有副作用」的读请求做有限重试。
 */

/** 只有这些状态值得重试：限流与网关类错误，重试后通常能成。 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** 读请求 5s：单条 D1 正常 350~500ms、尖峰 1.2~2.2s，5s 还没回来就是链路挂了。 */
const READ_TIMEOUT_MS = 5_000;
/** 写请求放宽到 20s：D1 提交慢一点也要给它跑完，避免误判失败后用户重复扣费。 */
const WRITE_TIMEOUT_MS = 20_000;

/**
 * 读重试 1 次：最坏 5 + 0.2 + 5 ≈ 10s。重试次数是乘法——一条页面里 9 个并发查询各自
 * 重试两次的话，首屏能挂到半分钟，那正是「首次进入加载失败」的形态，所以只给一次机会。
 */
const READ_RETRIES = 1;
const WRITE_RETRIES = 0;

export interface CfRequestInit extends Omit<RequestInit, "signal"> {
  /** 出现在错误信息里，便于定位是哪一类调用挂了。 */
  label?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function once(url: string, init: CfRequestInit, timeoutMs: number): Promise<Response> {
  const { label = "Cloudflare", ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} 请求超时（${timeoutMs}ms 未响应）`);
    }
    // undici 只会说 "fetch failed"，真正的原因在 cause 里，不带上就无法从日志定位
    const cause = (error as { cause?: { message?: string } })?.cause?.message;
    throw cause ? new Error(`${label} 连接失败：${cause}`) : error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param writable false=读（可重试），true=写（只超时，绝不自动重试）
 */
export async function cfRequest(
  url: string,
  init: CfRequestInit,
  writable: boolean,
): Promise<Response> {
  const timeoutMs = writable ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS;
  const retries = writable ? WRITE_RETRIES : READ_RETRIES;

  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let error: unknown = null;
    try {
      res = await once(url, init, timeoutMs);
    } catch (e) {
      error = e;
    }

    const retryable =
      res !== null ? RETRYABLE_STATUS.has(res.status) : true;
    if (!retryable || attempt >= retries) {
      if (error) throw error;
      if (!res) throw new Error("Cloudflare 请求未产生响应");
      return res;
    }

    // 状态类失败要先把响应体读空，连接才能回收
    if (res) await res.body?.cancel().catch(() => {});
    await sleep(200 * 2 ** attempt);
  }
}
