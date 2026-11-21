import test from 'node:test';
import assert from 'node:assert/strict';
import { bootChoice, resolveStart, createAutosaver, createEditor, openSavedState } from '../../app.js';
import * as session from '../../app.js';
import { createState } from '../../lib/state.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';

test('共有リンクを優先し、目的指定で編集済みの下書きを置き換えるときは入口に戻る', () => {
  assert.deepEqual(bootChoice({ hash: '#v=abc', search: '?goal=buy&fresh=1' }, MINIMAL), { screen: 'viewer', code: 'abc' });
  assert.deepEqual(bootChoice({ search: '?goal=buy' }, createState('reserve')), { screen: 'editor', goal: 'buy' });
  assert.deepEqual(bootChoice({ search: '?goal=buy' }, MINIMAL), {
    screen: 'goal', notice: '続きの作業があるため、目的の選択から始めます。',
  });
  assert.deepEqual(bootChoice({ search: '?goal=constructor' }, MINIMAL), { screen: 'editor', state: MINIMAL });
  assert.deepEqual(bootChoice({ search: '?fresh=1' }, MINIMAL), { screen: 'goal' });
  assert.deepEqual(bootChoice({}, null), { screen: 'goal' });
});

test('遅いAの解決中にBへ移ったとき、起動時に適用するのは最後のURLだけ', async () => {
  const location = { hash: '#v=A', search: '' };
  const first = Promise.withResolvers();
  const reads = [];
  const displayed = [];
  const start = session.startAtCurrentHash(location, MINIMAL, route => displayed.push(route), async (url, saved) => {
    assert.equal(saved, MINIMAL);
    reads.push(url.hash);
    if (url.hash === '#v=A') await first.promise;
    return { screen: 'viewer', state: url.hash === '#v=A' ? MINIMAL : RESERVE_SAMPLE };
  });
  location.hash = '#v=B';
  first.resolve();
  await start;
  assert.deepEqual(reads, ['#v=A', '#v=B']);
  assert.deepEqual(displayed, [{ screen: 'viewer', state: RESERVE_SAMPLE }]);
});

test('読み取れない共有リンクは理由を添えて入口へ戻る。保存や目的は開かない', async () => {
  const loc = { hash: '#v=', search: '?goal=buy' };
  assert.deepEqual(await resolveStart(loc, MINIMAL, async () => ({ ok: false, reason: '読めません。' })), { screen: 'goal', reason: '読めません。' });
  assert.equal((await resolveStart(loc, MINIMAL, async () => { throw Error(); })).screen, 'goal');
  assert.deepEqual(await resolveStart(loc, MINIMAL, async () => ({ ok: true, state: MINIMAL })), { screen: 'viewer', state: MINIMAL });
});

test('登録直後・変更時に通知し、選択や表示幅だけを変えても診断と履歴を共有する', () => {
  const ctx = createEditor(MINIMAL);
  const seen = [];
  const off = ctx.subscribe(event => seen.push(event));
  const first = ctx.diagnose();
  ctx.select('b2');
  ctx.setDevice('pc');
  ctx.setTab('look');
  assert.deepEqual(seen.map(e => e.reason), ['init', 'select', 'device', 'tab']);
  assert.ok(seen.every(e => e.diagnosis === first && e.state === MINIMAL));
  assert.equal(ctx.canUndo(), false);
  ctx.dispatch({ type: 'setSite', name: '小さな店' });
  assert.notEqual(ctx.diagnose(), first);
  ctx.undo();
  assert.equal(ctx.diagnose(), first);
  assert.equal(ctx.getSelectedId(), 'b2');
  off();
  ctx.redo();
  assert.equal(seen.at(-1).reason, 'undo');
});

test('連続した打鍵を1段にまとめ、目的の変更を戻すと文章とテーマが戻る', () => {
  const saved = [];
  const ctx = createEditor(MINIMAL, { onDirty: state => saved.push(state) });
  ctx.dispatch({ type: 'setSite', name: 'お' }, { coalesce: 'site' });
  ctx.dispatch({ type: 'setSite', name: 'お店' }, { coalesce: 'site' });
  const edited = ctx.getState();
  ctx.dispatch({ type: 'setGoal', goal: 'buy' });
  assert.deepEqual(ctx.getState().theme, MINIMAL.theme);
  ctx.undo();
  assert.equal(ctx.getState(), edited);
  ctx.undo();
  assert.equal(ctx.getState(), MINIMAL);
  assert.equal(ctx.canUndo(), false);
  assert.equal(saved.at(-1), MINIMAL);
});

test('保存を開くとき、下書きがある人は戻せる。最初の人は空の履歴で始まる', () => {
  const ctx = createEditor(MINIMAL);
  openSavedState(ctx, RESERVE_SAMPLE, null);
  assert.equal(ctx.canUndo(), false);
  openSavedState(ctx, MINIMAL, ctx.getState());
  assert.equal(ctx.canUndo(), true);
  ctx.undo();
  assert.deepEqual(ctx.getState(), RESERVE_SAMPLE);
  ctx.restart(MINIMAL);
  assert.equal(ctx.canUndo(), false);
  assert.equal(ctx.canRedo(), false);
});

test('最後の入力から400ms後に1度だけ保存し、画面を離れる時は即時に書き込む', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [];
  const status = [];
  const saver = createAutosaver(state => { writes.push(state); return true; }, value => status.push(value));
  saver.schedule(MINIMAL);
  t.mock.timers.tick(350);
  saver.schedule(RESERVE_SAMPLE);
  t.mock.timers.tick(399);
  assert.equal(writes.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(writes, [RESERVE_SAMPLE]);
  assert.equal(status.at(-1), 'saved');
  saver.schedule(MINIMAL);
  saver.flush();
  t.mock.timers.tick(400);
  assert.deepEqual(writes, [RESERVE_SAMPLE, MINIMAL]);
});

test('保存が一時的に失敗しても、次の保存では最後の入力を残す', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const status = [];
  const writes = [];
  let available = false;
  const saver = createAutosaver(state => {
    if (!available) throw Error('容量不足');
    writes.push(state);
    return true;
  }, value => status.push(value));
  saver.schedule(MINIMAL);
  t.mock.timers.tick(400);
  assert.equal(status.at(-1), 'error');
  available = true;
  saver.flush();
  assert.deepEqual(writes, [MINIMAL]);
  assert.equal(status.at(-1), 'saved');
});

test('選んだ部品を消すと隣へ移り、編集する項目の指定を受け渡せる', () => {
  const calls = [];
  const ctx = createEditor(RESERVE_SAMPLE, { onSelect: (id, path) => calls.push([id, path]) });
  ctx.select('b2', { path: 'items.1.text' });
  assert.deepEqual(calls.at(-1), ['b2', 'items.1.text']);
  ctx.dispatch({ type: 'removeBlock', id: 'b2' });
  assert.equal(ctx.getSelectedId(), 'b3');
  ctx.select('b999');
  assert.equal(ctx.getSelectedId(), 'b3');
  ctx.select(null, { path: 'site.name', tab: 'look' });
  assert.equal(ctx.getTab(), 'look');
  assert.equal(ctx.getSelectedId(), null);
  assert.deepEqual(calls.at(-1), [null, 'site.name']);
});

test('共有ページから編集を始めても、端末にあった下書きへ1回で戻れる', () => {
  const ctx = createEditor(MINIMAL);
  openSavedState(ctx, MINIMAL, RESERVE_SAMPLE);
  assert.deepEqual(ctx.getState(), MINIMAL);
  ctx.undo();
  assert.deepEqual(ctx.getState(), RESERVE_SAMPLE);
  assert.equal(ctx.canUndo(), false);
});

test('無効な操作・同じ表示幅では履歴、選択、保存の通知を増やさない', () => {
  const changes = [];
  const ctx = createEditor(MINIMAL, { onDirty: state => changes.push(state) });
  const events = [];
  ctx.subscribe(event => events.push(event.reason));
  ctx.dispatch({ type: 'moveBlock', id: 'b999', to: 0 });
  ctx.setDevice('phone');
  ctx.setTab('unknown');
  ctx.undo();
  assert.deepEqual(events, ['init']);
  assert.equal(changes.length, 0);
  assert.equal(ctx.canUndo(), false);
});
