import { markers, tileAt } from './levels.js';
export const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// 動的な足場も、物理と自動操作で同じ有効上面を使う。
export const isPlatform = e => e.alive && 'MJ%'.includes(e.type) && e.phase !== 'absent';
export function hasFloor(level, entities, x, y, dynamic = true) {
  return '#~='.includes(tileAt(level, x, y)) || (dynamic && entities.some(
    e => isPlatform(e) && x >= e.x && x < e.x + e.w && y >= e.y && y <= e.y + e.h,
  ));
}
// 面の行・列順を固定IDとし、再開時も同じ初期状態へ戻す。
export function createEntities(level) {
  return markers(level, 'CDRBM^o*GFSJ%').map((e, i) => {
    const options = level.entityOptions?.[`${e.x / 16},${e.y / 16}`] ?? {};
    const axis = options.axis ?? 'x';
    const phaseTicks = options.phaseTicks ?? 0;
    const offset = e.type === 'M' ? travel(phaseTicks / 120, 24, 64) : 0;
    return {
      ...e,
      id: i,
      originX: e.x,
      originY: e.y,
      w: e.type === 'M' ? 32 : 16,
      h: e.type === 'G' ? 192 : 'M%'.includes(e.type) ? 4 : e.type === 'J' ? 8 : 16,
      ...(e.type === 'G' ? { drawY: e.y } : {}),
      x: e.x + (axis === 'x' ? offset : 0),
      y: e.type === 'G' ? 0 : e.y - (axis === 'y' ? offset : 0),
      direction: 1,
      axis,
      phaseOffset: phaseTicks,
      phase: 'CDRB'.includes(e.type) ? 'waiting' : 'ready',
      phaseTicks: 0,
      retireTicks: 0,
      ageTicks: 0,
      age: 0,
      activated: false,
      triggered: false,
      vx: 0,
      vy: 0,
      dx: 0,
      dy: 0,
      alive: true,
    };
  });
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
      e.retireTicks = Math.max(0, e.retireTicks - 1);
      return e;
    }
    if (e.type === 'C') {
      e.phase = 'moving';
      e.x = e.originX + travel(time, 24, 48);
    }
    if (e.type === 'M') {
      e[e.axis] = e[e.axis === 'x' ? 'originX' : 'originY'] +
        (e.axis === 'y' ? -1 : 1) * travel(time + e.phaseOffset / 120, 24, 64);
    }
    if (e.type === 'D') {
      e.phase = 'moving';
      const next = e.x + e.direction * 24 * dt;
      const front = e.direction > 0 ? next + e.w : next;
      if (!hasFloor(level, entities, front, e.y + e.h + 1) ||
          '#~'.includes(tileAt(level, front, e.y + 8))) {
        e.direction *= -1;
      } else {
        e.x = next;
      }
    }
    if ('RB'.includes(e.type)) {
      e.activated ||= Math.abs(player.x + player.w / 2 - (e.x + e.w / 2)) <= 160;
      if (e.activated) {
        e.ageTicks++;
        e.phaseTicks++;
        if (e.type === 'R') {
          if (e.phase === 'moving') {
            e.vy = Math.min(420, e.vy + 900 * dt);
            e.x += e.vx * dt;
            e.y += e.vy * dt;
            if (e.vy > 0 && e.y >= e.originY) {
              e.y = e.originY;
              e.vx = e.vy = 0;
              e.phase = 'waiting';
              e.phaseTicks = 0;
            }
          } else if (e.phaseTicks >= 96) {
            const landing = e.x + e.direction * 48 * (420 / 900);
            if (landing < e.originX || landing > e.originX + 48) e.direction *= -1;
            e.vx = e.direction * 48;
            e.vy = -210;
            e.phase = 'moving';
            e.phaseTicks = 0;
          } else {
            e.phase = e.phaseTicks >= 60 ? 'warning' : 'waiting';
          }
        } else if (e.phase === 'waiting') {
          if (e.ageTicks >= 60 &&
              Math.abs(player.x + player.w / 2 - (e.x + e.w / 2)) <= 96 &&
              Math.abs(player.y + player.h - (e.y + e.h)) <= 24) {
            e.direction = player.x + player.w / 2 < e.x + e.w / 2 ? -1 : 1;
            e.phase = 'warning';
            e.phaseTicks = 0;
          }
        } else if (e.phase === 'warning' && e.phaseTicks >= 48) {
          e.phase = 'moving';
          e.phaseTicks = 0;
          e.vx = e.direction * 96;
        } else if (e.phase === 'moving') {
          const next = e.x + e.vx * dt;
          const front = e.direction > 0 ? next + e.w + 2 : next - 2;
          if (!hasFloor(level, entities, front, e.y + e.h + 1, false) ||
              '#~'.includes(tileAt(level, front, e.y + 8))) {
            e.phase = 'resting';
          } else {
            e.x = next;
            if (e.phaseTicks >= 60) e.phase = 'resting';
          }
          if (e.phase === 'resting') {
            e.vx = 0;
            e.phaseTicks = 0;
          }
        } else if (e.phase === 'resting' && e.phaseTicks >= 72) {
          e.phase = 'waiting';
          e.phaseTicks = 0;
        }
      }
    }
    if (e.type === '%' && e.triggered) {
      e.phaseTicks++;
      if (e.phase === 'absent') {
        if (e.phaseTicks >= 240 && !overlap(player, e)) {
          e.phase = 'ready';
          e.phaseTicks = 0;
          e.triggered = false;
        }
      } else if (e.phaseTicks >= 48) {
        e.phase = 'absent';
        e.phaseTicks = 0;
      } else if (e.phaseTicks >= 24) {
        e.phase = 'cracking';
      }
    }
    if (e.type === '^') {
      if (!e.triggered && player.y > e.y && player.x + player.w > e.x && player.x < e.x + e.w) {
        e.triggered = true;
      }
      if (e.triggered) {
        e.ageTicks++;
        e.age = e.ageTicks / 120;
        e.phase = e.ageTicks < 48 ? 'warning' : 'moving';
        if (e.ageTicks >= 48) {
          e.vy = Math.min(420, e.vy + 900 * dt);
          e.y += e.vy * dt;
        }
      }
      if (e.y > 208) e.alive = false;
    }
    e.dx = e.x - source.x;
    e.dy = e.y - source.y;
    return e;
  });
}
