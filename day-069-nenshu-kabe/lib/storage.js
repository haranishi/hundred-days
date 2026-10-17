export const KEY = 'day069-nenshu-kabe:v1';

function validInputs(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ['u18', 'a18', 'a19_22', 'a23p'].includes(value.ageBand) && typeof value.student === 'boolean'
    && Number.isInteger(value.paidSoFar) && value.paidSoFar >= 0 && value.paidSoFar <= 10_000_000
    && (value.hourlyWage === null || (Number.isInteger(value.hourlyWage) && value.hourlyWage >= 1 && value.hourlyWage <= 10_000))
    && Number.isInteger(value.remainingPaydays) && value.remainingPaydays >= 0 && value.remainingPaydays <= 12
    && (value.hoursPerPayday === null || (Number.isFinite(value.hoursPerPayday) && value.hoursPerPayday >= 0
      && value.hoursPerPayday <= 400 && Math.abs(value.hoursPerPayday * 10 - Math.round(value.hoursPerPayday * 10)) < 1e-9));
}

// 入力以外（余分なキー・結果・例のフラグなど）は保存しない。
function pickInputs(value) {
  const { ageBand, student, paidSoFar, hourlyWage, remainingPaydays, hoursPerPayday } = value;
  return { ageBand, student, paidSoFar, hourlyWage, remainingPaydays, hoursPerPayday };
}

export function load(storage) {
  try {
    const text = storage.getItem(KEY);
    if (text === null) return { ok: true, inputs: null };
    let data;
    try { data = JSON.parse(text); } catch { /* 壊れたJSONも削除する */ }
    if (!validInputs(data) || typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) {
      storage.removeItem(KEY);
      return { ok: false, reason: '保存内容の形式が違うため、削除しました。' };
    }
    return { ok: true, inputs: pickInputs(data), savedAt: data.savedAt };
  } catch {
    return { ok: false, reason: 'このブラウザの保存内容を読み込めませんでした。計算は続けられます。' };
  }
}

export function save(storage, inputs) {
  try {
    if (!validInputs(inputs)) return { ok: false, reason: '入力に誤りがあるため、保存できませんでした。' };
    storage.setItem(KEY, JSON.stringify({ ...pickInputs(inputs), savedAt: new Date().toISOString() }));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'この端末に保存できませんでした。計算は続けられます。' };
  }
}

export function clear(storage) {
  try {
    storage.removeItem(KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'この端末の保存内容を削除できませんでした。ブラウザのサイトデータから削除できます。計算は続けられます。' };
  }
}
