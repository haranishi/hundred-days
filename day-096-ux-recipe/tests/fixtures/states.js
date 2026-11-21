// 共通の見本データ（親の担当）。単体試験と、見た目の確認（tools/gallery）で使う。
// 状態の形は lib/contract.js が正。ここは「契約どおりの状態」を3つ用意するだけ。
import { BLOCK_SCHEMA, BLOCK_TYPES, SCHEMA_VERSION, sanitizeProps } from '../../lib/contract.js';

/** 足りない項目は空で補った部品。 */
export function block(id, type, variant, props = {}) {
  return { id, type, variant, props: sanitizeProps(type, props) };
}

function maxField(f) {
  if (f.kind === 'text' || f.kind === 'long') return 'あ'.repeat(f.max);
  if (f.kind === 'check') return true;
  return Array.from({ length: f.max }, () => Object.fromEntries(f.item.map((g) => [g.key, maxField(g)])));
}
/** すべての項目を、上限いっぱいの文字数・件数で埋めた中身（はみ出しの確認用）。 */
export function maxProps(type) {
  return Object.fromEntries(BLOCK_SCHEMA[type].fields.map((f) => [f.key, maxField(f)]));
}
function minField(f) {
  if (f.kind === 'text' || f.kind === 'long') return '';
  if (f.kind === 'check') return false;
  return Array.from({ length: f.min }, () => Object.fromEntries(f.item.map((g) => [g.key, minField(g)])));
}
/** すべて空・最小件数（空の項目の見え方の確認用）。 */
export function emptyProps(type) {
  return Object.fromEntries(BLOCK_SCHEMA[type].fields.map((f) => [f.key, minField(f)]));
}

const PHRASE = 'ことばがここに入ります。読みやすい長さの見本の文章です。';
const SPECIAL = { price: '¥3,300', num: '1,200+', time: '10:00', value: '残り3枠', cta: '予約する', button: '予約する', submit: '送信する' };
function midField(f, i = 0) {
  if (f.kind === 'text') return SPECIAL[f.key] ?? PHRASE.slice(0, Math.max(2, Math.ceil(f.max * 0.55)));
  if (f.kind === 'long') return PHRASE.repeat(5).slice(0, Math.ceil(f.max * 0.7));
  if (f.kind === 'check') return i === 1;
  const n = Math.ceil((f.min + f.max) / 2);
  return Array.from({ length: n }, (_, k) => Object.fromEntries(f.item.map((g) => [g.key, midField(g, k)])));
}
/** 実際の文章に近い、中くらいの長さ・件数の中身（見た目の確認の基準）。 */
export function midProps(type) {
  return Object.fromEntries(BLOCK_SCHEMA[type].fields.map((f) => [f.key, midField(f)]));
}

const base = (goal, name, blocks, theme = { preset: 'soft', accent: 0 }) => ({ v: SCHEMA_VERSION, goal, site: { name }, theme, blocks });

/** いちばん小さい、正しい状態。 */
export const MINIMAL = base('reserve', 'ひだまり整体院', [
  block('b1', 'hero', 0, { title: '肩の重さを、今日で手放す', lead: '丁寧な60分の整体です。', cta: '予約する' }),
  block('b2', 'footer', 0, { name: 'ひだまり整体院' }),
]);

/** 手で書いた、予約ページの見本（A2の recipes.js とは別物。試験と見た目の確認の基準）。 */
export const RESERVE_SAMPLE = base('reserve', 'ひだまり整体院', [
  block('b1', 'hero', 0, { eyebrow: '駅から徒歩3分の整体院', title: '肩の重さを、今日で手放す', lead: '丁寧な60分の整体で、朝の体の軽さを取り戻します。初めての方も安心です。', cta: '空き時間を見て予約する', note: '前日までの変更は無料です' }),
  block('b2', 'pain', 0, { heading: 'こんなお悩み、ありませんか？', items: [{ text: '朝から肩がこって、集中できない' }, { text: 'マッサージに行っても、すぐ戻る' }, { text: '何を頼めばいいのか分からない' }], lead: 'その悩み、体の使い方から整えます。' }),
  block('b3', 'benefits', 0, { heading: '選ばれる3つの理由', items: [{ title: '60分、ひとりに専念', text: '施術は院長が1人で担当。途中で交代しません。' }, { title: '痛くしない', text: '強く押さず、動きを見ながら整えます。' }, { title: '通い方を提案', text: '無理に通わせず、必要な回数だけお伝えします。' }] }),
  block('b4', 'menu', 0, { heading: 'メニューと料金', items: [{ name: '初回体験 60分', price: '¥4,400', note: '問診と施術' }, { name: '通常 60分', price: '¥6,600', note: '2回目以降' }, { name: '短時間 30分', price: '¥3,300', note: '肩と首だけ' }], foot: '料金は税込です。' }),
  block('b5', 'voices', 0, { heading: 'お客様の声', items: [{ quote: '初めてでも、説明が丁寧で安心できました。', who: '30代・会社員' }, { quote: '帰り道に、肩がふっと軽くなりました。', who: '40代・事務職' }] }),
  block('b6', 'steps', 0, { heading: 'ご来院の流れ', items: [{ title: '予約', text: 'ボタンから日時を選びます。' }, { title: '問診', text: '今のお体の状態をうかがいます。' }, { title: '施術', text: '60分かけて整えます。' }] }),
  block('b7', 'faq', 0, { heading: 'よくある質問', items: [{ q: '服装は？', a: '動きやすい服装なら、そのままで大丈夫です。' }, { q: '当日の予約はできますか？', a: '空きがあれば、当日の予約も受け付けます。' }] }),
  block('b8', 'form', 0, { heading: 'ご予約', items: [{ label: 'お名前' }, { label: 'ご希望の日時' }, { label: '電話番号' }], submit: '予約を送る', note: '1営業日以内にご連絡します。' }),
  block('b9', 'access', 0, { heading: '場所と営業時間', items: [{ label: '住所', value: '〇〇市△△町1-2-3 2階' }, { label: '営業時間', value: '10:00〜20:00（水曜休み）' }] }),
  block('b10', 'footer', 0, { name: 'ひだまり整体院', text: 'このページはサンプルです。' }),
]);

/** 全部品・全バリエーション・上限いっぱいの文字数（はみ出し・折り返しの確認用）。 */
export const STRESS = (() => {
  const blocks = [];
  let n = 1;
  for (const type of BLOCK_TYPES) {
    BLOCK_SCHEMA[type].variants.forEach((_, variant) => { blocks.push({ id: `b${n}`, type, variant, props: sanitizeProps(type, maxProps(type)) }); n += 1; });
  }
  return { v: SCHEMA_VERSION, goal: 'buy', site: { name: 'あ'.repeat(24) }, theme: { preset: 'lively', accent: 4 }, blocks: blocks.slice(0, 18) };
})();

/** 全部品・全バリエーションを、1つずつ別の状態にしたもの（種類ごとの見た目の確認用）。 */
export function oneEach(type, variant, props = null, theme = { preset: 'soft', accent: 0 }) {
  return base('reserve', 'サンプル', [{ id: 'b1', type, variant, props: sanitizeProps(type, props ?? maxProps(type)) }], theme);
}
