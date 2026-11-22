import fs from "node:fs";
import path from "node:path";
import { parseLuaSource } from "../../lib/kongming/lua";

const file = path.resolve(process.argv[2] ?? "public/game-assets/kongming/lua.json");
const pack = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
const failures: string[] = [];
const featureCounts = {
  function: 0,
  while: 0,
  repeat: 0,
  multiAssign: 0,
  indexAssign: 0,
  goto: 0,
};

for (const [name, source] of Object.entries(pack)) {
  if (/\bfunction\b/.test(source)) featureCounts.function++;
  if (/\bwhile\b/.test(source)) featureCounts.while++;
  if (/\brepeat\b/.test(source)) featureCounts.repeat++;
  if (/\bgoto\b/.test(source)) featureCounts.goto++;
  if (/^\s*[A-Za-z_]\w*\s*,\s*[A-Za-z_]\w*\s*=/m.test(source)) featureCounts.multiAssign++;
  if (/\[\s*[^\]]+\s*\]\s*=/m.test(source)) featureCounts.indexAssign++;

  try {
    parseLuaSource(source);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`scripts=${Object.keys(pack).length} parsed=${Object.keys(pack).length - failures.length} failed=${failures.length}`);
console.log(JSON.stringify(featureCounts));
if (failures.length) {
  console.log(failures.slice(0, 40).join("\n"));
  process.exitCode = 1;
}
