// 把桌面版解包出的 536 个剧情 Lua 脚本生成运行时可直接引用的结构化数据。
// 用法：node scripts/generate-tstd2-runtime-story.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const root = process.cwd();
const scriptDir = join(root, "assets", "tstd2-reference", "scripts");
const outFile = join(root, "lib", "trial", "saga", "tstd2-story.ts");

const CHAPTER_MARKS = [
  [11050, 2],
  [12200, 3],
  [13015, 4],
  [14107, 5],
  [16000, 6],
  [16090, 7],
  [17050, 8],
];

function chapterOf(name) {
  const n = Number(String(name).replace(/\.lua$/i, "").split("_")[0]);
  if (!Number.isFinite(n)) return 0;
  if (n >= 50000 && n < 60000) return 5;
  if (n >= 60000 && n < 70000) return 6;
  if (n >= 11000 && n < 19000) {
    let chapter = 1;
    for (const [mark, value] of CHAPTER_MARKS) if (n >= mark) chapter = value;
    return chapter;
  }
  return 0;
}

function decodeLua(text) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\r/g, "");
}

function parseScript(file) {
  const source = readFileSync(file, "utf8");
  const id = basename(file, ".lua");
  const firstComment = source.match(/^\s*--\s*(.+)$/m)?.[1]?.trim() ?? "";
  const lines = [];
  const talkRe = /Talk(?:Ask)?\s*\(\s*(\d+)\s*,\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  for (const match of source.matchAll(talkRe)) {
    const speaker = Number(match[1]) || 0;
    const text = decodeLua(match[2] ?? match[3] ?? "").trim();
    if (text) lines.push({ speaker, text });
  }
  return {
    id,
    title: firstComment.slice(0, 96) || `剧情脚本 ${id}`,
    chapter: chapterOf(id),
    lines,
  };
}

const files = readdirSync(scriptDir).filter((name) => name.endsWith(".lua"));
const scripts = files
  .map((name) => parseScript(join(scriptDir, name)))
  .sort((a, b) => {
    const an = Number(a.id.split("_")[0]);
    const bn = Number(b.id.split("_")[0]);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.id.localeCompare(b.id);
  });

const compact = scripts.map((script) => ({
  id: script.id,
  title: script.title,
  chapter: script.chapter,
  lines: script.lines.map((line) => [line.speaker, line.text]),
}));

const totalLines = compact.reduce((sum, script) => sum + script.lines.length, 0);
const generated = `// 由 scripts/generate-tstd2-runtime-story.mjs 自动生成，请勿手改。
// 数据来源：桌面版《吞食天地2》民间改版解包的 536 个剧情 Lua 脚本。
import type { SagaDialogueLine, SagaSpeakerSide } from "./story";

export type Tstd2TerrainId =
  | "city" | "pass" | "tomb" | "tunnel" | "camp" | "mountain" | "rock" | "canyon"
  | "plain" | "forest" | "cave" | "cave-peach" | "cave-purple" | "cave-green"
  | "cave-blue" | "cave-red" | "cave-yellow" | "sea" | "stone-array" | "wasteland";

export interface Tstd2StoryScript {
  id: string;
  title: string;
  chapter: number;
  lines: [number, string][];
}

export const TSTD2_STORY: Tstd2StoryScript[] = ${JSON.stringify(compact, null, 0).replace(/\},\{/g, "},\n{")};

export const TSTD2_SCRIPT_COUNT = ${compact.length};
export const TSTD2_LINE_COUNT = ${totalLines};

export const TSTD2_CHAPTER_LABEL: Record<number, string> = {
  0: "其他 / 系统",
  1: "第一章 · 徐州讨袁术",
  2: "第二章 · 冀州白马",
  3: "第三章 · 卧龙出山",
  4: "第四章 · 赤壁之战",
  5: "第五章 · 荆南四郡",
  6: "第六章 · 西川归心",
  7: "第七章 · 北伐中原",
  8: "第八章 · 五丈原",
};

export const TSTD2_CHAPTER_TERRAIN: Record<number, Tstd2TerrainId> = {
  0: "plain",
  1: "plain",
  2: "wasteland",
  3: "forest",
  4: "sea",
  5: "canyon",
  6: "mountain",
  7: "stone-array",
  8: "city",
};

export function tstd2ScriptsForChapter(chapter: number): Tstd2StoryScript[] {
  return TSTD2_STORY.filter((script) => script.chapter === chapter && script.lines.length > 0);
}

/** 取原版章节台词；只做演出，不参与战斗结算。 */
export function tstd2ChapterSceneLines(
  chapter: number,
  limit: number,
  fromEnd = false,
): { title: string; speaker: number; text: string }[] {
  const scripts = tstd2ScriptsForChapter(chapter);
  const picked = fromEnd ? scripts.slice(-6).reverse() : scripts.slice(0, 8);
  const rows: { title: string; speaker: number; text: string }[] = [];
  for (const script of picked) {
    for (const line of script.lines) {
      rows.push({ title: script.title, speaker: line[0], text: line[1] });
    }
  }
  const chosen = fromEnd ? rows.slice(0, limit) : rows.slice(0, limit);
  return chosen;
}

/** 把原版台词转成现有对话浮层能吃的结构。 */
export function tstd2DialogueLines(
  chapter: number,
  limit: number,
  fromEnd = false,
): SagaDialogueLine[] {
  return tstd2ChapterSceneLines(chapter, limit, fromEnd).map((line) => ({
    speaker: line.title.replace(/^第[一二三四五六七八]章\\s*/, "") || "原版剧情",
    text: line.text,
    side: (line.speaker === 1 ? "hero" : "narrator") as SagaSpeakerSide,
  }));
}
`;

writeFileSync(outFile, generated, "utf8");
console.log(`generated ${compact.length} scripts / ${totalLines} lines -> ${outFile} (${statSync(outFile).size} bytes)`);
