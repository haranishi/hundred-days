import { AXES, ANSWER_OPTIONS, GUIDE_QUESTIONS, INDUSTRIES, GUIDE_LIMIT } from './guide-data.js';
export { GUIDE_LIMIT, GUIDE_STORAGE_KEY } from './guide-data.js';
const questionById = new Map(GUIDE_QUESTIONS.map(q => [q.id, q]));
const answerById = new Map(ANSWER_OPTIONS.map(a => [a.id, a]));
export const questionOf = id => questionById.get(id);
export const answerOf = id => answerById.get(id);

export function axisResults(answers) {
  return AXES.map(axis => {
    const entries = answers.filter(entry => questionOf(entry.q)?.axis === axis.id).map(entry => ({ question: questionOf(entry.q), answer: answerOf(entry.a) }));
    const known = entries.filter(entry => entry.answer?.value != null);
    const positive = known.filter(entry => entry.answer.value > 0);
    const negative = known.filter(entry => entry.answer.value < 0);
    return { ...axis, entries, known: known.length, positive, negative, score: known.reduce((sum, entry) => sum + entry.answer.value, 0) / 2, mixed: positive.length > 0 && negative.length > 0 };
  });
}

export function nextQuestion(answers) {
  if (answers.length >= GUIDE_LIMIT) return null;
  if (answers.length < AXES.length) return questionOf(AXES[answers.length].id + '-first');
  // 関心のある観点から具体的な場面を確かめ、全観点を各2問ずつ聞く。
  const remaining = axisResults(answers).filter(axis => axis.entries.length < 2);
  remaining.sort((a, b) => b.score - a.score || AXES.findIndex(x => x.id === a.id) - AXES.findIndex(x => x.id === b.id));
  const axis = remaining[0];
  return axis ? questionOf(axis.id + (axis.score > 0 ? '-deepen' : '-explore')) : null;
}

export function addAnswer(answers, answerId) {
  const question = nextQuestion(answers);
  if (!question || !answerOf(answerId)) return answers;
  return [...answers, { q: question.id, a: answerId }];
}

// 変更位置以降を切り落とし、以前の分岐の回答を別の問いへ流用しない。
export function reviseFrom(answers, index) {
  return answers.slice(0, Math.max(0, Math.min(answers.length, Number.isInteger(index) ? index : 0)));
}

export function validAnswers(value) {
  if (!Array.isArray(value) || value.length > GUIDE_LIMIT) return false;
  const prefix = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || !answerOf(entry.a) || nextQuestion(prefix)?.id !== entry.q) return false;
    prefix.push({ q: entry.q, a: entry.a });
  }
  return true;
}

export function buildGuideReport(answers) {
  if (!validAnswers(answers) || answers.length !== GUIDE_LIMIT) return null;
  const axes = axisResults(answers);
  const positives = axes.filter(axis => axis.score > 0 && axis.positive.length).sort((a, b) => b.score - a.score);
  const cutoff = positives[Math.min(1, positives.length - 1)]?.score;
  const leading = positives.filter(axis => axis.score >= cutoff);
  const known = axes.reduce((sum, axis) => sum + axis.known, 0);
  const status = known === 0 ? 'unknown' : positives.length === 0 ? 'open' : leading.length > 2 ? 'broad' : 'focused';
  const allCandidates = INDUSTRIES.map(industry => {
    const weight = Object.values(industry.weights).reduce((sum, value) => sum + value, 0);
    const score = axes.reduce((sum, axis) => sum + axis.score * (industry.weights[axis.id] ?? 0), 0) / weight;
    const matches = positives.filter(axis => (industry.weights[axis.id] ?? 0) >= 2);
    const cautions = axes.filter(axis => axis.score < 0 && (industry.weights[axis.id] ?? 0) >= 2);
    return { ...industry, score, matches, cautions };
  }).filter(industry => industry.score > 0 && industry.matches.length).sort((a, b) => b.score - a.score);
  const candidateCutoff = allCandidates[Math.min(2, allCandidates.length - 1)]?.score;
  const industries = allCandidates.filter(item => item.score + 1e-9 >= candidateCutoff);
  const tied = industries.length > 3 || industries.some((item, index) => index > 0 && Math.abs(item.score - industries[index - 1].score) < 1e-9);
  const draft = leading.length && leading.length <= 2
    ? '仕事選びでは、' + leading.map(axis => axis.phrase + 'こと').join('と、') + 'を大切にしたいです。企業を見るときは、' + leading.map(axis => axis.check).join('、') + 'を確かめたいです。'
    : '';
  return { status, known, axes, leading, industries, tied, draft, mixed: axes.filter(axis => axis.mixed) };
}

export function guideText(answers, { demo = false } = {}) {
  const report = buildGuideReport(answers);
  if (!report) return '';
  const lines = [demo ? 'じぶんの手がかり【架空の結果見本】' : 'じぶんの手がかり — あなたの就活軸', '', '仕事選びの軸の候補'];
  if (!report.leading.length) lines.push(report.status === 'unknown' ? 'まだ分からない回答が多く、軸は絞れていません。' : '今回の質問では、肯定的な手がかりを絞れませんでした。');
  for (const axis of report.leading) {
    lines.push('・' + axis.title);
    for (const entry of axis.entries) lines.push('  ' + entry.question.text + ' → ' + entry.answer.label);
    if (axis.mixed) lines.push('  場面によって回答が分かれています。');
  }
  if (report.draft) lines.push('', '就活軸のたたき台', report.draft);
  if (report.status === 'broad') lines.push('', '関心が複数に広がっています。一つの軸に決める前に、具体的な仕事内容を比較してみましょう。');
  lines.push('', '次に調べる業界の候補' + (report.tied ? '（同点を含みます）' : ''));
  for (const item of report.industries) lines.push('・' + item.name + '：' + item.matches.map(axis => axis.label).join(' / '), '  仕事例：' + item.jobs, '  ' + item.check);
  if (!report.industries.length) lines.push('今の回答からは業界候補を絞れていません。気になる仕事内容から探してみましょう。');
  lines.push('', '企業に確かめる質問', ...report.leading.map(axis => '・' + axis.question), '', '選んだ回答を整理した探索の手がかりです。能力や採用可能性を判定するものではありません。', 'https://hundred-days.pages.dev/day-072-jibun-note/');
  return lines.join('\n');
}

export function encodeGuide(answers, view) {
  if (!validAnswers(answers)) throw new Error('Invalid guide answers');
  return JSON.stringify({ version: 1, answers, view: ['welcome', 'question', 'result'].includes(view) ? view : 'welcome' });
}
export function decodeGuide(text) {
  try {
    if (typeof text !== 'string' || text.length > 12000) return null;
    const data = JSON.parse(text);
    if (data.version !== 1 || !validAnswers(data.answers)) return null;
    const answers = data.answers.map(({ q, a }) => ({ q, a }));
    const view = data.view === 'welcome' ? 'welcome' : answers.length === GUIDE_LIMIT ? 'result' : 'question';
    return { answers, view };
  } catch { return null; }
}

export const GUIDE_EXAMPLE = (() => {
  let answers = [];
  while (nextQuestion(answers)) {
    const axis = nextQuestion(answers).axis;
    answers = addAnswer(answers, axis === 'care' ? 'yes' : axis === 'improve' ? 'maybe' : 'unlikely');
  }
  return answers;
})();
