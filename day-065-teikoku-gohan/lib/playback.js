/* 再生の時計（分）の進め方。DOMに触らない（単体テストで時間を固定する）。
   ふだんは1分＝0.5秒（2倍で0.25秒）。火の駅で仕上がってから出るまで（焦げたらその瞬間まで）の「ジリジリ」の間だけ、
   1分を1.2秒かけて進める。通常の速さだと「ジリジリ」が0.5秒（2倍で0.25秒）しか出ず、気づけなかったため。
   時計を止めずにゆっくり進めるので、「焦げた！」は時計・運行図の✖と同じ分に出る（止めて文字だけ残すと、焦げた瞬間とずれる）。 */
import { KINDS } from './sim.js';

export const SEC_PER_MIN = 0.5;
export const SIZZLE_SEC_PER_MIN = 1.2;

// 「ジリジリ」の時間帯 [仕上がり, min(駅を出た分, 焦げた瞬間)) の一覧
export function sizzleWindows(level, sim) {
  const grace = level.burnGrace ?? 1;
  const out = [];
  for (const segs of Object.values(sim.timeline)) {
    for (const seg of segs) {
      if (seg.type !== 'station' || !KINDS[seg.kind]?.hot) continue;
      const end = Math.min(seg.leave, seg.ready + grace + 1);
      if (end > seg.ready) out.push([seg.ready, end]);
    }
  }
  return out;
}

// 実時間 dt 秒ぶん、再生の時刻 t（分）を進める。窓の境目をまたぐときは、境目で速さを切り替える
export function advance(t, dt, speed, windows) {
  let now = t;
  let rest = dt;
  for (let guard = 0; rest > 1e-9 && guard < 1000; guard++) {
    const hot = windows.some(([a, b]) => a <= now && now < b);
    const rate = hot ? Math.min(speed / SEC_PER_MIN, 1 / SIZZLE_SEC_PER_MIN) : speed / SEC_PER_MIN; // 分／秒
    let next = Infinity;
    for (const [a, b] of windows) {
      if (a > now) next = Math.min(next, a);
      if (b > now) next = Math.min(next, b);
    }
    const need = (next - now) / rate;
    if (need >= rest) {
      now += rest * rate;
      rest = 0;
    } else {
      now = next;
      rest -= need;
    }
  }
  return now;
}
