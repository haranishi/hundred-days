/* 8地方区分。Day 024 の lib/blocks.js と同じ切り方（学校で習う区分・三重県は近畿）。
   県は総務省の2桁コードで持つ。同梱データを作る tools/ と、アプリの両方から読む。 */

export const REGIONS = [
  { id: 'hokkaido', label: '北海道', prefs: ['01'] },
  { id: 'tohoku', label: '東北', prefs: ['02', '03', '04', '05', '06', '07'] },
  { id: 'kanto', label: '関東', prefs: ['08', '09', '10', '11', '12', '13', '14'] },
  { id: 'chubu', label: '中部', prefs: ['15', '16', '17', '18', '19', '20', '21', '22', '23'] },
  { id: 'kinki', label: '近畿', prefs: ['24', '25', '26', '27', '28', '29', '30'] },
  { id: 'chugoku', label: '中国', prefs: ['31', '32', '33', '34', '35'] },
  { id: 'shikoku', label: '四国', prefs: ['36', '37', '38', '39'] },
  { id: 'kyushu', label: '九州・沖縄', prefs: ['40', '41', '42', '43', '44', '45', '46', '47'] }
];

export function regionOfPref(code) {
  return REGIONS.find((region) => region.prefs.includes(String(code))) ?? null;
}

export function regionById(id) {
  return REGIONS.find((region) => region.id === id) ?? null;
}

/** ヒントに出す文言。「東北地方」のように「地方」を足す。北海道だけはそのまま */
export function regionHint(code) {
  const region = regionOfPref(code);
  if (!region) return '';
  return region.id === 'hokkaido' ? region.label : `${region.label}地方`;
}
