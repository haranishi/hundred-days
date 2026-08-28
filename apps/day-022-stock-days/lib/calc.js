export const MAX_VALUE = 100000;

export const BUILTIN_ROWS = [
  { id: 'water', name: '飲料水', unit: 'L', perPerson: 3, priority: 0 },
  { id: 'food', name: '食料', unit: '食', perPerson: 3, priority: 1 },
  { id: 'toilet', name: '簡易トイレ', unit: '回', perPerson: 5, priority: 2 }
];

export function validateNumber(raw, { integer = false, min = 0, max = MAX_VALUE } = {}) {
  if (raw === '' || raw === null || raw === undefined) return { valid: true, empty: true, value: null };
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    return { valid: false, empty: false, value: null };
  }
  return { valid: true, empty: false, value };
}

export function truncateOne(value) {
  return Math.floor((value + Number.EPSILON) * 10) / 10;
}

export function requiredPerDay(perPerson, people) {
  return perPerson * people;
}

export function daysFor(stock, perDay) {
  if (!Number.isFinite(stock) || !Number.isFinite(perDay) || perDay <= 0) return null;
  return truncateOne(stock / perDay);
}

export function shortageFor(stock, perDay, targetDays, { water = false } = {}) {
  const amount = Math.max(0, perDay * targetDays - stock);
  return water ? { amount, bottles: Math.ceil(amount / 2) } : { amount };
}

export function calculate(input) {
  const peopleCheck = validateNumber(input.people, { integer: true, min: 1, max: 20 });
  const targetCheck = validateNumber(input.targetDays, { integer: true, min: 3, max: 7 });
  const rows = [];
  const errors = [];
  let hasStock = false;

  for (const definition of BUILTIN_ROWS) {
    const source = input.rows?.[definition.id] ?? {};
    const stockCheck = validateNumber(source.stock);
    if (!stockCheck.empty) hasStock = true;
    if (!stockCheck.valid) errors.push({ id: definition.id, field: 'stock' });
    const perDay = peopleCheck.valid && !peopleCheck.empty
      ? requiredPerDay(definition.perPerson, peopleCheck.value)
      : null;
    const days = stockCheck.valid && !stockCheck.empty && perDay ? daysFor(stockCheck.value, perDay) : null;
    rows.push({ ...definition, stock: stockCheck.value, perDay, days, valid: stockCheck.valid, included: days !== null });
  }

  (input.custom ?? []).forEach((source, index) => {
    const id = source.id || `custom-${index}`;
    const stockCheck = validateNumber(source.stock);
    const perDayCheck = validateNumber(source.perDay);
    if (!stockCheck.empty) hasStock = true;
    if (!stockCheck.valid) errors.push({ id, field: 'stock' });
    if (!perDayCheck.valid) errors.push({ id, field: 'perDay' });
    const usableRate = perDayCheck.valid && !perDayCheck.empty && perDayCheck.value > 0;
    const days = stockCheck.valid && !stockCheck.empty && usableRate
      ? daysFor(stockCheck.value, perDayCheck.value)
      : null;
    rows.push({
      id,
      name: source.name || '追加の行',
      unit: source.unit || '個',
      stock: stockCheck.value,
      perDay: perDayCheck.value,
      days,
      valid: stockCheck.valid && perDayCheck.valid,
      included: days !== null,
      needsPerDay: perDayCheck.valid && (perDayCheck.empty || perDayCheck.value === 0),
      priority: 3 + index
    });
  });

  if (!peopleCheck.valid || peopleCheck.empty) errors.push({ id: 'people', field: 'people' });
  if (!targetCheck.valid || targetCheck.empty || ![3, 7].includes(targetCheck.value)) {
    errors.push({ id: 'target', field: 'targetDays' });
  }

  const included = rows.filter((row) => row.included);
  const ordered = [...included].sort((a, b) => a.days - b.days || a.priority - b.priority);
  const bottleneck = ordered[0] ?? null;
  return {
    people: peopleCheck.value,
    targetDays: targetCheck.value,
    rows,
    errors,
    hasStock,
    overallDays: bottleneck?.days ?? null,
    bottleneck
  };
}
