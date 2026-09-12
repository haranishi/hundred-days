/* e-Gov 法令API Version 2 が返す木を、画面に出せる形にする。

   返ってくるのは {tag, attr, children} の入れ子。条文には表や別表も入りうるので、
   知らないタグは「中に文字列があれば拾う」という扱いにして、落とさない。

   本文の文字列はここでも変えない。連結するだけ。 */

/* 法令XMLのルビは <Ruby>漢字<Rt>かな</Rt></Ruby>。Rt を拾うと本文に読みが混ざる。 */
const SKIP_TAGS = new Set(['Rt', 'RubyTxt']);

export function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  if (SKIP_TAGS.has(node.tag)) return '';
  return (node.children || []).map(textOf).join('');
}

const childrenWithTag = (node, tag) =>
  (node?.children || []).filter((c) => c && typeof c === 'object' && c.tag === tag);

const firstWithTag = (node, tag) => childrenWithTag(node, tag)[0] || null;

/* 号。「一」と本文に分ける。号の中の号（Subitem1）は本文へ畳んで出す。 */
function toItem(node) {
  const title = textOf(firstWithTag(node, 'ItemTitle')).trim();
  const body = (node.children || [])
    .filter((c) => c && typeof c === 'object' && c.tag !== 'ItemTitle')
    .map(textOf)
    .join('')
    .trim();
  return { title, text: body };
}

/* 項。本文と、ぶら下がる号。 */
function toParagraph(node, index) {
  const attrNum = node?.attr?.Num;
  const num = Number.parseInt(attrNum, 10);
  const items = childrenWithTag(node, 'Item').map(toItem);
  const text = (node.children || [])
    .filter((c) => c && typeof c === 'object' && c.tag !== 'Item' && c.tag !== 'ParagraphNum')
    .map(textOf)
    .join('')
    .trim();
  return { num: Number.isFinite(num) ? num : index + 1, text, items };
}

/* APIのレスポンス1件を、画面が必要とするものだけに絞る。 */
export function toArticle(payload) {
  const full = payload?.law_full_text;
  if (!full || full.tag !== 'Article') return null;
  const revision = payload.revision_info || {};
  const info = payload.law_info || {};
  const paragraphs = childrenWithTag(full, 'Paragraph').map(toParagraph);
  if (!paragraphs.length) return null;
  return {
    lawTitle: revision.law_title || '',
    lawNum: info.law_num || '',
    lawId: info.law_id || '',
    /* いつ時点の条文か。これが無い条文は出さない */
    enforcedOn: revision.amendment_enforcement_date || '',
    articleNum: full.attr?.Num || '',
    caption: textOf(firstWithTag(full, 'ArticleCaption')).trim(),
    title: textOf(firstWithTag(full, 'ArticleTitle')).trim(),
    paragraphs,
  };
}

/* 2026-07-17 → 2026年7月17日。施行日を人が読む形にする。 */
export function formatEnforcedOn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

export function apiUrl(lawId, articleNum) {
  const id = encodeURIComponent(lawId);
  const num = encodeURIComponent(articleNum);
  return `https://laws.e-gov.go.jp/api/2/law_data/${id}?response_format=json&elm=Article_${num}`;
}

/* 原典。アプリを信じなくても、ここから自分の目で確かめられるようにする。
   アンカーは条番号から組み立てられない（章番号が入る）ので、topics.js が持っているものを渡す。
   渡されなかった場合も法令のページには着く。 */
export function sourceUrl(lawId, anchor) {
  const base = `https://laws.e-gov.go.jp/law/${encodeURIComponent(lawId)}`;
  return anchor ? `${base}#${anchor}` : base;
}
