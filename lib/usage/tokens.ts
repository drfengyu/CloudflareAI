/**
 * Token 估算工具。
 *
 * 用于在「上游不返回真实 usage」时估算输入 token 数（主要是嵌入模型）。
 * 嵌入模型（BGE 等）的响应只含向量，不含 token 计数，因此这里的估算
 * 直接决定计费 token 数，必须尽量贴近真实分词结果。
 *
 * 经验法则：
 *   - 拉丁/ASCII 文本约 4 个字符 ≈ 1 token
 *   - CJK（中日韩）字符约 1 个字符 ≈ 1 token（分词器通常按字切）
 *
 * 旧实现用 `text.length * 1.5`，方向完全相反——token 永远少于字符数，
 * 该公式对英文会高估约 6 倍。这里按字符类别分别加权。
 */

const CJK_RE =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ가-힯]/g;

/** 估算单段文本的 token 数。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkCount = (text.match(CJK_RE) || []).length;
  const nonCjkCount = text.length - cjkCount;
  // CJK ≈ 1 token/字，其余 ≈ 1 token/4 字符
  return Math.max(1, Math.ceil(cjkCount + nonCjkCount / 4));
}

/** 估算多段文本的 token 总数。 */
export function estimateTokensTotal(texts: string[]): number {
  return texts.reduce((sum, t) => sum + estimateTokens(t), 0);
}
