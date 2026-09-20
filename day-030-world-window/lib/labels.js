/* 画面に出す語の日本語化。地図データ由来の値は英語のままなので、ここで寄せる。
   知らない値はそのまま返す（情報を落とさない）。 */
const CONTINENTS = {
  Asia: 'アジア',
  Europe: 'ヨーロッパ',
  Africa: 'アフリカ',
  'North America': '北アメリカ',
  'South America': '南アメリカ',
  Oceania: 'オセアニア',
  Antarctica: '南極',
  'Seven seas (open ocean)': '海洋',
};

export function continentLabel(name) {
  if (name === null || name === undefined) return '';
  return CONTINENTS[name] || String(name);
}

/* 運営者に URL がそのまま入っている地物がある。全文を出すと欄からあふれて途中で切れ、
   何の情報にもならないのでホスト名だけにする（提供元へのリンクは別に用意してある）。 */
export function operatorLabel(operator) {
  const value = String(operator ?? '').trim();
  if (!/^https?:\/\//i.test(value)) return operator ?? null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}
