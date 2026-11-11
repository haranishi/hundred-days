import { it, expect } from 'vitest';
import { createGame } from '../../src/game.js';
import { createFakeRide, FAKE_SPAWNS } from '../../src/dev/fake-ride.js';
import { createSettings } from '../../src/core/settings.js';
import { createInput } from '../../src/input/index.js';
import { debugEnabled } from '../../src/core/debug-api.js';
async function fixture(options = {}) {
  const target = new EventTarget(), frames = [], sounds = [], loading = [];
  const input = createInput({ target, getGamepads: () => [] });
  const ride = options.ride ?? createFakeRide();
  const game = createGame({ ride, input, settings: createSettings({ storage: null }),
    ui: { show() {}, loading: v => loading.push(v) },
    view: { init: async () => {}, render: f => frames.push(structuredClone(f)) },
    audio: { update: f => sounds.push(structuredClone(f)) },
    debug: { enabled: true, target, spawns: FAKE_SPAWNS }, ...options });
  await game.ready; const api = target.__ginrei; api?.setManual(true); await game.start();
  return { target, game, api, ride, input, frames, sounds, loading };
}
it('手動送りは分割の仕方によらず同じ状態に到達', async () => {
  const a = await fixture(), b = await fixture();
  for (const f of [a, b]) { f.api.teleport('summit'); f.api.setInput({ steer: .3, tuck: 1, jump: true }); }
  for (let i = 0; i < 4; i++) a.api.advance(.25); b.api.advance(1);
  expect(a.api.state()).toEqual(b.api.state()); expect(a.api.input().jump).toBe(true);
  const copy = a.api.state(); copy.pos.x = 999; expect(a.api.state().pos.x).not.toBe(999);
  a.game.dispose(); b.game.dispose(); expect(a.target.__ginrei).toBeUndefined();
});
it('複数刻みの出来事は順番に全部描画と音へ届く・次の描画で空', async () => {
  const f = await fixture(); f.api.setInput({ jump: true }); f.api.advance(1);
  expect(f.frames.at(-1).events.map(e => e.type)).toEqual(['takeoff', 'land']);
  expect(f.sounds.at(-1).events).toEqual(f.frames.at(-1).events);
  expect(f.api.events().map(e => e.type)).toEqual(['takeoff', 'land']);
  f.api.advance(0); expect(f.frames.at(-1).events).toHaveLength(0); f.game.dispose();
});
it('復帰・移動・控えの復元直後に前後をそろえ、jumpedを渡す', async () => {
  const f = await fixture(); f.api.advance(1); const saved = f.ride.snapshot();
  const check = () => { const frame = f.frames.at(-1); expect(frame.prev).toEqual(frame.state); expect(frame.jumped).toBe(true); };
  f.game.respawn('drop'); check(); expect(f.api.state().speed).toBe(0);
  f.api.teleport('field'); check(); expect(f.api.state().pos.x).toBe(120);
  f.api.restore(saved); check(); f.api.advance(.01); expect(f.frames.at(-1).jumped).toBe(false); f.game.dispose();
});
it('一時停止中は進まない・再開後だけ進む', async () => {
  const f = await fixture(); f.game.pause(); const before = f.api.state(); f.api.advance(1);
  expect(f.api.state()).toEqual(before); f.game.resume(); f.api.advance(1); expect(f.api.state().speed).toBeGreaterThan(0); f.game.dispose();
});
it('公開条件なしでは窓口を置かない', async () => {
  expect(debugEnabled()).toBe(false); expect(debugEnabled({ search: '?debug=1' })).toBe(true); expect(debugEnabled({ dev: true })).toBe(true);
  const target = new EventTarget(); const f = await fixture({ debug: { target, dev: false } }); expect(target.__ginrei).toBeUndefined(); f.game.dispose();
});
it('初期化失敗を日本語の失敗表示へ渡し、readyは拒否', async () => {
  let failed = false;
  const game = createGame({ ride: createFakeRide(), input: {}, settings: createSettings({ storage: null }),
    ui: { loading: v => { failed ||= v.failed === true; } }, view: { init() { throw Error('準備失敗'); } }, debug: { target: new EventTarget() } });
  await expect(game.ready).rejects.toThrow('準備失敗'); expect(failed).toBe(true); game.dispose();
});
it('再利用される出来事の物体も刻みごとに写す', async () => {
  const ride = createFakeRide(), original = ride.step, reused = { type: 'edgeSwitch', side: 0 };
  ride.step = (input, dt) => { original(input, dt); reused.side++; ride.events.length = 0; ride.events.push(reused); };
  const f = await fixture({ ride }); f.api.advance(3 / 120);
  expect(f.api.events().map(e => e.side)).toEqual([1, 2, 3]);
  reused.side = 999; expect(f.frames.at(-1).events[0].side).toBe(1); f.game.dispose();
});
it('世界の出発地点一覧はidと日本語名で移動できる', async () => {
  const f = await fixture({ world: { drops: [{ id: 'ridge', name: '尾根', x: 15, z: -40, heading: .5 }] } });
  f.api.teleport('ridge'); expect(f.api.state().pos.x).toBe(15);
  f.api.teleport('尾根'); expect(f.api.state().heading).toBe(.5); f.game.dispose();
});
it('滑る道具：設定を変えると、物理へ渡し、描画が受け取る状態にも入る。アドレスの ?gear=ski は、開いたときの道具を決める', async () => {
  const calls = [], ride = createFakeRide(); ride.setGear = gear => { calls.push(gear); ride.state.gear = gear; };
  const settings = createSettings({ storage: null });
  const f = await fixture({ ride, settings });
  f.api.advance(.1); expect(f.frames.at(-1).state.gear).toBe('board'); // 初めは、スノーボード
  settings.set({ gear: 'ski' }); f.api.advance(.1);
  expect(calls.at(-1)).toBe('ski'); expect(f.frames.at(-1).state.gear).toBe('ski'); expect(f.frames.at(-1).prev.gear).toBe('ski');
  settings.set({ volume: .3 }); expect(calls.filter(g => g === 'ski')).toHaveLength(1); // 道具が同じなら、呼び直さない
  f.game.dispose();
  const forced = createFakeRide(), seen = []; forced.setGear = gear => { seen.push(gear); forced.state.gear = gear; };
  const linked = createSettings({ storage: null });
  const g = await fixture({ ride: forced, settings: linked, debug: { enabled: true, target: new EventTarget(), spawns: FAKE_SPAWNS, search: '?gear=ski' } });
  expect(seen).toEqual(['ski']); expect(forced.state.gear).toBe('ski'); expect(linked.get().gear).toBe('ski'); // 設定も、スキーになる（ボタンの表示と合う）
  linked.set({ gear: 'board' }); expect(seen.at(-1)).toBe('board'); expect(forced.state.gear).toBe('board'); // そのあとは、画面から替えられる
  g.game.dispose();
});
