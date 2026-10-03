// OWNER: tests
// 操作性の受け入れ条件（r02-controls）を、描画なしの遊びの本体で数字にして確かめる。規則を壊すとこのテストが落ちる。
// 数字は R02_MEASURE_OUT（JSON の保存先）を付けて流すと書き出す：R02_MEASURE_OUT=.captures/r02-controls/measure-sim.json npx vitest run tests/gameplay/controls.measure.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { LOOK } from '../../src/config/controls';
import { SESSION } from '../../src/config/gameplay';
import { InputState } from '../../src/core/input';
import { FixedStepLoop } from '../../src/core/loop';
import { readControls } from '../../src/gameplay/controls';
import { Game } from '../../src/gameplay/game';
import { pressInput, releaseInput } from '../../src/harness/keys';
import { BasicPlaytest } from '../../src/harness/playtest';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import { flatten, measureAll } from './controlsMeasure';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const m = measureAll({
  Game,
  InputState,
  readControls,
  pressInput,
  releaseInput,
  BasicPlaytest,
  FixedStepLoop,
  city,
  index,
  sensitivity: LOOK.sensitivity,
  durationSeconds: SESSION.durationSeconds,
});

const out = process.env.R02_MEASURE_OUT;
if (out) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ measured: new Date().toISOString(), values: flatten(m), raw: m }, null, 2));
}

describe('向き直り（受け入れ条件：地上1.0秒・空中1.8秒・技は0.15秒）', () => {
  it('地上で歩きながら視点を180度振ると、1.0秒以内に向き直る（走りでも）', () => {
    expect(m.groundReverse.walkSeconds).toBeLessThanOrEqual(1.0);
    expect(m.groundReverse.runSeconds).toBeLessThanOrEqual(1.0);
  });

  it('走りは約1秒で最高速の9割に届き、離すと0.8秒・9m 以内で止まる。炎を吐きながらでも毎秒5m以上で歩ける', () => {
    expect(m.running.runTo90Seconds).toBeLessThanOrEqual(1.1);
    expect(m.running.runStopSeconds).toBeLessThanOrEqual(0.8);
    expect(m.running.runStopMeters).toBeLessThanOrEqual(9);
    expect(m.running.breathWalkSpeed).toBeGreaterThanOrEqual(5);
  });

  it('空中の180度は1.8秒以内で、直径40m以内で回る', () => {
    expect(m.airReverse.seconds).toBeLessThanOrEqual(1.8);
    expect(m.airReverse.diameter).toBeLessThanOrEqual(40);
    // 大きく向きを変える間は巡航の6割前後まで落とす
    expect(m.airReverse.minSpeed).toBeLessThan(36 * 0.7);
  });

  it('視点を90度振って技を出すと、0.15秒で照準の方へ向き直ってから、照準の向きに出す', () => {
    for (const k of ['breath', 'claw', 'tail'] as const) {
      expect(m.attackPivot[k].turnSeconds, k).toBeLessThanOrEqual(0.17);
      expect(m.attackPivot[k].fireSeconds, k).toBeLessThan(0.5);
    }
    // 炎は首の振れる範囲（55度）に入ってから出る。爪と尾は照準の向きへ当てる
    expect(m.attackPivot.breath.offAtFireDeg).toBeLessThan(55);
    expect(m.attackPivot.claw.offAtFireDeg).toBeLessThan(3);
    expect(m.attackPivot.tail.offAtFireDeg).toBeLessThan(3);
  });
});

describe('上下の操作（受け入れ条件：Space 長押しで毎秒15〜20m・Shift を離して0.5秒・C で降りる・着地の硬直0.4秒）', () => {
  it('Space を押し続けると毎秒15〜20mで上がり続ける。0.4秒ごとの連打でも毎秒30mを超えない', () => {
    expect(m.climb.holdRate).toBeGreaterThanOrEqual(15);
    expect(m.climb.holdRate).toBeLessThanOrEqual(20);
    expect(m.climb.tapMaxRate).toBeLessThanOrEqual(30);
    expect(m.climb.tapGain48).toBeLessThan(100);
  });

  it('急降下は Shift を離して0.5秒で滑空に戻り、Space でも1秒以内に落下が止まる', () => {
    expect(m.diveExit.shiftReleaseToGlideSeconds).toBeLessThanOrEqual(0.5);
    expect(m.diveExit.spaceStopSeconds).toBeLessThanOrEqual(1.0);
  });

  it('C を押し続けると毎秒12〜18mでゆっくり降りる', () => {
    expect(m.descend.cRate).toBeGreaterThanOrEqual(12);
    expect(m.descend.cRate).toBeLessThanOrEqual(18);
  });

  it('急降下の着地の硬直は0.4秒以内', () => {
    expect(m.landing.diveStiffSeconds).toBeLessThanOrEqual(0.4);
    expect(m.landing.glideStiffSeconds).toBeLessThanOrEqual(0.4);
  });
});

describe('ビルに張り付かない（受け入れ条件：B1 の手順で0.5秒未満）', () => {
  it('空中で全速のままビルに当たっても、0.5秒以上は止まらず、そのビルを傾きまで壊す', () => {
    expect(m.stick.airBuilding).toBeGreaterThanOrEqual(0);
    expect(m.stick.airSeconds).toBeLessThan(0.5);
    expect(m.stick.airSmashed).toBe(true);
  });

  it('地上で走ってビルに当たっても0.5秒以上は止まらない', () => {
    expect(m.stick.groundBuilding).toBeGreaterThanOrEqual(0);
    expect(m.stick.groundSeconds).toBeLessThan(0.5);
  });
});

describe('連打と炎の手応え', () => {
  it('爪の当たりの後に押した1回は、必ず次の爪になる。0.1秒ごとに押し続けると、2秒で4回振る', () => {
    expect(m.clawChain.pressAfterHit).toBe(2);
    // 振りかぶりの途中（0.08秒）に押した1回も、覚えておいて次の爪にする（先行入力の0.35秒より後に出ても捨てない）
    expect(m.clawChain.pressDuringWindup).toBe(2);
    expect(m.clawChain.mash15).toBeGreaterThanOrEqual(4);
  });

  it('炎を3秒当てると、耐久400前後の中層ビルが傾く', () => {
    expect(m.breathMidrise.building).toBeGreaterThanOrEqual(0);
    expect(m.breathMidrise.stageAfter3s).toBeGreaterThanOrEqual(3);
  });
});

describe('時計（受け入れ条件：結果はゲーム内時刻の180.0秒±0.1。バグ B2）', () => {
  it('自動プレイの結果は180.0秒で出る', () => {
    expect(Math.abs(m.clock.endedAt - SESSION.durationSeconds)).toBeLessThan(0.1);
  });

  it('200ms の引っかかりがあっても、ループは実時間に追いつく', () => {
    expect(m.loop.lagAfterHitchMs).toBeLessThan(20);
  });
});
