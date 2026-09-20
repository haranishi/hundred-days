import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_MS, bodyHorizontal, direction16, illumination, lunarCycle,
  phaseEventsAround, riseSet
} from '../lib/astro.js';

const jst = (value) => {
  const [date, time = '00:00'] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour - 9, minute);
};
const minuteDifference = (actual, expected) => Math.abs(actual - jst(expected)) / 60_000;

const phaseReferences = [
  ['last', '2026-08-06T11:21'], ['new', '2026-08-13T02:37'],
  ['first', '2026-08-20T11:46'], ['full', '2026-08-28T13:19'],
  ['last', '2026-09-04T16:51'], ['new', '2026-09-11T12:27'],
  ['first', '2026-09-19T05:44'], ['full', '2026-09-27T01:49'],
  ['last', '2026-10-03T22:25'], ['new', '2026-10-11T00:50'],
  ['first', '2026-10-19T01:13'], ['full', '2026-10-26T13:12']
];

for (const [phase, expected] of phaseReferences) {
  test(`朔弦望 ${expected} ${phase} は国立天文台値の3分以内`, () => {
    const center = jst(expected);
    const event = phaseEventsAround(center)
      .filter((one) => one.phase === phase)
      .sort((a, b) => Math.abs(a.time - center) - Math.abs(b.time - center))[0];
    assert.ok(minuteDifference(event.time, expected) <= 3, `${minuteDifference(event.time, expected)}分差`);
  });
}

test('2026-09-02 12:00 JST の月齢は20.4±0.05', () => {
  assert.ok(Math.abs(lunarCycle(jst('2026-09-02T12:00')).age - 20.4) <= 0.05);
});

test('望の瞬間の輝面比は0.99以上', () => {
  const full = phaseEventsAround(jst('2026-09-27T00:00')).find(({ phase, time }) => phase === 'full' && time > jst('2026-09-26T00:00'));
  assert.ok(illumination(full.time).fraction >= 0.99);
});

test('朔の瞬間の輝面比は0.01以下', () => {
  const event = phaseEventsAround(jst('2026-09-11T00:00')).find(({ phase, time }) => phase === 'new' && time > jst('2026-09-10T00:00'));
  assert.ok(illumination(event.time).fraction <= 0.01);
});

for (const phase of ['first', 'last']) {
  test(`${phase} の瞬間の輝面比は0.50±0.03`, () => {
    const event = phaseEventsAround(jst('2026-09-15T00:00'))
      .filter((one) => one.phase === phase)
      .sort((a, b) => Math.abs(a.time - jst('2026-09-15T00:00')) - Math.abs(b.time - jst('2026-09-15T00:00')))[0];
    assert.ok(Math.abs(illumination(event.time).fraction - 0.5) <= 0.03);
  });
}

const tokyo = { lat: 35.6581, lon: 139.7414 };
const tokyoDay = jst('2026-09-02T00:00');
const expectedEvents = [
  ['moon', 'rise', '2026-09-02T20:38'], ['moon', 'set', '2026-09-02T10:16'],
  ['sun', 'rise', '2026-09-02T05:13'], ['sun', 'set', '2026-09-02T18:08']
];

for (const [body, kind, expected] of expectedEvents) {
  // 暦の値は分単位（±0.5分の丸め）なので、計算が合っていれば差は1分未満に収まる
  test(`東京 ${body} ${kind} は ${expected} の1分以内`, () => {
    const event = riseSet(body, tokyoDay, tokyo.lat, tokyo.lon)[kind];
    assert.ok(event, 'イベントがある');
    assert.ok(minuteDifference(event.time, expected) <= 1, `${minuteDifference(event.time, expected)}分差`);
  });
}

test('高緯度で月の出入りがない日をnullで返す', () => {
  const events = riseSet('moon', jst('2026-01-01T00:00'), 75, 20);
  assert.equal(events.rise, null);
  assert.equal(events.set, null);
});

test('現在位置の月高度と方位を返す', () => {
  const current = bodyHorizontal('moon', jst('2026-09-02T21:00'), tokyo.lat, tokyo.lon);
  assert.ok(current.altitude > 0);
  assert.ok(current.azimuth >= 0 && current.azimuth < 360);
});

const directionCases = [
  [0, '北'], [11.24, '北'], [11.25, '北北東'], [45, '北東'], [90, '東'],
  [135, '南東'], [180, '南'], [225, '南西'], [270, '西'], [315, '北西'], [359, '北']
];
for (const [angle, label] of directionCases) {
  test(`方位角${angle}°は${label}`, () => assert.equal(direction16(angle), label));
}

test('朔から次の朔までは約29.5日', () => {
  const cycle = lunarCycle(jst('2026-09-02T12:00'));
  assert.ok(Math.abs((cycle.nextNew - cycle.previousNew) / DAY_MS - 29.53) < 0.2);
});
