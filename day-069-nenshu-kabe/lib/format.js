const integers = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

export function yen(n) { return `${integers.format(n)}円`; }
export function man(n) { return `${decimals.format(n / 10_000)}万円`; }
export function hours(n) { return `${decimals.format(n)}時間`; }

// 入力欄の下の「＝◯万円」の読み。四捨五入せず1円単位まで出す（基準の1円上と1円下を同じ表示にしないため）
export function manExact(n) {
  const tenThousands = Math.floor(n / 10_000);
  const rest = n % 10_000;
  if (tenThousands === 0) return yen(rest);
  return rest === 0 ? `${integers.format(tenThousands)}万円` : `${integers.format(tenThousands)}万${integers.format(rest)}円`;
}
