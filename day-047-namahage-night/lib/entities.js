import { markers, tileAt } from './levels.js';
export const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// 面の記号から敵・床・収集物を作る。
export function createEntities(level, id) {
  return markers(level, 'CDM^o*G').map((e, i) => ({
    ...e,
    id: i,
    originX: e.x,
    originY: e.y,
    w: e.type === 'M' ? 32 : 16,
    // 戸口は柱のように縦いっぱいを当たり判定にする。跳んだまま通り過ぎて
    // 先で詰まることがないように（絵は drawY の位置に1マスぶんだけ描く）。
    h: e.type === 'G' ? 192 : e.type === 'M' ? 4 : 16,
    drawY: e.y,
    y: e.type === 'G' ? 0 : e.y,
    direction: 1,
    // 縦に動く床は 2-4 だけ。ほかの面の M は横に往復する。
    axis: id === '2-4' ? 'y' : 'x',
    age: 0,
    triggered: false,
    vy: 0,
    alive: true,
  }));
}
// 三角波。開始位置からdistanceだけ進んで戻る。
export function travel(time, speed, distance) {
  const p = (time * speed) % (distance * 2);
  return p <= distance ? p : distance * 2 - p;
}
export function updateEntities(entities, level, player, time, dt) {
  return entities.map(source => {
    const e = { ...source, dx: 0, dy: 0 };
    if (!e.alive) {
      return e;
    }
    if (e.type === 'C') {
      e.x = e.originX + travel(time, 24, 48);
    }
    if (e.type === 'M') {
      e[e.axis] =
        e[e.axis === 'x' ? 'originX' : 'originY'] +
        (e.axis === 'y' ? -1 : 1) * travel(time, 24, 64);
    }
    if (e.type === 'D') {
      const next = e.x + e.direction * 24 * dt,
        front = e.direction > 0 ? next + e.w : next;
      if (
        !'#~='.includes(tileAt(level, front, e.y + e.h + 1)) ||
        '#~'.includes(tileAt(level, front, e.y + 8))
      ) {
        e.direction *= -1;
      } else {
        e.x = next;
      }
    }
    if (e.type === '^') {
      if (
        !e.triggered &&
        player.y > e.y &&
        player.x + player.w > e.x &&
        player.x < e.x + e.w
      ) {
        e.triggered = true;
      }
      if (e.triggered) {
        e.age += dt;
        if (e.age + 1e-9 >= 0.4) {
          e.vy = Math.min(420, e.vy + 900 * dt);
          e.y += e.vy * dt;
        }
      }
      if (e.y > 208) {
        e.alive = false;
      }
    }
    e.dx = e.x - source.x;
    e.dy = e.y - source.y;
    return e;
  });
}
