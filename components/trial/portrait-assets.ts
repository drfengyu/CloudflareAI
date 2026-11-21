/**
 * 吞食天地（Destiny of an Emperor）武将头像素材索引。
 *
 * 素材来自 GitHub 仓库 `mooneroid/rotj`（MIT）内的 `data/images/doae_portraits/Portrait 48`，
 * 原始出处为 Kongming's Archives 的吞食天地头像包（非商业使用、请勿声称原创）。
 * 文件已按本作武将 id 重命名放在 `public/trial/portraits/<id>.gif`，
 * 没有收录到的武将仍然使用 `portraits.ts` 里现画的立绘。
 */
export const SAGA_PORTRAIT_IDS: readonly string[] = [
  "caocao",   "caohong",   "caoren",   "caozhen",   "caimao",   "chezhou",
  "chengpu",   "chengyuanzhi",   "chenlan",   "dianwei",   "dingfeng",   "dongzhuo",
  "fazheng",   "ganning",   "gaolan",   "guosi",   "guanping",   "guanxing",
  "guanyu",   "guojia",   "handang",   "haozhao",   "houcheng",   "huanggai",
  "huangzhong",   "huaxiong",   "huzhen",   "jiangwei",   "jiling",
  "jushou",   "leibo",   "lengbao",   "lidian",   "lijue",   "lingtong",
  "liru",   "lisu",   "liubei",   "liukui",   "liuxun",   "liyan",   "liuzhang",
  "lusu",   "lvbu",   "lvmeng",   "machao",   "madai",   "mengda",
  "pangde",   "pangtong",   "shenpei",   "simayi",   "songxian",   "sunjian",
  "sunquan",   "taishici",   "tianfeng",   "wangshuang",   "wenchou",   "weixu",
  "weiyan",   "wuyi",   "xiahoudun",   "xiahouyuan",   "xuchu",   "xuhuang",
  "xunyu",   "xusheng",   "yanliang",   "yanyan",   "yuanshang",   "yuanshao",
  "yuanshu",   "yuanxi",   "yujin",   "zhangbao",   "zhangfei",   "zhanghe",
  "zhangji",   "zhangjiao",   "zhangliang",   "zhangliao",   "zhangren",   "zhangxun",
  "zhaoyun",   "zhoucang",   "zhoutai",   "zhouyu",   "zhugeliang",
];

const PORTRAIT_ID_SET = new Set<string>(SAGA_PORTRAIT_IDS);

export const SAGA_PORTRAIT_BASE = "/trial/portraits";

/** 该武将是否有吞食天地头像素材。 */
export function hasPortraitAsset(id?: string | null): boolean {
  return !!id && PORTRAIT_ID_SET.has(id);
}

/** 头像素材的 URL；没有素材返回 null。 */
export function portraitAssetSrc(id?: string | null): string | null {
  return hasPortraitAsset(id) ? `${SAGA_PORTRAIT_BASE}/${id}.gif` : null;
}

const assetCache = new Map<string, HTMLImageElement | "pending" | "failed">();

/**
 * 战场大立绘用的图片缓存：第一次访问时开始加载，加载好之后直接返回。
 * 只读浏览器环境，服务端渲染阶段一律返回 null，由程序化立绘兜底。
 */
export function portraitAssetImage(id: string): HTMLImageElement | null {
  if (typeof window === "undefined" || !hasPortraitAsset(id)) return null;
  const cached = assetCache.get(id);
  if (cached === "failed") return null;
  if (cached && cached !== "pending") return cached;
  if (!cached) {
    const image = new window.Image();
    image.decoding = "async";
    image.src = `${SAGA_PORTRAIT_BASE}/${id}.gif`;
    assetCache.set(id, "pending");
    image.onload = () => assetCache.set(id, image);
    image.onerror = () => assetCache.set(id, "failed");
    return null;
  }
  return null;
}
