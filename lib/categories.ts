/**
 * Model category model — shared between the Cloudflare catalog sync
 * (lib/cloudflare/catalog.ts) and the UI navigation / model browser.
 *
 * Cloudflare Workers AI exposes a `task` field per model (e.g. "Text Generation").
 * We normalize those raw task names into the product categories below so the UI
 * can group ~78 models into a small set of functional areas.
 */

export type CategoryId =
  | "text"
  | "image"
  | "vision"
  | "speech"
  | "embeddings"
  | "translate"
  | "classify"
  | "video";

export interface Category {
  id: CategoryId;
  /** Display label (Chinese-first, the product's primary locale). */
  label: string;
  /** Short English key, also used in the playground route segment. */
  slug: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /** Raw Cloudflare `task` values that map into this category. */
  tasks: string[];
  /** Playground route, or null when there is no interactive page yet. */
  route: string | null;
  /** Marks categories with no native Cloudflare support (e.g. video). */
  comingSoon?: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "text",
    label: "文本生成",
    slug: "text",
    description: "大语言模型对话、推理、代码、函数调用",
    icon: "MessageSquare",
    tasks: ["Text Generation"],
    route: "/playground/text",
  },
  {
    id: "image",
    label: "文生图",
    slug: "image",
    description: "由文本描述生成图像（FLUX 等）",
    icon: "Image",
    tasks: ["Text-to-Image"],
    route: "/playground/image",
  },
  {
    id: "vision",
    label: "图像理解",
    slug: "vision",
    description: "看图问答、图像描述、视觉推理",
    icon: "Eye",
    tasks: ["Image-to-Text"],
    route: "/playground/vision",
  },
  {
    id: "speech",
    label: "语音",
    slug: "speech",
    description: "语音转文本（Whisper）与文本转语音（MeloTTS）",
    icon: "Mic",
    tasks: ["Automatic Speech Recognition", "Text-to-Speech"],
    route: "/playground/speech",
  },
  {
    id: "embeddings",
    label: "嵌入",
    slug: "embeddings",
    description: "文本向量化，用于检索、聚类、RAG",
    icon: "Boxes",
    tasks: ["Text Embeddings"],
    route: "/playground/embeddings",
  },
  {
    id: "translate",
    label: "翻译",
    slug: "translate",
    description: "多语种机器翻译",
    icon: "Languages",
    tasks: ["Translation"],
    route: "/playground/translate",
  },
  {
    id: "classify",
    label: "分类/检测",
    slug: "classify",
    description: "文本分类、图像分类、目标检测、摘要",
    icon: "Tags",
    tasks: [
      "Text Classification",
      "Image Classification",
      "Object Detection",
      "Summarization",
    ],
    route: null,
  },
  {
    id: "video",
    label: "视频生成",
    slug: "video",
    description: "Cloudflare 原生暂不支持，规划接入第三方",
    icon: "Clapperboard",
    tasks: [],
    route: "/playground/video",
    comingSoon: true,
  },
];

const TASK_TO_CATEGORY: Record<string, CategoryId> = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.tasks.map((t) => [t.toLowerCase(), c.id])),
);

/** Map a raw Cloudflare `task` string to one of our category ids. */
export function categoryForTask(task: string | undefined | null): CategoryId {
  if (!task) return "text";
  return TASK_TO_CATEGORY[task.toLowerCase()] ?? "classify";
}

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}
