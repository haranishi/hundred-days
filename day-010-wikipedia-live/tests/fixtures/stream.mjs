/* E2E用の固定ストリーム。上流（stream.wikimedia.org）には一切つながない。
   本物は毎秒30件ほど流れてきて中身も毎回違うので、そのままでは何も固定できない。

   IPアドレスは RFC 5737 / RFC 3849 の文書用アドレス、利用者名は架空のものを使う。
   実在の匿名編集者のIPをテストデータとして公開リポジトリへ置かないため。 */

export const RETRY_MS = 300; // 再接続の待ち時間。テストを待たせないために短くする

const base = {
  $schema: '/mediawiki/recentchange/1.0.0',
  type: 'edit',
  namespace: 0,
  bot: false,
  minor: false,
  comment: '',
  timestamp: 1786900000,
  wiki: 'jawiki',
  server_name: 'ja.wikipedia.org',
};

const event = (id, overrides) => ({
  ...base,
  ...overrides,
  meta: { id, domain: overrides.server_name || base.server_name },
  title_url: `https://${overrides.server_name || base.server_name}/wiki/${encodeURIComponent(overrides.title || '')}`,
});

const ja = (id, title, oldSize, newSize, overrides = {}) =>
  event(id, { title, length: { old: oldSize, new: newSize }, ...overrides });

/* 世界の編集としては11件、日本語版の記事として読ませるのは6件。
   数えないもの＝ノート（名前空間1）以外の言語・カテゴリ操作・重複イベント。 */
export const SAMPLE = [
  ja('e1', '秋田県', 1000, 1210, { comment: '体裁調整', user: '192.0.2.10' }),
  ja('e2', 'Akita', 500, 550, { wiki: 'enwiki', server_name: 'en.wikipedia.org' }),
  ja('e3', 'カレーライス', 5320, 5000, { comment: '/* 概要 */ 重複を整理' }),
  ja('e4', 'File:Sample.jpg', 100, 112, { wiki: 'commonswiki', server_name: 'commons.wikimedia.org', namespace: 6 }),
  ja('e5', 'ノート:秋田県', 200, 280, { namespace: 1, comment: '議論に返信' }),
  ja('e6', 'テスト記事', 0, 1200, { type: 'new', comment: '新規作成' }),
  ja('e7', '自動販売機', 3000, 3015, { bot: true, comment: 'リンク修正' }),
  ja('e8', '駅', 900, 895, { comment: '[[利用者:テスト太郎]] の編集を差し戻し' }),
  ja('e9', 'Category:秋田県', 0, 0, { type: 'categorize', namespace: 14 }),
  ja('e1', '秋田県', 1000, 1210, { comment: '体裁調整', user: '192.0.2.10' }), // 再送された同じイベント
  ja('e11', 'Berlin', 700, 760, { wiki: 'dewiki', server_name: 'de.wikipedia.org' }),
  ja('e12', 'Москва', 800, 870, { wiki: 'ruwiki', server_name: 'ru.wikipedia.org' }),
  ja('e13', '図書館', 400, 440, { comment: '誤字修正', user: '2001:db8:0:0:0:0:0:1' }),
];

export const SAMPLE_WORLD = 11;
export const SAMPLE_JA = 6;
/** 新しい順（画面の並び順）。 */
export const SAMPLE_JA_TITLES = ['図書館', '駅', '自動販売機', 'テスト記事', 'カレーライス', '秋田県'];

/** 一覧の上限を超えさせるための束。prefix を変えれば別のイベントとして数えられる。 */
export const manyJa = (prefix, count) =>
  Array.from({ length: count }, (_, index) => ja(`${prefix}-${index}`, `記事${index + 1}`, 100, 100 + index + 1, { comment: '加筆' }));

export function toSse(events) {
  const head = `retry: ${RETRY_MS}\n\n`;
  return head + events.map((item) => `data: ${JSON.stringify(item)}\n\n`).join('');
}
