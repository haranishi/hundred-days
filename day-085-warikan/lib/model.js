export const LIMITS = Object.freeze({ members: 12, expenses: 100, amount: 1_000_000_000, hash: 32_000 });
export const emptyState = () => ({ version: 1, members: [], expenses: [] });
const fail = (message) => { throw new Error(message); };
const idOK = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const cleanText = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${label}は1〜${max}文字で入力してください。`);
  }
  return value.trim();
};
export const nameKey = (name) => name.normalize('NFKC').toLocaleLowerCase('ja');

export function parseAmount(input) {
  const text = String(input).normalize('NFKC').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) fail('金額は1円以上の整数で入力してください。');
  const amount = Number(text.replaceAll(',', ''));
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > LIMITS.amount) fail('金額は1〜1,000,000,000円で入力してください。');
  return amount;
}

export function validateState(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.members) || !Array.isArray(input.expenses)) fail('データの形式を確認できませんでした。');
  if (input.members.length > LIMITS.members || input.expenses.length > LIMITS.expenses) fail('人数または支払い件数の上限を超えています。');
  const ids = new Set(), names = new Set();
  const members = input.members.map((member) => {
    if (!member || !idOK(member.id) || ids.has(member.id)) fail('メンバーのIDが不正です。');
    const name = cleanText(member.name, 20, '名前');
    if (names.has(nameKey(name))) fail('同じ名前のメンバーがいます。区別できる名前にしてください。');
    ids.add(member.id); names.add(nameKey(name));
    return { id: member.id, name };
  });
  const expenseIds = new Set();
  const expenses = input.expenses.map((expense) => {
    if (members.length < 2) fail('支払いの登録には2人以上のメンバーが必要です。');
    if (!expense || !idOK(expense.id) || expenseIds.has(expense.id)) fail('支払いのIDが不正です。');
    expenseIds.add(expense.id);
    if (!ids.has(expense.payerId)) fail('支払った人が見つかりません。');
    if (!Number.isSafeInteger(expense.amount) || expense.amount < 1 || expense.amount > LIMITS.amount) fail('金額が範囲外です。');
    if (!Array.isArray(expense.participantIds) || !expense.participantIds.length || expense.participantIds.length > members.length ||
        expense.participantIds.some((id) => !ids.has(id)) || new Set(expense.participantIds).size !== expense.participantIds.length) fail('割り勘の対象者を確認してください。');
    return { id: expense.id, payerId: expense.payerId, label: cleanText(expense.label, 40, '内容'), amount: expense.amount,
      participantIds: members.filter((member) => expense.participantIds.includes(member.id)).map((member) => member.id) };
  });
  return { version: 1, members, expenses };
}

/** Maximizing disjoint zero-sum groups minimizes edges in the settlement graph. */
export function settleBalances(balances) {
  if (!Array.isArray(balances) || balances.length > LIMITS.members || balances.some((entry) => !idOK(entry.id) || !Number.isSafeInteger(entry.balance)) ||
      new Set(balances.map((entry) => entry.id)).size !== balances.length || balances.reduce((sum, entry) => sum + entry.balance, 0) !== 0) fail('差額の合計が一致しません。');
  const active = balances.filter((entry) => entry.balance !== 0);
  const size = 1 << active.length;
  const sums = new Float64Array(size), best = new Int8Array(size), chosen = new Int8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const bit = mask & -mask, index = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + active[index].balance;
    let score = -1;
    for (let i = 0; i < active.length; i++) {
      if ((mask & (1 << i)) && best[mask ^ (1 << i)] > score) {
        score = best[mask ^ (1 << i)]; chosen[mask] = i;
      }
    }
    best[mask] = score + (sums[mask] === 0 ? 1 : 0);
  }
  const order = [];
  for (let mask = size - 1; mask; ) {
    const i = chosen[mask]; order.push(active[i]); mask ^= 1 << i;
  }
  order.reverse();
  const transfers = [];
  let group = [], running = 0;
  for (const entry of order) {
    group.push({ ...entry }); running += entry.balance;
    if (running !== 0) continue;
    const debtors = group.filter((item) => item.balance < 0), creditors = group.filter((item) => item.balance > 0);
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const from = debtors[d], to = creditors[c], amount = Math.min(-from.balance, to.balance);
      transfers.push({ from: from.id, to: to.id, amount });
      from.balance += amount; to.balance -= amount;
      if (!from.balance) d++;
      if (!to.balance) c++;
    }
    group = [];
  }
  if (transfers.length !== active.length - best[size - 1]) fail('精算手順を作れませんでした。');
  return transfers;
}

export function calculate(input) {
  const state = validateState(input);
  const balances = state.members.map((member) => ({ ...member, paid: 0, owed: 0, balance: 0 }));
  const byId = new Map(balances.map((entry) => [entry.id, entry]));
  let total = 0, rounded = false;
  for (const expense of state.expenses) {
    total += expense.amount; byId.get(expense.payerId).paid += expense.amount;
    const part = Math.floor(expense.amount / expense.participantIds.length);
    const remainder = expense.amount % expense.participantIds.length;
    rounded ||= remainder !== 0;
    expense.participantIds.forEach((id, i) => { byId.get(id).owed += part + (i < remainder ? 1 : 0); });
  }
  for (const entry of balances) entry.balance = entry.paid - entry.owed;
  return { total, balances, transfers: settleBalances(balances), rounded };
}

export const yen = (amount) => `${amount.toLocaleString('ja-JP')}円`;
export function settlementText(state) {
  const result = calculate(state), names = new Map(state.members.map((member) => [member.id, member.name]));
  return [
    '【最小ワリカン｜精算メモ】', `立て替え合計 ${yen(result.total)}／${state.members.length}人`,
    `送金は全部で${result.transfers.length}回`, '',
    ...result.transfers.map((transfer, i) => `${i + 1}. ${names.get(transfer.from)} → ${names.get(transfer.to)}：${yen(transfer.amount)}`),
    ...(result.transfers.length ? [] : ['送金は不要です。全員の過不足がありません。']),
    '', '〈内訳：支払額／負担額〉', ...result.balances.map((entry) => `${entry.name}：${yen(entry.paid)}／${yen(entry.owed)}`),
    ...(result.rounded ? ['', '割り切れない1円は、支払いごとにメンバーの登録順で配分しています。'] : []),
    '', '上の送金で全員の過不足がゼロになります。', '※このメモ自体は送金を行いません。',
  ].join('\n');
}

export function encodeState(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateState(state)));
  const hash = '#v1=' + btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (hash.length > LIMITS.hash) fail('共有URLが長すぎます。精算文のコピーをご利用ください。');
  return hash;
}
export function decodeState(hash) {
  if (typeof hash !== 'string' || hash.length > LIMITS.hash || !/^#v1=[A-Za-z0-9_-]+$/.test(hash)) fail('共有URLの形式を確認できませんでした。');
  try {
    const raw = hash.slice(4).replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
    return validateState(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch { fail('共有URLを読み込めませんでした。送り主にリンクを確認してください。'); }
}

export const exampleState = () => ({
  version: 1,
  members: [{ id: 'a', name: 'あおい' }, { id: 'b', name: 'はる' }, { id: 'c', name: 'りん' }, { id: 'd', name: 'ゆう' }],
  expenses: [
    { id: 'e1', payerId: 'a', label: '宿泊代', amount: 24000, participantIds: ['a', 'b', 'c', 'd'] },
    { id: 'e2', payerId: 'b', label: 'レンタカー', amount: 12000, participantIds: ['a', 'b', 'c', 'd'] },
    { id: 'e3', payerId: 'c', label: '夜ごはん', amount: 8000, participantIds: ['a', 'b', 'c', 'd'] },
    { id: 'e4', payerId: 'd', label: 'カフェ（あおい・ゆう）', amount: 2000, participantIds: ['a', 'd'] },
  ],
});
