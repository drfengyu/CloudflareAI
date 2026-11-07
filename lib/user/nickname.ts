/** 昵称统一入口：去首尾空白、合并中间空白，最长 20 个字符（按码点计）。 */
export function normalizeNickname(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("昵称不能为空");
  if ([...name].length > 20) throw new Error("昵称最多 20 个字符");
  return name;
}
