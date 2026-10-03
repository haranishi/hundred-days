// OWNER: tests
// 出来事の口：購読・回数・直近の記録・やり直しでの消去。音（r00d）と記録がこの口に頼る。
import { describe, expect, it } from 'vitest';
import { EventBus, GAME_EVENT_TYPES } from '../../src/core/events';

describe('出来事の口', () => {
  it('種類ごとに購読でき、中身と時刻 t がそのまま届く', () => {
    const bus = new EventBus();
    const got: number[] = [];
    const off = bus.on('dragon.claw', (e) => got.push(e.t));
    bus.emit('dragon.claw', { t: 1.5, pos: [0, 0, 0], hit: true, count: 2 });
    bus.emit('dragon.tail', { t: 2, pos: [0, 0, 0], hit: false, count: 0 });
    off();
    bus.emit('dragon.claw', { t: 3, pos: [0, 0, 0], hit: false, count: 0 });
    expect(got).toEqual([1.5]);
    expect(bus.count('dragon.claw')).toBe(2);
    expect(bus.counts()).toEqual({ 'dragon.claw': 2, 'dragon.tail': 1 });
  });

  it('onAny は種類の名前付きで全部を受け取り、直近の記録は上限で古いものから捨てる', () => {
    const bus = new EventBus(3);
    const types: string[] = [];
    bus.onAny((e) => types.push(e.type));
    for (let i = 0; i < 5; i++) bus.emit('ui.click', { t: i, target: 'start' });
    expect(types).toHaveLength(5);
    expect(bus.recent.map((e) => e.t)).toEqual([2, 3, 4]);
    bus.resetLog();
    expect(bus.recent).toEqual([]);
    expect(bus.count('ui.click')).toBe(0);
  });

  it('ブリーフの表の出来事がすべて一覧にある（音の担当が購読する名前）', () => {
    for (const name of ['dragon.step', 'dragon.wingFlap', 'dragon.land', 'dragon.roar', 'dragon.breath.start', 'dragon.breath.stop', 'dragon.claw', 'dragon.tail', 'building.crack', 'building.peel', 'building.tilt', 'building.collapse', 'glass.shatter', 'fire.ignite', 'fire.spread', 'combo.change', 'rage.full', 'rage.release', 'session.start', 'session.end', 'ui.click']) {
      expect(GAME_EVENT_TYPES).toContain(name);
    }
  });
});
