"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { PageBody } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** 发新版后，旧页面按旧哈希去取代码块会 404，报错文案有这几种形态。 */
const CHUNK_ERROR =
  /ChunkLoadError|Loading (?:CSS )?chunk|dynamically imported module|Importing a module script failed/i;

/** 同一个会话里只自动刷新一次，避免「刷新→还是坏块→再刷新」的死循环。 */
const RELOAD_KEY = "cfai-chunk-reloaded-at";
const RELOAD_COOLDOWN_MS = 15_000;

function lastReloadAt(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function markReload(at: number): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(at));
  } catch {
    // 无痕模式下写不进去，最多就是少一层防循环
  }
}

/**
 * 段级错误边界。
 *
 * 数据全在 Cloudflare，Vercel 侧一次抖动就会让服务端组件抛错；更要紧的是每次发版后，
 * 用户手里那批旧页面引用的代码块已经不存在了。这里对代码块失败直接整页刷新一次，
 * 让浏览器重新拿新版 HTML；其余错误交给带「重试」按钮的界面。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError = CHUNK_ERROR.test(error?.message ?? "") || CHUNK_ERROR.test(String(error?.stack ?? ""));

  useEffect(() => {
    if (!isChunkError) return;
    const now = Date.now();
    if (now - lastReloadAt() < RELOAD_COOLDOWN_MS) return;
    markReload(now);
    window.location.reload();
  }, [isChunkError]);

  if (isChunkError) {
    // 正在自动刷新，别把错误页闪给用户看
    return null;
  }

  return (
    <PageBody width="reading">
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-4 text-base font-medium">这一页没能加载出来</p>
          <p className="mx-auto mt-2 max-w-md text-sm font-light text-muted-foreground">
            读取数据时连接中断或超时了，重试一次通常就好了。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={reset}>
              <RotateCw className="h-4 w-4" />
              重试
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
          </div>
          {error?.digest ? (
            <p className="mt-4 text-[11px] text-muted-foreground">编号 {error.digest}</p>
          ) : null}
        </CardContent>
      </Card>
    </PageBody>
  );
}
