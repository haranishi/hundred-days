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
  // Day92 は source/ から作った本体だけを配信する（元のコード・試験・仕様・作業の記録は配らない）。
  // tools/ は宣伝動画の道具で、配信には要らない
  'day-092-shuwa': ['source', 'tools'],
  // Day89 は source/ から作った index.html・assets/・world/（山のデータ）・models/ などだけを配信する（元のコード・道具・試験・設計の文書は配らない）。
  // tools/ は宣伝動画の道具で、配信には要らない
  'day-089-frostline': ['source', 'tools'],
  // Day94 は本体を別の場所（day94.rairakku.com）で配信し、source/ にゲームのソースと宣伝動画の道具（source/tools/promo）を置く。どちらも配信しない
  'day-094-super-yaritai': ['source'],
  // Day87 の tools/ は、共有画像と作品の絵を作り直す道具と、宣伝動画の道具。アプリの実行には要らず、配信しない。
  'day-087-oricube': ['tools'],
  // Day84はブラウザ用アセットを配信し、旧NodeソースとWorker/検証ツールは配信しない。
  'day-084-airpresenter': ['source', 'tools', 'web'],
  // Day82は source/ から作った index.html と assets/ だけを配信する（写真の質感の原本・開発用の道具・試験は配らない）
  'day-082-kageuchi': ['source'],
  'day-080-fifth-prince': ['source', 'tools'],
  'day-079-futsu-run': ['source', 'tools'],
  // Day76は固定lockfileから生成した静的成果物だけを配信する。
  'day-076-henkan-desk': ['source', 'tools'],
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
  'day-074-link-dokumi': ['tools'],
  // Day75の解探索・ブラウザ検証は開発用で、静的配信に含めない。
  'day-075-amegumo-sokoban': ['tools']
};

const EXCLUDED_FILES = ['package.json', 'package-lock.json', '_headers'];
const EXCLUDED_TOP_DIRS = ['tools', 'scripts'];
/* Dayのフォルダ直下の LICENSE は、リポジトリ直下のMITと同じ内容の写しで、フォルダだけ持ち出しても条件が分かるように置いている
   （scripts/tests/day-license.test.mjs が見張る）。アプリの一部ではないので配信しない。配信すると、公開した全Dayの本番に
   新しいファイルが80個超増え、拡張子が無いので application/octet-stream で返り、開かずに保存になる。
   深い場所の LICENSE（vendor/・pdf-assets/ に同梱する第三者の許諾の全文）は、同梱が義務なので、これまでどおり配信する */
const EXCLUDED_TOP_FILES = ['LICENSE'];

/** Dayのフォルダからの相対パス（/ 区切り。'' はフォルダそのもの）が、dist/ に配信されるか */
export function isServedPath(dir, relativePath) {
  const rel = String(relativePath);
  const segments = rel.split('/').filter(Boolean);
  // ドットで始まる隠しファイル・隠しディレクトリ（.DS_Store / .env 等）は配信しない
  if (segments.some((seg) => seg.startsWith('.'))) return false;
  // package.json / package-lock.json / _headers はどの深さでも配信しない（build.mjs が必要な _headers のみ別途出力する）
  const base = segments.at(-1);
  if (base && EXCLUDED_FILES.includes(base)) return false;
  // Dayのフォルダ直下の LICENSE だけを外す（深さが違う同名のファイルは、上の理由で配信する）
  if (segments.length === 1 && EXCLUDED_TOP_FILES.includes(segments[0])) return false;

  const path = `/${rel}`;
  // そのフォルダ自身（末尾一致）と、その中身（区切り文字が続く）だけを外す。
  // `tests` が `testsuite` のような別名に当たらないようにしている
  if (EXCLUDED_DIRS.some((name) => path.endsWith(`/${name}`) || path.includes(`/${name}/`))) return false;
  // day-044 だけは、tools で始まる名前を深さを問わず外す（build.mjs にあった特例をそのまま移した）
  if (dir === 'day-044-train-here' && path.includes('/tools')) return false;
  const [top] = rel.split('/');
  if (EXCLUDED_TOP_DIRS.includes(top)) return false;
  return !(SOURCE_DIRS_BY_APP[dir] ?? []).includes(top);
}
