// research/R2 §C-1のPHP公式期限、§C-2のApache（月まで）、§C-3のIIS（ESU込み）。
const PHP = { '5.6': '2018-12-31', '7.0': '2019-01-10', '7.1': '2019-12-01', '7.2': '2020-11-30', '7.3': '2021-12-06', '7.4': '2022-11-28', '8.0': '2023-11-26', '8.1': '2025-12-31', '8.2': '2026-12-31', '8.3': '2027-12-31', '8.4': '2028-12-31', '8.5': '2029-12-31' };
const IIS = { '6.0': '2015-07-14', '7.0': '2024-01-09', '7.5': '2024-01-09', '8.0': '2026-10-13', '8.5': '2026-10-13' };
export function detectEol(headers, now = Date.now()) {
  const values = [headers.server, headers['x-powered-by']].filter(Boolean).join(' ');
  const found = [];
  for (const [product, pattern, dates] of [
    ['PHP', /\bPHP\/(\d+\.\d+)(?:\.\d+)?\b/ig, PHP],
    ['Apache', /\bApache\/(\d+\.\d+)(?:\.\d+)?\b/ig, { '2.2': '2017-12' }],
    ['IIS', /\bMicrosoft-IIS\/(\d+\.\d+)\b/ig, IIS]
  ]) {
    for (const match of values.matchAll(pattern)) {
      const series = match[1];
      const [major, minor] = series.split('.').map(Number);
      const [oldestMajor, oldestMinor] = Object.keys(dates)[0].split('.').map(Number);
      const older = major >= (product === 'PHP' ? 4 : 1) && (major < oldestMajor || (major === oldestMajor && minor < oldestMinor));
      const eolDate = dates[series] ?? null;
      // 日が未確認のApacheは月末まで待ち、架空の終了日を表示しない。
      const end = eolDate?.length === 7 ? `${eolDate}-31` : eolDate;
      if ((older || (end && +new Date(now) > Date.parse(`${end}T23:59:59.999Z`))) && !found.some(f => f.product === product && f.series === series)) {
        found.push({ product, series, eolDate, detail: older ? `${product} ${series}系は、上流の保守が終了済みの古い系統です。配布元の延長保守・修正の適用はこの診断では確認できません。` : `${product} ${series}系の上流保守は終了済み。配布元の延長保守・修正適用は未確認です。古い番号でも修正済みの場合があり、新しい番号でも安全とは限りません。` });
      }
    }
  }
  return found;
}
