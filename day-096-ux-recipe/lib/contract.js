// 契約: UXレシピ（Day096）。定数・部品の項目表・検証・無害化・道具。
// 状態・診断・描画・画面の担当は、ここだけを共通の正とする。変更してよいのは統合担当（親）だけ。
// 外部通信なし・DOMなし（Node の単体試験でそのまま読める）。

export const SCHEMA_VERSION = 1;
export const STORAGE_PREFIX = 'day096.ux-recipe.'; // localStorage のキーの頭（現在の作業=`.current`、保存=`.slot.<id>`、見たことの記録=`.seen`）
export const HASH_VIEW = 'v'; // 共有リンクは `#v=<符号>`（見るだけの画面で開く）
export const MAX_BLOCKS = 18;
export const MAX_SLOTS = 6; // 端末内に残せる保存の数
export const SITE_NAME_MAX = 24;

// ---- 目的（UXゴール）----
export const GOALS = ['reserve', 'buy', 'inquire', 'signup', 'apply', 'event', 'visit', 'support'];
export const GOAL_LABEL = {
  reserve: '予約してもらう', buy: '買ってもらう', inquire: '問い合わせてもらう', signup: '登録してもらう',
  apply: '応募してもらう', event: '参加してもらう', visit: '来店してもらう', support: '応援してもらう',
};
export const GOAL_NOTE = {
  reserve: 'サロン・飲食・教室の予約ページ', buy: '1つの商品を売るページ', inquire: '事務所・サービスの相談ページ',
  signup: 'アプリ・会員・メルマガの登録ページ', apply: '採用・スタッフ募集のページ', event: 'イベント・講座の申込ページ',
  visit: 'お店・施設に来てもらうページ', support: '寄付・支援・クラウドファンディングのページ',
};

// ---- UXの流れ（独自の整理。特定の権威あるモデルではない）----
export const STAGES = ['notice', 'understand', 'trust', 'act', 'relief'];
export const STAGE_LABEL = { notice: '気づく', understand: 'わかる', trust: '信じる', act: '動く', relief: '安心' };
export const STAGE_NOTE = {
  notice: '「これは自分のためのページだ」と気づいてもらう',
  understand: '何を・いくらで・どう進むかを分かってもらう',
  trust: '信じてよい理由を見せる',
  act: '次の行動を、迷わず取ってもらう',
  relief: '最後の不安を消す',
};

// 段階の色（色覚に配慮した配色）と記号。soft=薄い地・ink=その上の文字（4.5:1 以上＝tests/core/contract.test.mjs が計算で確かめる）。
export const STAGE_COLORS = {
  notice: { solid: '#E69F00', soft: '#FDF1D9', ink: '#6B4600', glyph: '気' },
  understand: { solid: '#56B4E9', soft: '#E3F3FC', ink: '#0B4A6F', glyph: 'わ' },
  trust: { solid: '#009E73', soft: '#DCF3EC', ink: '#00553F', glyph: '信' },
  act: { solid: '#D55E00', soft: '#FBE6D6', ink: '#7A3600', glyph: '動' },
  relief: { solid: '#CC79A7', soft: '#F6E4EE', ink: '#6F2A52', glyph: '安' },
};

// ---- UXの効果（部品箱の分け方）----
export const EFFECTS = ['show', 'clarify', 'reassure', 'push'];
export const EFFECT_LABEL = { show: '見せる', clarify: '迷わせない', reassure: '不安を減らす', push: '背中を押す' };

// ---- 見た目 ----
export const THEMES = ['soft', 'crisp', 'lively', 'calm'];
export const THEME_LABEL = { soft: 'やわらか', crisp: 'きりっと', lively: 'にぎやか', calm: 'しっとり' };
// 白い文字を載せても 4.5:1 以上（tests/core/contract.test.mjs が計算で確かめる）
export const ACCENTS = [
  { key: 'coral', label: 'コーラル', hex: '#c2412a' },
  { key: 'indigo', label: 'あい', hex: '#3b4cca' },
  { key: 'green', label: 'みどり', hex: '#1f7a4d' },
  { key: 'teal', label: 'ふかみどり', hex: '#0f766e' },
  { key: 'plum', label: 'むらさき', hex: '#9333a8' },
  { key: 'amber', label: 'こがね', hex: '#b45309' },
];
export const DEVICES = [
  { key: 'phone', label: 'スマホ', width: 390 },
  { key: 'pc', label: 'パソコン', width: 960 },
];

// ---- 診断 ----
export const LEVELS = ['must', 'should', 'tip'];
export const LEVEL_LABEL = { must: '必須', should: 'おすすめ', tip: 'ヒント' };
export const LEVEL_WEIGHT = { must: 3, should: 2, tip: 1 };

// ---- 部品の項目表 ----
// kind: text=1行 / long=複数行（改行は\nだけ） / check=はい・いいえ / list=繰り返し（item に項目表）
// role: button=ボタンの文言 / headline=主見出し / price=値段（診断が参照する目印）
const t = (key, label, max, extra = {}) => ({ key, kind: 'text', label, max, ...extra });
const l = (key, label, max, extra = {}) => ({ key, kind: 'long', label, max, ...extra });
const c = (key, label) => ({ key, kind: 'check', label });
const list = (key, label, min, max, item) => ({ key, kind: 'list', label, min, max, item });

export const BLOCK_TYPES = [
  'hero', 'pain', 'benefits', 'steps', 'proof', 'voices', 'story', 'team', 'menu', 'plans',
  'schedule', 'faq', 'compare', 'guarantee', 'limited', 'form', 'cta', 'access', 'footer',
];

export const BLOCK_SCHEMA = {
  hero: { label: '最初の画面', stage: 'notice', effect: 'show', variants: ['中央', '左寄せ', '大見出し'], fields: [
    t('eyebrow', '小さな見出し', 20), t('title', 'キャッチコピー', 32, { role: 'headline' }), l('lead', '説明', 90),
    t('cta', 'ボタンの文言', 14, { role: 'button' }), t('note', 'ボタンの下の一言', 30)] },
  pain: { label: 'こんなお悩み', stage: 'notice', effect: 'show', variants: ['チェック', 'カード'], fields: [
    t('heading', '見出し', 24), list('items', 'お悩み', 2, 5, [t('text', 'お悩み', 36)]), l('lead', 'つなぎの一言', 60)] },
  benefits: { label: '選ばれる理由', stage: 'understand', effect: 'clarify', variants: ['アイコン', '番号つき', '左右交互'], fields: [
    t('heading', '見出し', 28), list('items', '理由', 2, 4, [t('title', '見出し', 16), l('text', '説明', 60)])] },
  steps: { label: 'ご利用の流れ', stage: 'understand', effect: 'clarify', variants: ['縦', '横'], fields: [
    t('heading', '見出し', 24), list('items', '手順', 2, 5, [t('title', '見出し', 16), l('text', '説明', 50)])] },
  proof: { label: '実績の数字', stage: 'trust', effect: 'reassure', variants: ['横ならび', 'カード'], fields: [
    t('heading', '見出し', 24), list('items', '数字', 2, 4, [t('num', '数字', 8), t('label', '説明', 16)])] },
  voices: { label: 'お客様の声', stage: 'trust', effect: 'reassure', variants: ['カード', '大きな引用'], fields: [
    t('heading', '見出し', 24), list('items', '声', 1, 3, [l('quote', '声', 80), t('who', '誰の声か', 20)])] },
  story: { label: '想い・ストーリー', stage: 'trust', effect: 'show', variants: ['文章', '引用風'], fields: [
    t('heading', '見出し', 24), l('text', '本文', 160), t('who', '書いた人', 20)] },
  team: { label: 'スタッフ紹介', stage: 'trust', effect: 'show', variants: ['丸', 'カード'], fields: [
    t('heading', '見出し', 24), list('items', '人', 1, 4, [t('name', '名前', 14), t('role', '役割', 16), l('text', 'ひとこと', 50)])] },
  menu: { label: 'メニュー・料金', stage: 'understand', effect: 'clarify', variants: ['一覧', 'カード'], fields: [
    t('heading', '見出し', 24), list('items', 'メニュー', 2, 6, [t('name', '名前', 18), t('price', '値段', 12, { role: 'price' }), t('note', '一言', 40)]),
    t('foot', '注記', 50)] },
  plans: { label: '料金プラン', stage: 'understand', effect: 'clarify', variants: ['横ならび', '縦ならび'], fields: [
    t('heading', '見出し', 24), list('items', 'プラン', 2, 4, [t('name', 'プラン名', 14), t('price', '値段', 12, { role: 'price' }),
      t('note', '一言', 30), l('lines', '含まれるもの（1行に1つ）', 90), c('pick', 'おすすめにする')])] },
  schedule: { label: '日程・プログラム', stage: 'understand', effect: 'clarify', variants: ['縦', 'カード'], fields: [
    t('heading', '見出し', 24), list('items', '予定', 2, 6, [t('time', '時間', 10), t('title', '見出し', 20), l('text', '説明', 40)])] },
  faq: { label: 'よくある質問', stage: 'relief', effect: 'reassure', variants: ['開閉', '一覧'], fields: [
    t('heading', '見出し', 24), list('items', '質問', 2, 5, [t('q', '質問', 30), l('a', '答え', 80)])] },
  compare: { label: '比較', stage: 'understand', effect: 'clarify', variants: ['表', 'チェック'], fields: [
    t('heading', '見出し', 24), t('leftName', '左の名前', 10), t('rightName', '右の名前', 10),
    list('items', '比べる項目', 2, 5, [t('label', '項目', 16), t('left', '左', 10), t('right', '右', 10)])] },
  guarantee: { label: '保証・安心', stage: 'relief', effect: 'reassure', variants: ['帯', 'シール'], fields: [
    t('title', '見出し', 24), l('text', '説明', 90), list('items', '安心の一言', 0, 3, [t('text', '一言', 12)])] },
  limited: { label: '期限・残り枠', stage: 'act', effect: 'push', variants: ['帯', 'バッジ'], fields: [
    t('label', 'ラベル', 12), t('text', '説明', 40), t('value', '数字', 10), c('real', '本当の数字です'), t('note', '注記', 40)] },
  form: { label: '申込フォーム', stage: 'act', effect: 'push', variants: ['縦', 'ひとこと'], fields: [
    t('heading', '見出し', 24), list('items', '入力欄', 1, 6, [t('label', '項目名', 14)]),
    t('submit', 'ボタンの文言', 14, { role: 'button' }), t('note', '注記', 50)] },
  cta: { label: '行動ボタン', stage: 'act', effect: 'push', variants: ['帯', 'カード'], fields: [
    t('title', '見出し', 28), l('text', '説明', 60), t('button', 'ボタンの文言', 14, { role: 'button' }), t('note', 'ボタンの下の一言', 40)] },
  access: { label: '場所・営業時間', stage: 'relief', effect: 'reassure', variants: ['カード', 'シンプル'], fields: [
    t('heading', '見出し', 20), list('items', '項目', 2, 4, [t('label', '項目', 10), t('value', '内容', 40)])] },
  footer: { label: 'フッター', stage: 'relief', effect: 'reassure', variants: ['標準'], fields: [
    t('name', '名前', 24), l('text', '注意書き', 80), list('items', 'リンク名', 0, 3, [t('text', '名前', 12)])] },
};

// ---- 状態の形 ----
// State = { v:1, goal, site:{name}, theme:{preset, accent}, blocks:[Block] }
// Block = { id:'b3', type, variant:0, props:{…項目表どおり…} }
// 操作（state.js の reduce が受ける。すべて純粋関数）:
export const ACTION_TYPES = [
  'setGoal', 'addBlock', 'removeBlock', 'moveBlock', 'duplicateBlock', 'setVariant',
  'setProp', 'addItem', 'removeItem', 'moveItem', 'setSite', 'setTheme', 'replace',
];
// 診断（rules.js の diagnose）: { score:0〜100, passed, total,
//   items:[{ id, level, ok, title, why, note?, sources:[{label,url,confidence}], blockId?, fix?:{ label, action } }],
//   stages:[{ key, label, count, ok }] }  ／ confidence は '確認済み' | '一部確認' | '独自の整理'
// 診断の items は、適用される項目だけ（適用外は含めない）。fix.action は reduce がそのまま受ける操作。

// ---- 道具: 文字の無害化 ----
const SRC_SINGLE = '[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]';
const SRC_MULTI = '[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]'; // 改行(000A)だけ残す
const CONTROL_SINGLE = new RegExp(SRC_SINGLE, 'g'); // replace 用（g付き）
const CONTROL_MULTI = new RegExp(SRC_MULTI, 'g');
const HAS_CONTROL_SINGLE = new RegExp(SRC_SINGLE); // test 用（gなし＝状態を持たない）
const HAS_CONTROL_MULTI = new RegExp(SRC_MULTI);

export function countChars(s) { return Array.from(s).length; }

/** 文字を無害化し、最大文字数（コードポイント）に切る。打鍵ごとに呼ぶので、trim はしない。 */
export function clampText(value, max, multiline = false) {
  let s = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
  s = s.replace(/\r\n?|\n/g, multiline ? '\n' : ' ').replace(multiline ? CONTROL_MULTI : CONTROL_SINGLE, '');
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('') : s;
}

// ---- 道具: 項目表 ----
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIndex = (v) => Number.isInteger(v) && v >= 0;

function blankField(f) {
  if (f.kind === 'list') return Array.from({ length: f.min }, () => blankFields(f.item));
  return f.kind === 'check' ? false : '';
}
function blankFields(fields) { const o = {}; for (const f of fields) o[f.key] = blankField(f); return o; }
/** 空の中身（最小の件数だけ項目を持つ）。 */
export function blankProps(type) { return blankFields(BLOCK_SCHEMA[type].fields); }

function sanitizeFields(fields, raw) {
  const src = isObj(raw) ? raw : {};
  const out = {};
  for (const f of fields) {
    const v = src[f.key];
    if (f.kind === 'text') out[f.key] = clampText(v, f.max, false);
    else if (f.kind === 'long') out[f.key] = clampText(v, f.max, true);
    else if (f.kind === 'check') out[f.key] = v === true;
    else {
      // 添字で作る（map は疎配列の空の要素を飛ばし、空の要素が検証をすり抜けるため）
      const arr = Array.isArray(v) ? Array.from({ length: Math.min(v.length, f.max) }, (_, i) => sanitizeFields(f.item, v[i])) : [];
      while (arr.length < f.min) arr.push(blankFields(f.item));
      out[f.key] = arr;
    }
  }
  return out;
}
/** 信用できない入力から、項目表どおりの中身を作る（足りない所は空・余分な所は捨てる）。 */
export function sanitizeProps(type, raw) { return sanitizeFields(BLOCK_SCHEMA[type].fields, raw); }

/** 項目表の中の位置（['items', 2, 'text'] など）から、項目の定義を返す。無ければ null。 */
/** 部品の種類として正しいか。継承プロパティ（constructor・__proto__ など）は種類ではない。 */
export const isBlockType = (t) => typeof t === 'string' && Object.hasOwn(BLOCK_SCHEMA, t);

export function resolveField(type, path) {
  if (!isBlockType(type)) return null;
  let fields = BLOCK_SCHEMA[type].fields;
  let field = null;
  for (let i = 0; i < path.length; i += 1) {
    const key = path[i];
    if (isIndex(key)) { // 直前が list なら、その中の1件
      if (!field || field.kind !== 'list') return null;
      fields = field.item;
      field = { kind: 'listItem', item: field.item };
      continue;
    }
    if (field && field.kind === 'list') return null; // 添字が必要
    const next = fields?.find((f) => f.key === key);
    if (!next) return null;
    field = next;
    if (field.kind === 'list') continue;
    if (i !== path.length - 1) return null;
  }
  return field;
}

export function getPath(props, path) {
  let cur = props;
  for (const key of path) { if (cur == null) return undefined; cur = cur[key]; }
  return cur;
}
/** 元を変えずに、path の値だけ差し替えた新しい props を返す。 */
export function setPath(props, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const copy = Array.isArray(props) ? props.slice() : { ...props };
  copy[head] = setPath(props?.[head], rest, value);
  return copy;
}

export function nextBlockId(blocks) {
  const used = new Set(blocks.map((b) => b.id));
  let max = 0;
  for (const id of used) { const m = /^b(\d+)$/.exec(id); if (m) max = Math.max(max, Number(m[1])); }
  const candidate = `b${max + 1}`;
  if (candidate.length <= 12 && Number.isSafeInteger(max + 1)) return candidate;
  for (let n = 1; ; n += 1) if (!used.has(`b${n}`)) return `b${n}`; // 桁あふれ: 空いている最小の番号
}

// ---- 検証・無害化（状態全体）----
const ID_RE = /^[a-z][a-z0-9_-]{0,11}$/;

function validateFields(fields, obj, where, errors) {
  if (!isObj(obj)) { errors.push(`${where}: オブジェクトではありません`); return; }
  const keys = new Set(fields.map((f) => f.key));
  for (const k of Object.keys(obj)) if (!keys.has(k)) errors.push(`${where}.${k}: 知らない項目です`);
  for (const f of fields) {
    const v = obj[f.key];
    const at = `${where}.${f.key}`;
    if (f.kind === 'text' || f.kind === 'long') {
      if (typeof v !== 'string') errors.push(`${at}: 文字列ではありません`);
      else if (countChars(v) > f.max) errors.push(`${at}: ${f.max}文字を超えています`);
      else if ((f.kind === 'text' ? HAS_CONTROL_SINGLE : HAS_CONTROL_MULTI).test(v)) errors.push(`${at}: 制御文字が入っています`);
    } else if (f.kind === 'check') {
      if (typeof v !== 'boolean') errors.push(`${at}: 真偽値ではありません`);
    } else if (!Array.isArray(v)) errors.push(`${at}: 配列ではありません`);
    else {
      if (v.length < f.min || v.length > f.max) errors.push(`${at}: 件数が ${f.min}〜${f.max} の外です（${v.length}）`);
      for (let i = 0; i < v.length; i += 1) validateFields(f.item, v[i], `${at}[${i}]`, errors); // 添字で回す（forEach は空の要素を飛ばす）
    }
  }
}

/** 状態が契約どおりか。問題の一覧を返す（空なら正しい）。 */
export function validateState(state) {
  const errors = [];
  if (!isObj(state)) return ['state: オブジェクトではありません'];
  if (state.v !== SCHEMA_VERSION) errors.push(`v: ${SCHEMA_VERSION} ではありません`);
  if (!GOALS.includes(state.goal)) errors.push('goal: 知らない目的です');
  if (!isObj(state.site) || typeof state.site.name !== 'string' || countChars(state.site.name) > SITE_NAME_MAX || HAS_CONTROL_SINGLE.test(state.site.name)) errors.push('site.name: 文字列（24文字まで・制御文字なし）ではありません');
  if (!isObj(state.theme) || !THEMES.includes(state.theme.preset) || !isIndex(state.theme.accent) || state.theme.accent >= ACCENTS.length) errors.push('theme: preset・accent が不正です');
  if (!Array.isArray(state.blocks)) { errors.push('blocks: 配列ではありません'); return errors; }
  if (state.blocks.length > MAX_BLOCKS) errors.push(`blocks: ${MAX_BLOCKS}件を超えています`);
  const ids = new Set();
  for (let i = 0; i < state.blocks.length; i += 1) { // 添字で回す（forEach は疎配列の空の要素を飛ばす）
    const b = state.blocks[i];
    const where = `blocks[${i}]`;
    if (!isObj(b)) { errors.push(`${where}: オブジェクトではありません`); continue; }
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) errors.push(`${where}.id: 不正です`);
    else if (ids.has(b.id)) errors.push(`${where}.id: 重複しています`);
    else ids.add(b.id);
    if (!isBlockType(b.type)) { errors.push(`${where}.type: 知らない部品です`); continue; }
    const def = BLOCK_SCHEMA[b.type];
    if (!isIndex(b.variant) || b.variant >= def.variants.length) errors.push(`${where}.variant: 範囲外です`);
    validateFields(def.fields, b.props, `${where}.props`, errors);
  }
  return errors;
}

/** 信用できない入力（共有リンク・保存データ）から、契約どおりの状態を作る。作れなければ null。 */
export function sanitizeState(raw) {
  if (!isObj(raw) || !GOALS.includes(raw.goal)) return null;
  const used = new Set();
  const blocks = [];
  for (const rb of Array.isArray(raw.blocks) ? raw.blocks : []) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (!isObj(rb) || !isBlockType(rb.type)) continue;
    const def = BLOCK_SCHEMA[rb.type];
    let id = typeof rb.id === 'string' && ID_RE.test(rb.id) && !used.has(rb.id) ? rb.id : null;
    if (!id) { id = nextBlockId([...blocks, ...[...used].map((u) => ({ id: u }))]); }
    used.add(id);
    blocks.push({ id, type: rb.type, variant: isIndex(rb.variant) && rb.variant < def.variants.length ? rb.variant : 0, props: sanitizeProps(rb.type, rb.props) });
  }
  const theme = isObj(raw.theme) ? raw.theme : {};
  return {
    v: SCHEMA_VERSION,
    goal: raw.goal,
    site: { name: clampText(isObj(raw.site) ? raw.site.name : '', SITE_NAME_MAX, false) },
    theme: { preset: THEMES.includes(theme.preset) ? theme.preset : 'soft', accent: isIndex(theme.accent) && theme.accent < ACCENTS.length ? theme.accent : 0 },
    blocks,
  };
}

export const stageOf = (type) => BLOCK_SCHEMA[type].stage;
export const effectOf = (type) => BLOCK_SCHEMA[type].effect;
/** 書き出しのファイル名。 */
export const exportFileName = (goal, ext) => `ux-recipe-${goal}.${ext}`;
