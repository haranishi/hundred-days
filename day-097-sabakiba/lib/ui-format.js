// 画面描画用の純粋な整形・絞り込み・読み仮名分割。DOM に依存せず Node で試験できる。
import { METHODS, TOOL_LABELS, resolveText } from './contract.js';

export const VIEW_LABELS = {
  cook: '台所の視点',
  side: '真横',
  top: '真上',
};

export const QUALITY_LABELS = {
  auto: '自動',
  high: '高',
  standard: '標準',
  light: '軽め',
};

export const MOTION_LABELS = {
  pull: '引く',
  push: '押す',
  press: '押し切る',
  slice: '引き切る',
  scrape: 'こそげる',
  peel: '引く（皮引き）',
  pluck: '抜く',
};

export const LEAD_LABELS = {
  heel: '刃元',
  mid: '刃の中ほど',
  tip: '切っ先',
};

// 専門語と読み仮名の辞書（長い語を優先して照合する）。
export const RUBY_DICT = [
  ['三枚おろし', 'さんまいおろし'],
  ['五枚おろし', 'ごまいおろし'],
  ['出刃包丁', 'でばぼうちょう'],
  ['柳刃包丁', 'やなぎばぼうちょう'],
  ['兜焼き', 'かぶとやき'],
  ['背開き', 'せびらき'],
  ['手開き', 'てびらき'],
  ['節取り', 'ふしどり'],
  ['血合い', 'ちあい'],
  ['腹骨', 'はらぼね'],
  ['中骨', 'なかぼね'],
  ['背骨', 'せぼね'],
  ['小骨', 'こぼね'],
  ['背わた', 'せわた'],
  ['鰓蓋', 'えらぶた'],
  ['稜鱗', 'りょうりん'],
  ['胸ビレ', 'むなびれ'],
  ['背ビレ', 'せびれ'],
  ['尻ビレ', 'しりびれ'],
  ['腹ビレ', 'はらびれ'],
  ['尾柄', 'びへい'],
  ['肛門', 'こうもん'],
  ['側線', 'そくせん'],
  ['縁側', 'えんがわ'],
  ['筋節', 'きんせつ'],
  ['内臓', 'ないぞう'],
  ['柵', 'さく'],
  ['鰾', 'うきぶくろ'],
  ['切っ先', 'きっさき'],
  ['刃元', 'はもと'],
  ['出刃', 'でば'],
  ['柳刃', 'やなぎば'],
  ['引き切り', 'ひきぎり'],
];

const SORTED_RUBY_DICT = [...RUBY_DICT].sort((a, b) => b[0].length - a[0].length);
const INLINE_RUBY_RE = /([一-龥々ヶ]+)[（(]([ぁ-ゖー]+)[）)]/g;

/** 文字列を読み仮名（ruby）付きトークン列に分割する。同じ語は先頭1回だけ注釈できる。 */
export function tokenizeRuby(text, { oncePerTerm = true } = {}) {
  const input = String(text ?? '');
  if (!input) return [];

  // まず「漢字(かな)」形式を明示ルビとして先に抜き出す
  const rough = [];
  let cursor = 0;
  for (const m of input.matchAll(INLINE_RUBY_RE)) {
    const idx = m.index;
    if (idx > cursor) rough.push({ type: 'text', text: input.slice(cursor, idx) });
    rough.push({ type: 'ruby', base: m[1], rt: m[2] });
    cursor = idx + m[0].length;
  }
  if (cursor < input.length) rough.push({ type: 'text', text: input.slice(cursor) });

  const seen = new Set();
  const out = [];
  for (const part of rough) {
    if (part.type === 'ruby') {
      seen.add(part.base);
      out.push(part);
      continue;
    }
    let rest = part.text;
    while (rest.length > 0) {
      let bestIdx = -1;
      let bestEntry = null;
      for (const entry of SORTED_RUBY_DICT) {
        const [term] = entry;
        if (oncePerTerm && seen.has(term)) continue;
        const pos = rest.indexOf(term);
        if (pos === -1) continue;
        if (bestIdx === -1 || pos < bestIdx || (pos === bestIdx && term.length > bestEntry[0].length)) {
          bestIdx = pos;
          bestEntry = entry;
        }
      }
      if (!bestEntry) {
        out.push({ type: 'text', text: rest });
        break;
      }
      if (bestIdx > 0) out.push({ type: 'text', text: rest.slice(0, bestIdx) });
      out.push({ type: 'ruby', base: bestEntry[0], rt: bestEntry[1] });
      seen.add(bestEntry[0]);
      rest = rest.slice(bestIdx + bestEntry[0].length);
    }
  }
  return out;
}

/** 魚一覧を方法と初心者向け（難易度1〜2）で絞り込む。 */
export function filterSpecies(order, metaMap, { method = 'all', beginnerOnly = false } = {}) {
  const list = [];
  for (const id of order) {
    const meta = metaMap[id];
    if (!meta) continue;
    if (method && method !== 'all' && meta.method !== method) continue;
    if (beginnerOnly && !(meta.difficulty >= 1 && meta.difficulty <= 2)) continue;
    list.push(meta);
  }
  return list;
}

/** 「つづきから」に表示する進捗一覧を組み立てる。 */
export function getResumeEntries(progress, lastSpecies, metaMap, getProcedure) {
  if (!progress || typeof progress !== 'object') return [];
  const entries = [];
  for (const [id, rawStep] of Object.entries(progress)) {
    const meta = metaMap[id];
    const proc = typeof getProcedure === 'function' ? getProcedure(id) : null;
    if (!meta || !proc || !Array.isArray(proc.steps) || proc.steps.length === 0) continue;
    const step = Math.min(proc.steps.length - 1, Math.max(0, Math.trunc(Number(rawStep) || 0)));
    const stepObj = proc.steps[step];
    entries.push({
      species: id,
      meta,
      step,
      stepNumber: step + 1,
      totalSteps: proc.steps.length,
      stepTitle: stepObj ? stepObj.title : '',
      methodLabel: METHODS[meta.method] || '',
      isLatest: id === lastSpecies,
    });
  }
  entries.sort((a, b) => Number(b.isLatest) - Number(a.isLatest));
  return entries;
}

/** 手順全体で使う道具の一覧（重複除去・出現順）を返す。 */
export function collectProcedureTools(procedure) {
  if (!procedure || !Array.isArray(procedure.steps)) return [];
  const seen = new Set();
  const out = [];
  for (const st of procedure.steps) {
    for (const id of st.tools || []) {
      if (seen.has(id) || !TOOL_LABELS[id]) continue;
      seen.add(id);
      out.push({ id, label: TOOL_LABELS[id] });
    }
  }
  return out;
}

/** 1手順のデータを表示用に整形する。すべての文章に resolveText を適用する。 */
export function formatStepView(step, stepIndex, totalSteps, leftHanded = false) {
  if (!step) return null;
  const tx = (s) => resolveText(s, leftHanded);
  const tools = (step.tools || []).map((id) => ({ id, label: TOOL_LABELS[id] || id }));
  const hands = (step.hands || []).map((h) => ({
    anchor: h.anchor,
    who: h.who,
    whoLabel: h.who === 'dom' ? (leftHanded ? '左手（刃側）' : '右手（刃側）') : (leftHanded ? '右手（押さえ）' : '左手（押さえ）'),
    text: tx(h.text),
  }));
  const labels = (step.labels || []).map((l) => ({
    anchor: l.anchor,
    text: tx(l.text),
  }));
  const cuts = (step.cuts || []).map((c) => ({
    id: c.id,
    curve: c.curve,
    toolLabel: TOOL_LABELS[c.tool] || c.tool,
    motionLabel: MOTION_LABELS[c.motion] || c.motion,
    leadLabel: c.lead ? (LEAD_LABELS[c.lead] || c.lead) : null,
    angleDeg: Number.isFinite(c.angleDeg) ? c.angleDeg : null,
    through: Boolean(c.through),
  }));

  return {
    id: step.id,
    stepIndex,
    stepNumber: stepIndex + 1,
    totalSteps,
    title: tx(step.title),
    summary: tx(step.summary),
    place: tx(step.place),
    how: (step.how || []).map((line) => tx(line)),
    tip: tx(step.tip),
    mistake: tx(step.mistake),
    done: tx(step.done),
    safety: step.safety ? tx(step.safety) : null,
    tools,
    hands,
    labels,
    cuts,
    durationMs: step.durationMs || 6000,
    hasPractice: Boolean(step.practice && step.practice.cut),
    practice: step.practice ? { ...step.practice } : null,
  };
}

/** 音声読み上げ用の短い日本語台本を組み立てる。 */
export function buildStepSpeechText(stepView) {
  if (!stepView) return '';
  const parts = [
    `手順${stepView.stepNumber}、${stepView.title}。`,
    stepView.summary,
    `魚の置き方は、${stepView.place}。`,
    ...stepView.how,
    `コツは、${stepView.tip}`,
  ];
  if (stepView.safety) parts.push(`安全の注意、${stepView.safety}`);
  return parts.join(' ');
}

/** 安全情報の確度ラベルを色以外の記号つきで返す。 */
export function formatConfidence(code) {
  switch (code) {
    case 'high':
    case 'official':
      return { code: 'high', label: '公的機関の一次情報', symbol: '◎' };
    case 'medium':
      return { code: 'medium', label: '標準的な指針', symbol: '○' };
    case 'sample':
      return { code: 'sample', label: '見本データ（準備中）', symbol: '△' };
    default:
      return { code: 'info', label: '参考情報', symbol: '・' };
  }
}

/** 練習の採点結果を表示用に整形する（「ガイドとの一致度」と呼び、歩留まりとは言わない）。 */
export function formatPracticeResult(raw, previousBest = null) {
  const score = Math.round(Math.min(100, Math.max(0, Number(raw && raw.score) || 0)));
  const accuracyPct = Math.round(Math.min(1, Math.max(0, Number(raw && raw.accuracy) || 0)) * 100);
  const smoothnessPct = Math.round(Math.min(1, Math.max(0, Number(raw && raw.smoothness) || 0)) * 100);
  const coveragePct = Math.round(Math.min(1, Math.max(0, Number(raw && raw.coverage) || 0)) * 100);
  const grade = (raw && raw.grade) || (score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D');
  const gradeSymbols = { S: '★', A: '★', B: '◎', C: '○', D: '△' };
  const isNewBest = score > 0 && (previousBest === null || score > previousBest);
  return {
    metricLabel: 'ガイドとの一致度',
    score,
    grade,
    gradeSymbol: gradeSymbols[grade] || '・',
    accuracyPct,
    smoothnessPct,
    coveragePct,
    comment: (raw && raw.comment) || '線をゆっくり一筆でなぞってみましょう。',
    isNewBest,
    bestScore: previousBest !== null ? Math.max(previousBest, score) : score,
  };
}

/** 難易度の星表示用のテキストを返す。 */
export function formatDifficultyLabel(difficulty) {
  const d = Math.min(5, Math.max(1, Math.round(Number(difficulty) || 1)));
  return {
    value: d,
    ariaLabel: `難易度 5段階中 ${d}`,
    shortText: d <= 2 ? '初心者向け' : d === 3 ? '中級' : 'じっくり挑戦',
  };
}

/** 次の魚を選ぶ（手順がある魚を優先し、なければ順序どおり次へ）。 */
export function getNextSpeciesId(currentId, order, getProcedure) {
  const idx = order.indexOf(currentId);
  if (idx === -1) return order[0] || currentId;
  for (let offset = 1; offset < order.length; offset++) {
    const candidate = order[(idx + offset) % order.length];
    if (typeof getProcedure === 'function' && getProcedure(candidate)) return candidate;
  }
  return order[(idx + 1) % order.length];
}
