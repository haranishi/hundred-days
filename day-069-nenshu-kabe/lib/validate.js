// DOM・基準データに依存しない入力の検証。上下限は設計の Inputs 契約。
const FIELDS = {
  paidSoFar: { label: '支払い済みの給料', min: 0, max: 10_000_000, unit: '円', example: '120000' },
  hourlyWage: { label: '時給', min: 1, max: 10_000, unit: '円', optional: true, example: '1200' },
  remainingPaydays: { label: '残りの給料日', min: 0, max: 12, unit: '回', example: '3' },
  hoursPerPayday: { label: '1回あたりの時間', min: 0, max: 400, unit: '時間', optional: true, decimal: true, example: '7.5' },
};

// 金額の欄は3桁区切りのカンマを読み飛ばす。小数を入れる時間の欄では、カンマは受け付けない（「8,5」を85時間にしないため）
function normalize(text, { keepCommas = false } = {}) {
  if (typeof text !== 'string' && typeof text !== 'number') return '';
  const half = String(text).trim().replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/．/g, '.').replace(/[－−]/g, '-');
  return keepCommas ? half : half.replace(/[，,]/g, '');
}

function parseNumber(text, spec = {}) {
  const normalized = normalize(text, { keepCommas: Boolean(spec.decimal) });
  if (normalized === '') return { ok: false, message: '数字を入力してください。' };
  // 「-0」も負の数として落とす（-0 は 0 より小さくないので、値の比較では見逃す）
  if (normalized.startsWith('-')) return { ok: false, message: '負の数は入力できません。' };
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { ok: false, message: `数字だけで入力してください（例：${spec.example ?? '120000'}）。` };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, message: '扱える範囲の数字で入力してください。' };
  return { ok: true, value };
}

export function parseYen(text) {
  const result = parseNumber(text);
  if (!result.ok) return result;
  return Number.isSafeInteger(result.value) ? result : { ok: false, message: '円は整数で入力してください。' };
}

export function validateInputs(raw) {
  const errors = {};
  const inputs = {};
  const data = raw ?? {};
  if (!['u18', 'a18', 'a19_22', 'a23p'].includes(data.ageBand)) errors.ageBand = '年齢区分を選んでください。';
  else inputs.ageBand = data.ageBand;
  if (typeof data.student !== 'boolean') errors.student = '学生かどうかを選んでください。';
  else inputs.student = data.student;

  for (const [field, spec] of Object.entries(FIELDS)) {
    const value = data[field];
    if (spec.optional && (value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))) {
      inputs[field] = null;
      continue;
    }
    const result = parseNumber(value, spec);
    let reason = result.ok ? '' : result.message;
    if (result.ok) {
      if (result.value < spec.min) reason = `${spec.min}${spec.unit}以上で入力してください。`;
      else if (result.value > spec.max) reason = `${spec.max.toLocaleString('ja-JP')}${spec.unit}以下で入力してください。`;
      else if (spec.decimal && /\.\d{2,}$/.test(normalize(value, { keepCommas: true }))) reason = '小数第1位までで入力してください。';
      else if (!spec.decimal && !Number.isInteger(result.value)) reason = '整数で入力してください。';
    }
    if (reason) errors[field] = `${spec.label}：${reason}`;
    else inputs[field] = result.value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, inputs };
}
