const JST = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const when = (value) => {
  const date = new Date(value);
  return Number.isNaN(+date) ? '不明' : `${JST.format(date)}（日本時間）`;
};

/* N3: 報告書・要約は、1行に1つの値を並べた文章。取得した値に行区切りや制御文字が混じっても、偽の行を作れないように1行へ直す。
   範囲は数で持つ（編集の道具が、正規表現の \u 表記を生の制御文字に展開した前例があるため）。 */
const BREAKS = new RegExp(`[${[[0x0, 0x1f], [0x7f, 0x9f], [0x2028, 0x2029], [0x61c, 0x61c], [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]]
  .map(([from, to]) => String.fromCodePoint(from) + (to > from ? `-${String.fromCodePoint(to)}` : '')).join('')}]+`, 'g');
const oneLine = (text) => String(text ?? '').replace(BREAKS, ' ').replace(/ {2,}/g, ' ').trim();

/* N2: 写し（報告書・要約）には「?」以降と「#」以降を残さない。本人確認の文字列などが入りやすく、家族への転送や画面の撮影でそのまま広がるため。
   大文字のHTTPS://・スキームを省いた //host/…・空白で分断された値も対象にする。認証情報つきのアドレス（amazon.co.jp@…）は、偽装の証拠として左側を残し、パスワードの部分は伏せる。 */
const URL_START = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const URL_LIKE = /(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s]+/gi;
function cutQuery(link) {
  const masked = link.replace(/^((?:[a-z][a-z0-9+.-]*:)?\/\/[^/@\s:]*):[^/@\s]*@/i, '$1:…@');
  const at = masked.search(/[?#]/);
  if (at < 0) return masked;
  const rest = masked.slice(at);
  const marker = rest.includes('?') && rest.includes('#') ? '（?・#以降は省略）' : rest.includes('#') && !rest.includes('?') ? '（#以降は省略）' : '（?以降は省略）';
  return masked.slice(0, at) + marker;
}
function scrub(text) {
  const line = oneLine(text);
  // 値そのものがURL（または空白のないパス）のとき：空白で分断されていても、最初の「?」「#」から先をすべて落とす
  if (URL_START.test(line) || (!/\s/.test(line) && /^[./]/.test(line))) return cutQuery(line);
  return line.replace(URL_LIKE, cutQuery);
}
const shownLink = (href) => scrub(href);

// sample：見本（実在しないサイトと、作りものの観測データ）の結果。写した文だけが外へ出ても、本物の診断と取り違えないように先頭に書く。
const SAMPLE_NOTE = '【見本】これは、実在しないサイトと作りものの観測データでの結果です。実際の診断ではありません。';

export function buildReport(result, { now, sample = false } = {}) {
  const roles = { input: '入力したリンク', redirect: '転送の途中', final: '最後の応答' };
  const statuses = { bad: '気になる点', good: '確認できた設定・特徴', info: '参考情報', unknown: '未確認' };
  const severities = { info: '参考', low: '低', medium: '中', high: '高', critical: '最優先' };
  const lines = [...(sample ? [SAMPLE_NOTE] : []), 'リンクの毒見 — 診断報告', `診断日時：${when(now ?? result.evaluatedAt)}`, 'その時点で見えたことの報告です。',
    `対象：${shownLink(result.target.href)}`, '', '転送の経路：', ...result.target.chain.map(h => `${roles[h.role]}：${shownLink(h.url)}${h.status === null ? '' : ` (応答 ${h.status})`}`),
    '', `訪問者向け：${oneLine(result.visitor.headline)}`, oneLine(result.visitor.summary), ...result.visitor.actions.map(a => `行動：${oneLine(a)}`)];
  const appendFinding = f => {
    lines.push(`[${statuses[f.status]} / 重大度：${severities[f.severity]} / ${f.axis === 'owner' ? '減点' : '加点'} ${f.points}点] ${scrub(f.title)}`, `事実：${scrub(f.what)}`, ...f.evidence.map(e => `根拠：${scrub(e)}`), `考えられること：${oneLine(f.why)}`);
    if (f.fix) lines.push(`直し方：${oneLine(f.fix)}`);
    if (f.snippet) for (const key of ['headers', 'nginx', 'apache']) if (f.snippet[key]) lines.push(`${key}：${f.snippet[key]}`);
  };
  result.findings.filter(f => f.axis === 'visitor').forEach(appendFinding);
  lines.push('', `運営者向け：${result.owner.score === null ? '採点なし' : `${result.owner.score}/100点 (${result.owner.grade})`}`, oneLine(result.owner.note));
  for (const fix of result.owner.topFixes) {
    const finding = result.findings.find(f => f.id === fix.id);
    if (finding) lines.push(`先に直すと良いもの（${fix.gain}点分）：${scrub(finding.title)}`);
  }
  result.findings.filter(f => f.axis === 'owner').forEach(appendFinding);
  lines.push('', '見ていないこと・確認の限界：', ...result.limits.map(l => `・${scrub(l)}`));
  return lines.join('\n');
}

// 家族などへ送る短い要約。理由には、実際に見えた値を1つ添える（受け取る側が確かめられるように）。
// 「ok」以外では、疑わしいリンクが貼り先で押せる形にならないよう、スキームを外してドットを[.]にする（開かせない）。
const defang = (text) => text.replace(/(?:[a-z][a-z0-9+.-]*:)?\/\/([^\s/?#]+)/gi, (_, host) => host.replace(/\./g, '[.]'));
export function buildSummary(result, { now, sample = false } = {}) {
  const bad = result.findings.filter(f => f.axis === 'visitor' && f.status === 'bad');
  const risky = result.visitor.level !== 'ok';
  const view = (text) => (risky ? defang(text) : text);
  const valueOf = (reason) => {
    const finding = bad.find(f => f.title === reason);
    const value = finding?.evidence.find(e => e && !/^(入力|転送の途中|最終ページ)：/.test(e) && e !== result.target.host);
    const shown = value == null ? '' : scrub(value);
    return shown && shown.length <= 60 ? `（${view(shown)}）` : '';
  };
  // 兆候が見つかっている段階（気になる・注意・近づかない）では、「見つからなかったことは…」とは言わない
  const caveat = ['ok', 'unknown'].includes(result.visitor.level);
  return [...(sample ? [SAMPLE_NOTE] : []), `リンクの毒見で調べた結果（${when(now ?? result.evaluatedAt)}）`, oneLine(result.visitor.headline), ...(risky ? ['（リンクの毒見で調べた結果です。確かめるまで、このリンクは開かないでください）'] : []),
    `調べたリンク：${view(shownLink(result.target.href))}`,
    ...result.visitor.reasons.slice(0, 3).map(r => `理由：${scrub(r)}${valueOf(r)}`),
    `次に：${oneLine(result.visitor.actions[0] ?? '公式の窓口から確かめてください')}`,
    ...(caveat ? ['見つからなかったことは安全の保証ではありません。'] : [])].join('\n');
}
