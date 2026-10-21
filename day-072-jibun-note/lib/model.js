export const TITLE = 'じぶんの手がかり';
export const STORAGE_KEY = 'day072-jibun-note-v1';
export const LIMITS = Object.freeze({ title: 64, situation: 800, challenge: 800, action: 1200, result: 800, learning: 800, reason: 800 });

export const CONTEXTS = [
  { id: 'work', label: 'アルバイト', note: '誰かのために動いた日', hint: '忙しい時間帯、新人への声かけ、お客さんとのやりとり。いつもの仕事の一場面を思い出してみましょう。' },
  { id: 'study', label: '学び・研究', note: '考えたり、調べたりした日', hint: '授業の課題、実験、発表の準備。思いどおりに進まなかったときのことも、手がかりになります。' },
  { id: 'team', label: '部活・サークル', note: '人と一緒に取り組んだ日', hint: '練習やイベントの準備で、自分が担った小さな役割を思い出してみましょう。役職がなくても大丈夫です。' },
  { id: 'life', label: '日々の暮らし', note: '自分なりに工夫した日', hint: '家族の手伝い、友人の相談、毎日続けていること。誰かに頼まれなくてもやっていたことはありますか。' },
  { id: 'challenge', label: '挑戦したこと', note: 'はじめの一歩を踏み出した日', hint: 'はじめての場所、新しい習慣、作品づくり。結果にかかわらず、一歩を踏み出した場面を選べます。' },
  { id: 'other', label: 'その他の経験', note: 'ふと、心に残っている日', hint: 'うれしかったこと、悔しかったこと、誰かに感謝されたこと。最近の小さな出来事からで大丈夫です。' },
];

export const BEHAVIORS = [
  { id: 'listen', label: '相手の話を聞いた', strength: '相手を理解しようとする姿勢', question: '相手のどんな言葉や様子を、行動の手がかりにしましたか？' },
  { id: 'plan', label: '段取りを考えた', strength: '見通しを立てる力', question: '順番や役割を決めるとき、何を優先しましたか？' },
  { id: 'improve', label: 'やり方を工夫した', strength: '改善する力', question: 'それまでのやり方と比べて、どこを変えましたか？' },
  { id: 'persist', label: '試しながら続けた', strength: '粘り強く取り組む力', question: 'うまくいかないとき、続けるために何を変えましたか？' },
  { id: 'connect', label: '人に働きかけた', strength: '周囲と協力する力', question: '誰に、どのように協力をお願いしましたか？' },
  { id: 'learn', label: '調べて学んだ', strength: '学びを行動に移す力', question: '調べたことを、実際の行動にどうつなげましたか？' },
  { id: 'notice', label: '変化や困りごとに気づいた', strength: '課題を見つける力', question: '周りが見過ごしていた、どんな小さな変化に気づきましたか？' },
  { id: 'initiative', label: '自分から動いた', strength: '主体的に取り組む力', question: '自分から動こうと思った、最初のきっかけは何でしたか？' },
];

export const VALUES = [
  { id: 'help', label: '誰かの役に立つ', question: 'この仕事は、誰のどんな困りごとを解決しますか？' },
  { id: 'growth', label: '学び続ける', question: '初めての仕事に取り組むとき、どんな学びや支援がありますか？' },
  { id: 'craft', label: '納得するまで工夫する', question: '現場で気づいた改善案を、どのように提案できますか？' },
  { id: 'together', label: '人と協力する', question: 'チームでは、どんな場面で相談し合っていますか？' },
  { id: 'autonomy', label: '自分で考えて決める', question: '入社後、自分で考えて判断できる範囲はどのように広がりますか？' },
  { id: 'stability', label: '安心して取り組む', question: '困ったときに、誰へどのように相談できますか？' },
  { id: 'challenge', label: '新しいことに挑戦する', question: '新しい役割や仕事に挑戦する機会は、どのように生まれますか？' },
  { id: 'balance', label: '無理なく長く続ける', question: '仕事を続けるうえで、働き方を相談できる仕組みはありますか？' },
];

export const STEPS = [
  { label: '場面', title: 'どんな出来事が、ありましたか。', intro: '一つの場面が浮かべば、そこから始められます。', fields: ['title', 'situation'] },
  { label: '行動', title: 'あなたは、どう動きましたか。', intro: 'みんなで取り組んだ経験も、自分が考えたことに目を向けて。', fields: ['challenge', 'action'] },
  { label: '変化', title: 'そのあと、何が変わりましたか。', intro: '小さな変化や、思いどおりにいかなかったことも残しておこう。', fields: ['result', 'learning'] },
  { label: '意味', title: 'そこに、どんな自分らしさがある？', intro: '自分の行動を読み返して、しっくりくる言葉を選んでみましょう。', fields: ['behaviors', 'values', 'reason'] },
];

export function emptyData(context = '') {
  return { context, title: '', situation: '', challenge: '', action: '', result: '', learning: '', reason: '', behaviors: [], values: [] };
}

const validId = (list, id) => list.some(item => item.id === id);
const picks = (list, value) => Array.isArray(value)
  ? [...new Set(value.filter(id => typeof id === 'string' && validId(list, id)))].slice(0, 2) : [];

export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = emptyData(validId(CONTEXTS, raw.context) ? raw.context : '');
  for (const [field, max] of Object.entries(LIMITS)) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') return null;
    const value = (raw[field] ?? '').replace(/\r\n?/g, '\n');
    if (value.length > max) return null;
    data[field] = value;
  }
  data.behaviors = picks(BEHAVIORS, raw.behaviors);
  data.values = picks(VALUES, raw.values);
  return data;
}

export function validateStep(raw, step) {
  const data = normalizeData(raw);
  if (!data) return { form: '入力の形式や文字数を確認してください。' };
  const errors = {};
  if (!validId(CONTEXTS, data.context)) errors.context = '振り返る経験の種類を選んでください。';
  const required = [['title', 'situation'], ['challenge', 'action'], ['result'], ['reason']][step];
  if (!required) return { form: '振り返りの段階を確認してください。' };
  const messages = { title: 'この経験に、短い見出しを付けてください。', situation: 'どんな場面だったか、一言から書いてみてください。', challenge: '困っていたことや、目指したことを書いてください。', action: '自分がやってみたことを書いてください。', result: 'その後に起きたことを書いてください。変わらなかったことでも大丈夫です。', reason: 'なぜ大切だと感じたか、一言から書いてみてください。' };
  for (const field of required) if (!data[field].trim()) errors[field] = messages[field];
  if (step === 3) {
    if (!data.behaviors.length) errors.behaviors = '自分の行動に近いものを1つか2つ選んでください。';
    if (!data.values.length) errors.values = '大切にしたいことを1つか2つ選んでください。';
  }
  return errors;
}

export function firstIncomplete(data) {
  for (let step = 0; step < STEPS.length; step++) if (Object.keys(validateStep(data, step)).length) return step;
  return -1;
}

export function buildReport(raw) {
  const data = normalizeData(raw);
  if (!data || firstIncomplete(data) !== -1) return null;
  const behaviors = data.behaviors.map(id => BEHAVIORS.find(item => item.id === id));
  const values = data.values.map(id => VALUES.find(item => item.id === id));
  const context = CONTEXTS.find(item => item.id === data.context);
  return { data, context, strengths: behaviors, values, questions: [...behaviors.map(item => ({ kind: '経験をもう一歩深める', text: item.question })), ...values.map(item => ({ kind: '企業選び・面接で確かめる', text: item.question }))] };
}

export function reportText(raw) {
  const report = buildReport(raw);
  if (!report) return '';
  const { data, strengths, values, context } = report;
  return [TITLE + ' — 振り返りシート', '', data.title.trim(), '経験：' + context.label,
    '', '【場面】', data.situation.trim(), '', '【困っていたこと・目指したこと】', data.challenge.trim(),
    '', '【自分が考えて行動したこと】', data.action.trim(), '', '【その後の変化】', data.result.trim(),
    ...(data.learning.trim() ? ['', '【次に試したいこと・学んだこと】', data.learning.trim()] : []),
    '', '【強みの候補と、選んだ行動】', ...strengths.map(item => '・' + item.strength + '（' + item.label + '）'),
    '', '【大切にしたいこと】', values.map(item => item.label).join(' / '), '理由：' + data.reason.trim(),
    '', '【次に考えたい問い】', ...report.questions.map(item => '・' + item.text),
    '', '強みは、選んだ行動から整理した言い換えの候補です。自分の経験と照らして確かめてください。'].join('\n');
}

export function encodeSnapshot(state) {
  const data = normalizeData(state.data);
  if (!data) throw new Error('invalid draft');
  return JSON.stringify({ version: 1, data, step: Math.max(0, Math.min(3, Number.isInteger(state.step) ? state.step : 0)), screen: ['welcome', 'work', 'result'].includes(state.screen) ? state.screen : 'welcome', demo: state.demo === true });
}

export function decodeSnapshot(text) {
  if (typeof text !== 'string' || text.length > 32768) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || raw.version !== 1) return null;
    const data = normalizeData(raw.data);
    if (!data) return null;
    const screen = data.context && ['welcome', 'work', 'result'].includes(raw.screen) ? raw.screen : 'welcome';
    const incomplete = firstIncomplete(data);
    return { data, step: Math.max(0, Math.min(3, Number.isInteger(raw.step) ? raw.step : 0)), screen: screen === 'result' && incomplete !== -1 ? 'work' : screen, demo: raw.demo === true };
  } catch { return null; }
}

export function hasContent(data) {
  return Object.keys(LIMITS).some(field => Boolean(data[field]?.trim())) || Boolean(data.behaviors.length || data.values.length);
}

export const EXAMPLE = Object.freeze({
  context: 'work', title: '新人さんのために、仕事のメモを作った',
  situation: 'カフェのアルバイトで、新人さんが注文の手順を覚えるのに苦労していました。忙しい時間は、その都度質問しづらい様子でした。',
  challenge: '新人さんが一人で抱え込まず、落ち着いて仕事を覚えられるようにしたいと思いました。',
  action: 'まず、どの手順で迷うか本人に聞きました。自分も迷ったところを思い出し、よくある注文と確認する順番を小さなメモにしました。使ってみた感想を聞いて、書き方も直しました。',
  result: '新人さんから「先にメモを見て確認できるので助かる」と言ってもらえました。まだ迷う手順もあったので、メモは一緒に見直しています。',
  learning: '次は、ほかの新人さんにも使ってもらい、分かりにくいところを確かめたいです。',
  reason: '困っている人の話を聞いて、一緒にやり方を考えられたことがうれしかったからです。',
  behaviors: ['listen', 'improve'], values: ['help', 'craft'],
});
