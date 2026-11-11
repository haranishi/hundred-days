// 高さを読む TSL 関数。CPU の src/world/surface-math.js の heightAt と同じ式・同じ配列を読む。
// 式を変えるときは、必ず両方を同時に変える（片方だけ変えると、滑走者が雪面から浮く・沈む）。
import { Fn, float, vec2, floor, clamp, mod, ivec2, textureLoad } from 'three/tsl';

function weights(t) {
  const t2 = t.mul(t);
  const t3 = t2.mul(t);
  const omt = float(1).sub(t);
  return [
    omt.mul(omt).mul(omt).div(6),
    t3.mul(3).sub(t2.mul(6)).add(4).div(6),
    t3.mul(-3).add(t2.mul(3)).add(t.mul(3)).add(1).div(6),
    t3.div(6),
  ];
}

// 16点の一様3次Bスプライン。load(ix, iz) は整数の位置の値を返す関数
function spline16(load, g) {
  const i = floor(g);
  const f = g.sub(i);
  const wx = weights(f.x);
  const wz = weights(f.y);
  let sum = null;
  for (let b = 0; b < 4; b++) {
    const iz = i.y.add(b - 1);
    let row = null;
    for (let a = 0; a < 4; a++) {
      const v = load(i.x.add(a - 1), iz).mul(wx[a]);
      row = row ? row.add(v) : v;
    }
    const r = row.mul(wz[b]);
    sum = sum ? sum.add(r) : r;
  }
  return sum;
}

/**
 * @param {{height:object, tile:object, masksB:object}} tex createTerrainTextures の結果
 * @param {{size:number, grid:number, cell:number, maskGrid:number, tileGrid:number, tilePeriod:number}} c world.meta
 * @returns 関数ノード heightAt(vec2 xz) → float（m）
 */
export function createHeightNode(tex, c) {
  const half = c.size / 2;
  const loadClamped = (t, n, channel) => (ix, iz) =>
    textureLoad(t, ivec2(vec2(clamp(ix, 0, n - 1), clamp(iz, 0, n - 1))))[channel];
  const loadWrapped = (t, n) => (ix, iz) =>
    textureLoad(t, ivec2(vec2(mod(ix.add(n * 8), n), mod(iz.add(n * 8), n)))).r;
  const macro = loadClamped(tex.height, c.grid, 'r');
  const amp = loadClamped(tex.masksB, c.maskGrid, 'g');
  const tile = loadWrapped(tex.tile, c.tileGrid);

  return Fn(([xz]) => {
    const p = clamp(xz, -half, half).add(half).toVar();
    const base = spline16(macro, p.div(c.cell).sub(0.5));
    // masksB の G は 0〜255 が 0〜0.75 m。GPU は 0〜1 に正規化して読むので 0.75 を掛ける
    const a = spline16(amp, p.div(c.cell * 2).sub(0.5)).mul(0.75);
    const t = spline16(tile, p.mul(c.tileGrid / c.tilePeriod).sub(0.5));
    return base.add(a.mul(t));
  });
}
