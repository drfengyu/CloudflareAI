import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeNickname } from "../lib/user/nickname";

test("昵称去首尾空白并合并中间空白", () => {
  assert.equal(normalizeNickname("  小明  "), "小明");
  assert.equal(normalizeNickname("小  明\t同学"), "小 明 同学");
});

test("空昵称与超长昵称拒绝保存", () => {
  assert.throws(() => normalizeNickname("   "), /昵称不能为空/);
  assert.throws(() => normalizeNickname("一二三四五六七八九十一二三四五六七八九十一"), /最多 20 个字符/);
});

test("长度按字符数而不是 UTF-16 码元算", () => {
  assert.equal(normalizeNickname("🙂".repeat(20)), "🙂".repeat(20));
  assert.throws(() => normalizeNickname("🙂".repeat(21)), /最多 20 个字符/);
});
