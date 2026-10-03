// OWNER: ui
// 画面に出す数字の書き方（日本語の単位）。純粋な関数なのでテストで確かめる。

const group = (n: number): string => Math.floor(n).toLocaleString('ja-JP');

/** 円を「万・億・兆」で短く書く。例：1,234億円、1兆2,300億円。 */
export function formatYen(yen: number): string {
  const y = Math.max(0, yen);
  if (y < 1e4) return `${group(y)}円`;
  if (y < 1e8) return `${group(y / 1e4)}万円`;
  if (y < 1e12) return `${group(y / 1e8)}億円`;
  const cho = Math.floor(y / 1e12);
  const oku = Math.floor((y - cho * 1e12) / 1e8);
  return oku > 0 ? `${group(cho)}兆${group(oku)}億円` : `${group(cho)}兆円`;
}

/** 残り時間 m:ss（切り上げ。0.2秒残りでも 0:01 と出す）。 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatPercent(ratio: number): string {
  return `${(Math.max(0, ratio) * 100).toFixed(1)}%`;
}

/** 前回との差（r02-controls：結果の画面）。符号を必ず付ける。例：+120億円、-3億円、±0円。 */
export function formatYenDiff(diff: number): string {
  if (Math.abs(diff) < 1) return '±0円';
  return `${diff > 0 ? '+' : '-'}${formatYen(Math.abs(diff))}`;
}

/** 破壊率の差は「ポイント」で書く。例：+1.2pt。 */
export function formatPercentDiff(diff: number): string {
  const v = Math.round(diff * 1000) / 10;
  if (v === 0) return '±0.0pt';
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}pt`;
}

export function formatCountDiff(diff: number): string {
  if (diff === 0) return '±0';
  return `${diff > 0 ? '+' : '-'}${Math.abs(diff)}`;
}
