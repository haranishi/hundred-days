// 物理は 1/120 秒刻みで進み、描画はその間の時刻を描く。前と今の状態を、描く時刻の割合で混ぜる。
// 混ぜるのは、位置・速度・向き・角度などの連続する量だけ。状態の種類（滑走・空中・転倒）や雪質は「今」の値を使う。
const VECS = ['pos', 'com', 'vel'];
const AXES = ['fwd', 'up', 'right'];
const NUMS = ['speed', 'yawRate', 'edge', 'slip', 'load', 'gLoad', 'leg', 'crouch', 'sink'];
const GROUPS = ['snow', 'air', 'tele'];

function wrap(a) {
  let x = (a + Math.PI) % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x - Math.PI;
}

/**
 * @param {object} a 前の状態
 * @param {object} b 今の状態
 * @param {number} t 0（前）〜1（今）
 * @param {object} out 同じ形の入れ物（毎コマ使い回す）
 */
export function mixState(a, b, t, out) {
  for (let i = 0; i < VECS.length; i++) {
    const k = VECS[i];
    const p = a[k], q = b[k], o = out[k];
    o.x = p.x + (q.x - p.x) * t; o.y = p.y + (q.y - p.y) * t; o.z = p.z + (q.z - p.z) * t;
  }
  for (let i = 0; i < AXES.length; i++) {
    const k = AXES[i];
    const p = a[k], q = b[k], o = out[k];
    const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t, z = p.z + (q.z - p.z) * t;
    const n = Math.hypot(x, y, z);
    if (n > 1e-9) { o.x = x / n; o.y = y / n; o.z = z / n; } else { o.x = q.x; o.y = q.y; o.z = q.z; }
  }
  for (let i = 0; i < NUMS.length; i++) {
    const k = NUMS[i];
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  out.heading = a.heading + wrap(b.heading - a.heading) * t;
  out.gear = b.gear === 'ski' ? 'ski' : 'board';
  out.mode = b.mode; out.switch = b.switch; out.stance = b.stance;
  for (let i = 0; i < GROUPS.length; i++) {
    const src = b[GROUPS[i]], dst = out[GROUPS[i]];
    for (const key in src) dst[key] = src[key];
  }
  return out;
}
