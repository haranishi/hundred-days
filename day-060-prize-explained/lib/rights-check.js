// ブラウザで集めた文字・URL・カードの情報を同じ条件で検査する。
export function checkRights(snapshot) {
  const errors = [];
  if (snapshot.titles.some((text) => /\u30ce\u30fc\u30d9\u30eb|Nobel/i.test(text)) || /\u30ce\u30fc\u30d9\u30eb|Nobel/i.test(snapshot.firstScreen)) errors.push('a: 題名・見出し・最初の画面に提供元の名前があります');
  if (snapshot.mediaCount || snapshot.requests.some((value) => {
    try { const url = new URL(value); return url.origin !== snapshot.origin && url.origin !== 'https://api.nobelprize.org'; } catch { return true; }
  })) errors.push('b: メディアまたは許可されていない通信があります');
  if (snapshot.links.some((value) => {
    try {
      const url = new URL(value);
      return (url.hostname === 'nobelprize.org' || url.hostname.endsWith('.nobelprize.org')) && /\.(pdf|jpg|jpeg|png|gif|webp|svg|mp4|mp3|webm)(?:$|\/)|\/(uploads|wp-content)(?:\/|$)/i.test(decodeURIComponent(url.pathname));
    } catch { return true; }
  })) errors.push('c: HTML以外の公式リンクがあります');
  for (const card of snapshot.cards) {
    if (card.state !== 'ready') continue;
    if (!/作者が[\s\S]*自分の言葉で書いた/.test(card.note) || !/確認日：\d+年\d+月\d+日/.test(card.note)) errors.push('d: 作者の注記または確認日がありません');
    if (card.expected && !card.labels.includes('まだ実現していません')) errors.push('e: 期待の札がありません');
    if (['lit', 'pea'].includes(card.cat) && (card.mode !== 'facts' || card.headings.some((v) => ['何が変わったか', 'これから期待されていること', '発見から受賞まで'].includes(v)))) errors.push('f: 活動の事実以外の欄があります');
  }
  return errors;
}
