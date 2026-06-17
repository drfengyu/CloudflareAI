import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { getDisplayPrice } from "@/lib/billing/display-price";
import { getAllModelPricing } from "@/lib/billing/model-pricing";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [models, pricingMap] = await Promise.all([
    fetchModelCatalog(),
    getAllModelPricing(),
  ]);

  // 按类别分组，并按价格从低到高排序
  const sortByPrice = (modelsInCategory: typeof models) => {
    return modelsInCategory.sort((a, b) => {
      const priceA = getDisplayPrice(a, pricingMap);
      const priceB = getDisplayPrice(b, pricingMap);
      // 处理 null 值（排到最后）
      if (priceA.credits === null) return 1;
      if (priceB.credits === null) return -1;
      return priceA.credits - priceB.credits;
    });
  };

  const categories = {
    text: sortByPrice(models.filter((m) => m.category === "text")),
    image: sortByPrice(models.filter((m) => m.category === "image")),
    vision: sortByPrice(models.filter((m) => m.category === "vision")),
    embeddings: sortByPrice(models.filter((m) => m.category === "embeddings")),
    translate: sortByPrice(models.filter((m) => m.category === "translate")),
    speech: sortByPrice(models.filter((m) => m.category === "speech")),
    video: sortByPrice(models.filter((m) => m.category === "video")),
  };

  const categoryNames = {
    text: "文本生成",
    image: "图像生成",
    vision: "图像理解",
    embeddings: "嵌入向量",
    translate: "翻译",
    speech: "语音",
    video: "视频",
  };

  return (
    <>
      <PageHeader
        title="定价"
        description="所有模型的实际计费价格"
      />

      <div className="space-y-8 p-8">
        {/* 定价说明 */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5" />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-primary">定价说明</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• <strong>文本模型</strong>：按 token 计费，价格单位为「每百万 token」</li>
                  <li>• <strong>图像模型</strong>：固定价格，价格单位为「每张图片」</li>
                  <li>• <strong>Credits 换算</strong>：1 credit = $1 USD</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 各类别定价表 */}
        {Object.entries(categories).map(([key, categoryModels]) => {
          if (categoryModels.length === 0) return null;

          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-base">
                  {categoryNames[key as keyof typeof categoryNames]} ({categoryModels.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 text-left font-medium text-muted-foreground">模型</th>
                        <th className="py-2 text-left font-medium text-muted-foreground">来源</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">价格</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryModels.map((model) => {
                        const price = getDisplayPrice(model, pricingMap);

                        return (
                          <tr key={model.id} className="border-b border-border/50 last:border-0">
                            <td className="py-3">
                              <div>
                                <p className="font-medium">{model.name}</p>
                                <code className="text-xs text-muted-foreground">{model.id}</code>
                              </div>
                            </td>
                            <td className="py-3">
                              <Badge tone={model.source === "hosted" ? "warning" : "success"}>
                                {model.source}
                              </Badge>
                            </td>
                            <td className="py-3 text-right">
                              {price.usd !== null ? (
                                <div>
                                  <p className="font-medium">${price.usd.toFixed(2)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {price.credits?.toLocaleString()} cr
                                  </p>
                                  <p className="text-xs text-muted-foreground">/ {price.unit}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
