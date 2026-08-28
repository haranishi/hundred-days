export const STORAGE_NAME = 'day022.stock.v1';
export const VERSION = 1;

export function initialState() {
  return {
    v: VERSION,
    people: 2,
    targetDays: 7,
    flags: { infant: false, pet: false },
    rows: {
      water: { stock: '', expiry: '' },
      food: { stock: '', expiry: '' },
      toilet: { stock: '', expiry: '' }
    },
    custom: [],
    updatedAt: null
  };
}

function text(value, maxLength = 100) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function restore(data) {
  if (!data || data.v !== VERSION || typeof data !== 'object') return null;
  const base = initialState();
  const people = Number(data.people);
  const targetDays = Number(data.targetDays);
  const rows = {};
  for (const id of ['water', 'food', 'toilet']) {
    rows[id] = {
      stock: data.rows?.[id]?.stock ?? '',
      expiry: text(data.rows?.[id]?.expiry, 10)
    };
  }
  return {
    ...base,
    people: Number.isInteger(people) && people >= 1 && people <= 20 ? data.people : base.people,
    targetDays: [3, 7].includes(targetDays) ? targetDays : base.targetDays,
    flags: { infant: Boolean(data.flags?.infant), pet: Boolean(data.flags?.pet) },
    rows,
    custom: Array.isArray(data.custom) ? data.custom.slice(0, 4).map((row, index) => ({
      id: /^[-a-zA-Z0-9]+$/.test(row?.id) ? row.id : `custom-${index + 1}`,
      name: text(row?.name, 20),
      unit: text(row?.unit, 4) || '個',
      stock: row?.stock ?? '',
      perDay: row?.perDay ?? '',
      expiry: text(row?.expiry, 10)
    })) : [],
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null
  };
}

export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_NAME);
  } catch {
    return { state: initialState(), canSave: false };
  }
  if (!raw) return { state: initialState(), canSave: true };
  try {
    const state = restore(JSON.parse(raw));
    return { state: state ?? initialState(), canSave: true };
  } catch {
    return { state: initialState(), canSave: true };
  }
}

export function serialize(state, now = new Date()) {
  return JSON.stringify({
    v: VERSION,
    people: state.people,
    targetDays: state.targetDays,
    flags: { infant: Boolean(state.flags?.infant), pet: Boolean(state.flags?.pet) },
    rows: state.rows,
    custom: state.custom,
    updatedAt: now.toISOString()
  });
}

export function save(storage, state, now = new Date()) {
  try {
    storage.setItem(STORAGE_NAME, serialize(state, now));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

export function clear(storage) {
  try {
    storage.removeItem(STORAGE_NAME);
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}
