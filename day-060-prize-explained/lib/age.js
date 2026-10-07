// 日付だけで計算する。端末のタイムゾーンを持ち込まない。
function parts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  return { y, m: m && d ? m : 7, d: m && d ? d : 1, approximate: !m || !d };
}
export function ageAt(award) {
  // 同梱データは生年月日を配らず、tools/build-data.mjs がこの関数で数えた年齢だけを持つ
  if (!award.born && Number.isInteger(award.age)) {
    return { age: award.age, approximate: Boolean(award.approximate), posthumous: Boolean(award.posthumous) };
  }
  const birth = parts(award.born);
  const announced = parts(award.date) || parts(`${award.year}-12-10`);
  if (!birth || !announced) return { age: null, approximate: true, posthumous: false };
  const death = parts(award.died);
  const stamp = (p) => p.y * 10000 + p.m * 100 + p.d;
  const posthumous = Boolean(death && stamp(death) < stamp(announced));
  const end = posthumous ? death : announced;
  const age = end.y - birth.y - (end.m < birth.m || (end.m === birth.m && end.d < birth.d) ? 1 : 0);
  return { age, approximate: birth.approximate || end.approximate || !award.date, posthumous };
}
export function parseAge(value) {
  const raw = String(value).trim();
  if (!raw) return { state: 'empty', age: null };
  const age = Number(raw);
  return /^\d+$/.test(raw) && age >= 1 && age <= 120
    ? { state: 'valid', age } : { state: 'invalid', age: null };
}
