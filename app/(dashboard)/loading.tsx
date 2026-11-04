import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 段级加载骨架：让响应立刻开始流式，页面数据（要打多次 Cloudflare REST）在边界里慢慢补，
 * 而不是把整个连接吊在那里等首字节。
 */
export default function DashboardLoading() {
  return (
    <PageBody>
      <div className="space-y-2 py-1 text-center">
        <Skeleton className="mx-auto h-7 w-44" />
        <Skeleton className="mx-auto h-3 w-64" />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <Skeleton className="h-4 w-28" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </PageBody>
  );
}
