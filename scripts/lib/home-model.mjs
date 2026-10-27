export function fold(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

// キーは fold と記号除去の後の表記（カタカナもひらがな）で持つ。
export const TAG_ALIASES = {
  game: 'げーむ',
  puzzle: 'ぱずる',
  security: 'せきゅりてぃ',
  image: '画像',
  music: '音楽'
};

export function tagKey(value) {
  const key = fold(value).replace(/[^\p{L}\p{N}]/gu, '');
  return Object.hasOwn(TAG_ALIASES, key) ? TAG_ALIASES[key] : key;
}

export function splitTitle(title) {
  const index = title.indexOf(' — ');
  return index < 0 ? { main: title, sub: '' } : { main: title.slice(0, index), sub: title.slice(index + 3) };
}

export function tagCatalog(apps) {
  const entries = new Map();
  for (const app of apps) {
    const seen = new Set();
    for (const label of app.tags || []) {
      const key = tagKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!entries.has(key)) entries.set(key, { key, count: 0, labels: new Map() });
      const entry = entries.get(key);
      entry.count++;
      entry.labels.set(label, (entry.labels.get(label) || 0) + 1);
    }
  }
  // 表記が割れたタグは、いちばん多く使われた綴りで見せる（同数なら先に出た綴り）。画面側の「タグ一覧」も同じ規則
  return [...entries.values()]
    .map(({ key, count, labels }) => ({ key, label: [...labels].sort((a, b) => b[1] - a[1])[0][0], count }))
    .sort((a, b) => b.count - a.count);
}

export function quickTags(apps) {
  return tagCatalog(apps).filter((tag) => tag.count <= apps.length * 0.4).slice(0, 12);
}

export function buildMatrix(apps) {
  const byDay = new Map(apps.map((app) => [app.day, app]));
  const length = Math.ceil(Math.max(100, ...byDay.keys()) / 10) * 10;
  return Array.from({ length }, (_, i) => {
    const day = i + 1;
    const app = byDay.get(day);
    return { day, app, state: !app ? 'future' : app.published || app.externalUrl ? 'released' : 'record' };
  });
}

export const RULES = [
  '1つの公開URL・1つの主要アクション・1本のハッピーパス（1日で完成させるための枠）',
  'アカウント登録なし。開いた瞬間から誰でも使える',
  '本名・住所・健康情報など、人を特定できるデータは扱わない（匿名のスコアや作品データはOK）',
  '利用も開発も無料。課金なし・ぜんぶ無料枠で作る',
  '100個すべてを記録する（100個すべての公開は約束しない）'
];

export const PHASES = [
  { from: 1, to: 10, text: 'ブラウザ完結・最小構成。毎日出す型を作る' },
  { from: 11, to: 20, text: '空・読込中・エラー・不正入力の4状態対応' },
  { from: 21, to: 30, text: 'localStorage保存・見た目のこだわり' },
  { from: 31, to: 60, text: '外部API（無料・認証不要）を1個 → 組み合わせ' },
  { from: 61, to: 90, text: '複数API・サーバー側の保存・AIを機能として組み込む' },
  { from: 91, to: 100, text: '新規解禁なし。リクエスト改修と総まとめ' }
];

export function phaseOf(day) {
  return PHASES.findIndex((phase) => day >= phase.from && day <= phase.to);
}
