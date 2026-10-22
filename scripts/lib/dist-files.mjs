/* build.mjs が dist/ に配信しないもの。build.mjs のコピーと、公開の契約（og:image・screenshot の実在確認）が同じ規則を使う。
   規則が2か所にあると、片方だけ直したときに、手元の検査は通るのに本番の画像が404になる。 */

/* アプリのフォルダは原則そのまま配信するが、次の開発用ディレクトリは外す。
   - tools/cache/ は素材の置き場（day-031 の行政区域 zip で 890MB）。同梱データは data/ に
     書き出し済みなので配信には要らない。CI には cache が無いので、消えるのは手元の dist だけ
   - tests/ は、中の fixtures に第三者の生データが入っている（day-033 の気象庁の実応答、
     day-034 の潮位表、day-023 のNDLの生レスポンス）。ここに置いたつもりのものが本番URLから
     落とせる状態になるので外す。E2E は dist ではなく各Dayのソースからフィクスチャを読んでいるので影響しない
   - node_modules/ はビルド用の依存。必要なブラウザコードだけ vendor/ にまとめる。
   ⚠️ 除外は名前の列挙なので、新しく「配信したくないフォルダ」を作ったらここに足すこと */
export const EXCLUDED_DIRS = ['tools/cache', 'tests', 'node_modules'];

/* ソースから組み立てたビルド結果を同じフォルダに置いているDayは、ソースと生成ツールを配信しない。
   見るのはDayのフォルダ直下の名前だけ（リポジトリを置いた場所の名前に source が含まれていても外さない） */
export const SOURCE_DIRS_BY_APP = {
  'day-070-flip-court': ['tools'],
  'day-071-kage-shogen': ['tools'],
  'day-068-timetable-alibi': ['tools'],
  'day-056-dragon-rush': ['source', 'tools'],
  'day-058-meisho-kumitate': ['source', 'tools'],
  'day-059-kuchi-sanmai': ['source', 'tools'],
  'day-061-kumimae': ['source', 'tools'],
  'day-064-breach-atlas': ['source', 'tools'],
  // day-066 は素のJSをそのまま配信する。tools/ は宣伝動画の道具で、配信には要らない
  'day-066-hakokage-kaito': ['tools'],
  // day-060 は素のJSをそのまま配信する（source は無い）。tools/ はデータの作り直し・解説の検査・宣伝動画の道具で、配信には要らない
  'day-060-prize-explained': ['tools'],
  // day-074 の tools/ は、観測APIを実在のサイトで確かめる検証の道具（api-check.mjs）。配信には要らない
  'day-074-link-dokumi': ['tools']
};

/** Dayのフォルダからの相対パス（/ 区切り。'' はフォルダそのもの）が、dist/ に配信されるか */
export function isServedPath(dir, relativePath) {
  const path = `/${relativePath}`;
  // そのフォルダ自身（末尾一致）と、その中身（区切り文字が続く）だけを外す。
  // `tests` が `testsuite` のような別名に当たらないようにしている
  if (EXCLUDED_DIRS.some((name) => path.endsWith(`/${name}`) || path.includes(`/${name}/`))) return false;
  // day-044 だけは、tools で始まる名前を深さを問わず外す（build.mjs にあった特例をそのまま移した）
  if (dir === 'day-044-train-here' && path.includes('/tools')) return false;
  const [top] = String(relativePath).split('/');
  return !(SOURCE_DIRS_BY_APP[dir] ?? []).includes(top);
}
