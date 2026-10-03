// OWNER: tests
// r03-fx：煙の柱。火元から昇り、1つの風向き（WIND）へ流れ、上ほど強い風で傾き、上ほど太く、浮力を失う高さで昇るのをやめる。
// 粒子の動き（ParticlePool）は描画を持たない純粋な計算なので、層の代わりに入れ物だけを渡して確かめる。
import { describe, expect, it } from 'vitest';
import { WIND } from '../../src/config/fx';
import { stream } from '../../src/core/rng';
import { Emitters } from '../../src/fx/emitters';
import { ParticlePool, particleWindAt, type ParticleLayer } from '../../src/fx/particles';

function plumeRun(seconds: number, count: number): ParticlePool {
  const soft = { pool: new ParticlePool(4000) } as unknown as ParticleLayer;
  const other = { pool: new ParticlePool(10) } as unknown as ParticleLayer;
  const emit = new Emitters(other, soft, other, stream(11, 'fx-test'));
  const dt = 1 / 30;
  let spawned = 0;
  for (let t = 0; t < seconds; t += dt) {
    while (spawned < count && spawned < (t / seconds) * count) {
      emit.plume(0, 30, 0, 10, 1, 0.5);
      spawned++;
    }
    soft.pool.update(dt, WIND.x, WIND.z);
  }
  return soft.pool;
}

describe('煙の柱', () => {
  it('風は地面の近くで弱く、上ほど強い', () => {
    expect(particleWindAt(0)).toBeLessThan(particleWindAt(80));
    expect(particleWindAt(80)).toBeLessThan(particleWindAt(170));
    expect(particleWindAt(400)).toBe(particleWindAt(170));
  });

  it('火元から昇って、風下（WIND の向き）へ流れる。流れの向きは風の向きから10度以内', () => {
    const pool = plumeRun(12, 120);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.sample(i);
      sx += p.x;
      sy += p.y;
      sz += p.z;
    }
    const n = pool.count;
    expect(n).toBeGreaterThan(50);
    const dx = sx / n;
    const dz = sz / n;
    expect(sy / n - 30).toBeGreaterThan(25);
    const cos = (dx * WIND.x + dz * WIND.z) / (Math.hypot(dx, dz) * Math.hypot(WIND.x, WIND.z));
    expect(cos).toBeGreaterThan(Math.cos((10 * Math.PI) / 180));
  });

  it('上ほど太く（粒が大きく）、上ほど強い風で風下へ傾く', () => {
    const pool = plumeRun(14, 160);
    const list = Array.from({ length: pool.count }, (_, i) => pool.sample(i)).sort((a, b) => a.y - b.y);
    const lowHalf = list.slice(0, Math.floor(list.length / 2));
    const highHalf = list.slice(Math.floor(list.length / 2));
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(highHalf.map((p) => p.size))).toBeGreaterThan(mean(lowHalf.map((p) => p.size)) * 1.3);
    const along = (p: { x: number; z: number }): number => (p.x * WIND.x + p.z * WIND.z) / Math.hypot(WIND.x, WIND.z);
    expect(mean(highHalf.map(along))).toBeGreaterThan(mean(lowHalf.map(along)));
  });

  it('浮力を失う高さ（ceil）を越えた粒は、それ以上ほとんど昇らない', () => {
    const pool = new ParticlePool(4);
    pool.spawn({ x: 0, y: 100, z: 0, vx: 0, vy: 8, vz: 0, life: 30, size0: 5, size1: 20, r: 0, g: 0, b: 0, alpha: 1, drag: 0.1, buoyancy: 0.9, shape: 0, ceil: 101 }, 0.5);
    for (let t = 0; t < 3; t += 1 / 30) pool.update(1 / 30, 0, 0);
    const a = pool.sample(0).y;
    for (let t = 0; t < 3; t += 1 / 30) pool.update(1 / 30, 0, 0);
    expect(pool.sample(0).y - a).toBeLessThan(0.5);
    expect(pool.sample(0).vy).toBeLessThan(0.1);
  });
});
