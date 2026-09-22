import { tileAt } from './levels.js';

// 右へ進むだけの自動操作。テストの到達確認と、紹介動画の撮影で同じものを使う。
// 人の上手さを真似るものではなく、「地形が通れるか」を機械で確かめるための最小の判断。
export function createAutopilot(level) {
  let riding = null;
  let ready = false;

  return function decide(s) {
    const p = s.player;
    const front = p.x + p.w;
    const bottom = p.y + p.h;
    const solid = (x, y) => '#~='.includes(tileAt(level, x, y));
    const support = s.entities.find(e => e.id === p.support && e.type === 'M');
    let right = true;
    let jump = !p.grounded && s.jumpHeld;

    if (support) {
      if (riding !== support.id) {
        riding = support.id;
        ready = false;
      }
      // 横床は対岸に着くまで、縦床は上がり切るまで運んでもらう。
      if (support.axis === 'y') {
        ready ||= support.y <= support.originY - 62;
      } else {
        ready ||= solid(support.x + support.w + 4, 176);
      }
      right = ready;
      jump = support.axis === 'y' && ready && p.x >= support.x + support.w - 3;
    } else if (p.grounded) {
      riding = null;
      const wall = solid(front + 2, bottom - 2);
      const hole = !solid(front + 2, bottom + 1);
      // 前にいる敵は踏むか跳び越す。
      const enemy = s.entities.some(
        e =>
          e.alive &&
          (e.type === 'C' || e.type === 'D') &&
          e.x > p.x &&
          e.x - p.x < 34 &&
          Math.abs(e.y - p.y) < 26,
      );
      jump = (wall || hole || enemy) && !s.jumpHeld;
    }

    // 縦床の下では戻ってくるのを待ち、真上へ跳んで乗る。
    const lift = s.entities.find(
      e => e.type === 'M' && e.axis === 'y' && front >= e.x + 4 && p.x < e.x + e.w,
    );
    if (!support && lift && riding !== lift.id) {
      right = false;
      if (p.grounded) jump = lift.y >= bottom - 24 && !s.jumpHeld;
    }

    return { left: false, right, jump };
  };
}
