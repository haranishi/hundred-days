import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { calculate, settleBalances, validateState, parseAmount, emptyState, exampleState, encodeState, decodeState, settlementText, LIMITS } from '../lib/model.js';

function checkConservation(state) {
  const result = calculate(state);
  assert.equal(result.balances.reduce((sum, entry) => sum + entry.balance, 0), 0);
  assert.equal(result.balances.reduce((sum, entry) => sum + entry.paid, 0), result.total);
  assert.equal(result.balances.reduce((sum, entry) => sum + entry.owed, 0), result.total);
  const balances = new Map(result.balances.map((entry) => [entry.id, entry.balance]));
  for (const { from, to, amount } of result.transfers) {
    assert.ok(amount > 0 && Number.isSafeInteger(amount)); assert.notEqual(from, to);
    balances.set(from, balances.get(from) + amount); balances.set(to, balances.get(to) - amount);
  }
  assert.ok([...balances.values()].every((balance) => balance === 0));
  return result;
}

// Independent oracle: pair the first unsettled person against every opposite sign.
function oracle(values) {
  const debts = values.filter(Boolean);
  function search(start) {
    while (start < debts.length && debts[start] === 0) start++;
    if (start === debts.length) return 0;
    let best = Infinity;
    for (let i = start + 1; i < debts.length; i++) {
      if (debts[i] * debts[start] >= 0) continue;
      debts[i] += debts[start]; best = Math.min(best, 1 + search(start + 1)); debts[i] -= debts[start];
    }
    return best;
  }
  return search(0);
}

test('empty state and equal paid shares need no transfers', () => {
  assert.equal(checkConservation(emptyState()).total, 0);
  const state = exampleState(); state.expenses = state.members.map((member, i) => ({ id: `p${i}`, payerId: member.id, label: '食事', amount: 100, participantIds: state.members.map((entry) => entry.id) }));
  assert.deepEqual(checkConservation(state).transfers, []);
});
test('four-person sample preserves total, balances and settles in minimum transfers', () => {
  const result = checkConservation(exampleState());
  assert.equal(result.total, 46000);
  assert.deepEqual(result.balances.map((entry) => entry.balance), [12000, 1000, -3000, -10000]);
  assert.equal(result.transfers.length, 3);
});
test('rounding is by membership order, not expense checkbox order', () => {
  const state = exampleState(); state.expenses = [{ id: 'p', payerId: 'd', label: '端数', amount: 5, participantIds: ['c', 'a', 'b'] }];
  const result = checkConservation(state);
  assert.deepEqual(result.balances.map((entry) => entry.owed), [2, 2, 1, 0]);
  assert.equal(result.rounded, true);
});
test('a payer may be excluded, with single-person beneficiaries and one yen', () => {
  const state = exampleState(); state.expenses = [{ id: 'p', payerId: 'a', label: '代払い', amount: 1, participantIds: ['b'] }];
  assert.deepEqual(checkConservation(state).transfers, [{ from: 'b', to: 'a', amount: 1 }]);
});
test('DP avoids largest-first greedy counterexample (5 transfers versus 4)', () => {
  const values = [8, 7, 6, -9, -8, -4];
  const transfers = settleBalances(values.map((balance, i) => ({ id: `p${i}`, balance })));
  assert.equal(transfers.length, 4); assert.equal(transfers.length, oracle(values));
});
test('DP matches independent exhaustive solver for deterministic random balances', () => {
  let seed = 8501;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let trial = 0; trial < 150; trial++) {
    const values = Array.from({ length: 2 + rand() % 6 }, () => (rand() % 19) - 9);
    values.push(-values.reduce((sum, value) => sum + value, 0));
    const transfers = settleBalances(values.map((balance, i) => ({ id: `p${i}`, balance })));
    assert.equal(transfers.length, oracle(values), JSON.stringify(values));
    const remaining = [...values];
    for (const transfer of transfers) { remaining[Number(transfer.from.slice(1))] += transfer.amount; remaining[Number(transfer.to.slice(1))] -= transfer.amount; }
    assert.ok(remaining.every((value) => value === 0));
  }
});
test('random payments with arbitrary subsets conserve integer yen', () => {
  for (let trial = 1; trial <= 80; trial++) {
    const state = exampleState();
    state.expenses = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, payerId: state.members[(trial + i) % 4].id, label: '支払い', amount: (trial * 191 + i * 37) % 10000 + 1, participantIds: state.members.filter((_, j) => ((trial + i + j) % 3) !== 0).map((member) => member.id) }));
    const result = checkConservation(state);
    assert.equal(result.transfers.length, oracle(result.balances.map((entry) => entry.balance)));
  }
});
test('12 people and 100 maximum payments remain exact and responsive', () => {
  const members = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `名前${i}` }));
  const state = { version: 1, members, expenses: Array.from({ length: 100 }, (_, i) => ({ id: `e${i}`, label: '上限', payerId: members[i % 12].id, amount: LIMITS.amount, participantIds: members.map((member) => member.id) })) };
  const started = performance.now(); const result = checkConservation(state);
  assert.equal(result.total, 100_000_000_000); assert.ok(performance.now() - started < 1000);
});
test('amount input accepts normalized digits and correct comma grouping', () => {
  for (const [raw, expected] of [['１，２００', 1200], ['1,000,000,000', LIMITS.amount], [' 42 ', 42], ['001', 1]]) assert.equal(parseAmount(raw), expected);
  for (const value of ['', '0', '-1', '1.5', '1e3', 'NaN', 'Infinity', '1,2', '1,00', '1 000', '1_000', '1,000,000,001', '9999999999999999999999']) assert.throws(() => parseAmount(value), Error, value);
});
test('rejects malformed, duplicate, dangling and oversized imported data', () => {
  const cases = [
    (s) => { s.version = 2; }, (s) => { s.members[0].name = '  '; }, (s) => { s.members[1].name = 'あおい'; },
    (s) => { s.members[1].id = s.members[0].id; }, (s) => { s.members[0].name = 'a\nb'; },
    (s) => { s.expenses[0].payerId = 'unknown'; }, (s) => { s.expenses[0].participantIds = []; },
    (s) => { s.expenses[0].participantIds = ['a', 'a']; }, (s) => { s.expenses[0].participantIds = ['unknown']; },
    (s) => { s.expenses[0].amount = 0.1; }, (s) => { s.expenses[0].amount = LIMITS.amount + 1; },
    (s) => { s.expenses[0].label = ''; }, (s) => { s.expenses[1].id = s.expenses[0].id; },
    (s) => { s.members = Array(13).fill(s.members[0]); }, (s) => { s.expenses = Array(101).fill(s.expenses[0]); },
  ];
  for (const mutate of cases) { const state = exampleState(); mutate(state); assert.throws(() => validateState(state)); }
  assert.throws(() => validateState(null)); assert.throws(() => settleBalances([{ id: 'p', balance: 1 }]));
});
test('Unicode names, content and script-like text round-trip as plain data', () => {
  const state = exampleState(); state.members[0].name = '<img src=x>'; state.expenses[0].label = '旅先🧳 & お茶 <script>';
  assert.deepEqual(decodeState(encodeState(state)), state);
  assert.deepEqual(validateState({ ...state, unwanted: '<script>' }), state);
  assert.ok(settlementText(state).includes('立て替え合計 46,000円／4人'));
});
test('invalid links and oversized snapshots are rejected; text remains available', () => {
  for (const hash of ['#v2=abc', '#v1=', '#v1=hello', '#v1=../', '#v1=' + 'x'.repeat(32000)]) assert.throws(() => decodeState(hash));
  const state = exampleState(); state.expenses = Array.from({ length: 100 }, (_, i) => ({ ...state.expenses[0], id: `e${i}`.padEnd(64, 'x'), label: '旅'.repeat(40) }));
  assert.throws(() => encodeState(state), /長すぎ/); assert.ok(settlementText(state).includes('精算メモ'));
});
test('result text reports both settlement-free and rounding cases accurately', () => {
  const state = exampleState(); state.expenses = [{ id: 'e', payerId: 'a', label: '自分の分', amount: 1, participantIds: ['a'] }];
  assert.match(settlementText(state), /送金は不要/);
  state.expenses[0].participantIds = ['a', 'b']; assert.match(settlementText(state), /登録順/);
});
