// OWNER: tests
// 二次運動の計測（r06-motion、tests/dragon/motionMeasure.ts）を3体で流す。R06_MOTION_OUT=ファイル で数字を JSON に書く。
// 前の版でも同じ手順で測れるよう、計測の中身は motionMeasure.ts に置き、ここは今の src を渡して、規則が効いているかを確かめる。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as three from 'three';
import { describe, expect, it } from 'vitest';
import { CREATURE_CONFIG } from '../../src/config/creatures';
import { Dragon } from '../../src/dragon/dragon';
import { createIntent } from '../../src/dragon/intent';
import { DragonBody, emptyBodyEvents } from '../../src/gameplay/locomotion';
import { MaterialKit } from '../../src/render/materials';
import { measureCost, measureCreature, measureWalk, summarize, type MotionMods } from './motionMeasure';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mods: MotionMods = {
  three,
  Dragon,
  MaterialKit,
  DragonBody,
  emptyBodyEvents,
  createIntent,
  CREATURE_CONFIG,
  publicDir: path.join(ROOT, 'public'),
};

describe('二次運動の計測（首の先・尾の先・翼の先の遅れと振れ幅）', () => {
  it('3体×4つの出来事を測る', async () => {
    const all: Record<string, unknown> = {};
    for (const id of ['kurenai', 'raiyoku', 'homuratsuno']) {
      const stats = await measureCreature(mods, id);
      all[id] = { summary: summarize(stats), detail: stats, walk: await measureWalk(mods, id), cost: await measureCost(mods, id) };
      expect(Object.keys(stats)).toEqual(['turn', 'stop', 'land', 'takeoff']);
    }
    // r06-motion の規則が効いていること（R06_MOTION_ASSERT=0 で外す。前の版の写しで同じ計測を流すとき用）
    if (process.env.R06_MOTION_ASSERT !== '0') {
      for (const id of ['kurenai', 'raiyoku', 'homuratsuno']) {
        const { summary, walk } = all[id] as { summary: ReturnType<typeof summarize>; walk: Awaited<ReturnType<typeof measureWalk>> };
        // 振り向きでは尾の先が体より遅れて付いてくる（前の版は体より先へ回り、遅れが負だった）
        expect(summary.turn.tail.lagMs, `${id} 振り向きの尾の遅れ`).toBeGreaterThan(0);
        expect(summary.turn.tail.ampDeg, `${id} 振り向きの尾の振れ`).toBeGreaterThan(15);
        // 着地・止まるでも首と尾が振れ、振れすぎない
        expect(summary.land.neck.ampDeg, `${id} 着地の首`).toBeGreaterThan(5);
        expect(summary.land.tail.ampDeg, `${id} 着地の尾`).toBeGreaterThan(10);
        expect(summary.land.tail.ampDeg, `${id} 着地の尾の上限`).toBeLessThan(60);
        expect(summary.stop.tail.ampDeg, `${id} 止まるときの尾`).toBeGreaterThan(5);
        if (id === 'homuratsuno') expect(walk.tips.tail.rmsDeg, '焔角の尾は一歩ごとに揺れる').toBeGreaterThan(4);
        if (id === 'raiyoku') expect(walk.fingerSpread!.onRangeDeg, '雷翼の指どうしの角度が歩く間に変わる').toBeGreaterThan(3 * walk.fingerSpread!.refRangeDeg);
      }
    }
    const out = process.env.R06_MOTION_OUT;
    if (out) {
      mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      writeFileSync(path.resolve(out), JSON.stringify(all, null, 2));
    }
    console.log(JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, (v as { summary: unknown }).summary]))));
  }, 600_000);
});
