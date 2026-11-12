/**
 * 每日试炼的题目生成（纯函数）。
 *
 * 只出整数四则与两步混合，答案均为 0 ~ 999 的整数：判分不涉及浮点误差，
 * 用户心算也能在几十秒内完成。题型权重固定写在这里，避免后台配置出一堆超纲题。
 */

export interface TrialQuestionSeed {
  prompt: string;
  answer: number;
}

type Random = () => number;

function int(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick(random: Random, min: number, max: number): number {
  return int(random, min, max);
}

function buildQuestion(random: Random): TrialQuestionSeed {
  const kind = pick(random, 1, 4);
  if (kind === 1) {
    const a = pick(random, 12, 89);
    const b = pick(random, 12, 89);
    return { prompt: `${a} + ${b} = ?`, answer: a + b };
  }
  if (kind === 2) {
    const a = pick(random, 40, 160);
    const b = pick(random, 11, 39);
    return { prompt: `${a} − ${b} = ?`, answer: a - b };
  }
  if (kind === 3) {
    const a = pick(random, 3, 12);
    const b = pick(random, 3, 9);
    return { prompt: `${a} × ${b} = ?`, answer: a * b };
  }
  // 两步混合：先乘后加，结果不超过三位数。
  const a = pick(random, 2, 9);
  const b = pick(random, 2, 9);
  const c = pick(random, 3, 40);
  return { prompt: `${a} × ${b} + ${c} = ?`, answer: a * b + c };
}

/** 生成 count 道互不相同的题；题量远小于题库空间，重试几次就能去重。 */
export function generateTrialQuestions(count: number, random: Random = Math.random): TrialQuestionSeed[] {
  const total = Math.max(1, Math.trunc(Number(count) || 1));
  const out: TrialQuestionSeed[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < total && guard < total * 40) {
    guard += 1;
    const question = buildQuestion(random);
    if (seen.has(question.prompt)) continue;
    seen.add(question.prompt);
    out.push(question);
  }
  // 极端随机源下仍可能凑不满，退回到带序号的题，保证题量稳定。
  while (out.length < total) {
    out.push({ prompt: `${out.length + 1} + 1 = ?`, answer: out.length + 2 });
  }
  return out;
}

/** 交给客户端的题目：只有题干，答案永远留在服务端。 */
export function publicQuestions(questions: TrialQuestionSeed[]): { prompt: string }[] {
  return questions.map(({ prompt }) => ({ prompt }));
}

/** 判分：只认严格等于（交卷值先取整），非数字按错处理。 */
export function scoreTrialAnswers(
  questions: TrialQuestionSeed[],
  answers: unknown[],
): number {
  let correct = 0;
  questions.forEach((question, index) => {
    const raw = answers[index];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value) && Math.trunc(value) === question.answer) correct += 1;
  });
  return correct;
}
