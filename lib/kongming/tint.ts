export interface ModelPalette {
  first: number[];
  second: number[];
  use3?: boolean;
  three?: number[];
  name?: string;
  texture?: string;
}

const cache = new Map<string, Promise<string>>();

function colorKey(palette: ModelPalette) {
  return `${palette.first?.join(",")}|${palette.second?.join(",")}|${palette.three?.join(",")}`;
}

/**
 * 原版 UI/CharacterModel 的着色逻辑：贴图是黑白遮罩，
 * 白色像素写入 _FirstColor，黑色像素写入 _SecondColor，肤色等其它像素原样保留。
 * 用 canvas 逐像素替换，保留原版 1:1 像素边缘，不做插值。
 */
export async function tintSprite(src: string, palette: ModelPalette): Promise<string> {
  if (typeof window === "undefined" || !palette.first || !palette.second) return src;
  const key = `${src}|${colorKey(palette)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const task = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(src);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        const first = palette.first;
        const second = palette.second;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 248 && g > 248 && b > 248) {
            data[i] = Math.round(first[0] * 255);
            data[i + 1] = Math.round(first[1] * 255);
            data[i + 2] = Math.round(first[2] * 255);
          } else if (r < 8 && g < 8 && b < 8) {
            data[i] = Math.round(second[0] * 255);
            data[i + 1] = Math.round(second[1] * 255);
            data[i + 2] = Math.round(second[2] * 255);
          }
        }
        ctx.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  cache.set(key, task);
  return task;
}
