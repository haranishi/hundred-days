import { markers } from './levels.js';
import { step } from './physics.js';
import { hasFloor } from './entities.js';

// 通常入力だけで主路を進み、collectでは上段の報酬へ跳ぶ。
// 人の上手さを真似るものではなく、「地形が通れるか」を機械で確かめるための最小の判断。
export function createAutopilot(level, { mode = 'safe' } = {}) {
  let riding = null;
  let ready = false;
  let planned = [];
  const skipped = new Set();
  let attempt = 0;
  const detours = new Set();
  const searches = new Map();
  let rescueTick = -100;

  return function decide(s) {
    if (attempt !== s.runMisses) {
      planned = [];
      skipped.clear();
      detours.clear();
      searches.clear();
      attempt = s.runMisses;
    }
    if (planned.length) return planned.shift();
    if (mode === 'collect') {
      // 下段を取り残さないよう横位置順に回る。報酬帯は同距離の目標の優先順位に使う。
      const inReward = e => (level.routes?.reward ?? []).some(r =>
        e.x >= r.x && e.x < r.x + r.w && e.y >= r.y && e.y < r.y + r.h);
      const targets = s.entities.filter(e => e.alive && 'o*FS'.includes(e.type) && !skipped.has(e.id))
        .sort((a, b) => a.x - b.x || Number(inReward(a)) - Number(inReward(b)) || a.id - b.id);
      for (const target of targets) {
        const count = (searches.get(target.id) ?? 0) + 1;
        searches.set(target.id, count);
        if (count > 8) {
          skipped.add(target.id);
          continue;
        }
        planned = planInputs(s, target);
        if (planned.length) return planned.shift();
        // 高い棚へは雪台・枝・縦床・低い棚を中継する。同じ中継への往復はしない。
        const footholds = [
          ...s.entities.filter(e => 'J%M'.includes(e.type)),
          ...markers(level, '#=').filter(e => e.y < 176).map(e => ({ ...e, w: 16, h: 4,
            id: `floor:${e.x},${e.y}`, platform: true })),
        ].filter(e => e.x <= target.x && target.x - e.x < 240 && e.y > target.y &&
          e.y < s.player.y + s.player.h && !detours.has(`${target.id}:${e.id}`))
          .sort((a, b) => a.y - b.y || b.x - a.x);
        for (const foothold of footholds) {
          detours.add(`${target.id}:${foothold.id}`);
          planned = planInputs(s, { ...foothold, platform: foothold.type !== 'J' });
          if (planned.length) return planned.shift();
        }
        skipped.add(target.id);
      }
    }
    const p = s.player;
    // 導入の無風・平地では最初のうさぎを踏む。先読みが不成立なら従来の回避へ戻る。
    if (mode === 'safe' && p.grounded && level.wind === 0 && p.x < 160) {
      const rabbit = s.entities.find(e => e.alive && e.type === 'R' &&
        e.id === s.entities.find(first => first.type === 'R')?.id &&
        ['waiting', 'warning'].includes(e.phase) && e.x > p.x && e.x - p.x < 58 &&
        Math.abs(e.y + e.h - p.y - p.h) < 2 && !skipped.has(e.id));
      if (rabbit) {
        planned = planInputs(s, rabbit, true);
        if (planned.length) return planned.shift();
        skipped.add(rabbit.id);
      }
    }
    const front = p.x + p.w;
    const bottom = p.y + p.h;
    const solid = (x, y) => hasFloor(level, s.entities, x, y);
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
          'CDRB'.includes(e.type) &&
          e.x > p.x &&
          e.x - p.x < (e.type === 'B' && e.phase === 'moving' ? 52 : 34) &&
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

    const input = { left: false, right, jump };
    // 能力がなくても、敵を越えたあとの下降先が穴なら着地前に左右を調整する。
    if (!p.grounded && p.vy > 80 && bottom > 112 && s.tick - rescueTick > 16) {
      let future = s;
      for (let tick = 0; tick < 48 && future.status === 'playing'; tick++) {
        future = step(future, input);
        if (future.player.grounded) break;
      }
      if (future.status === 'dying') {
        rescueTick = s.tick;
        const floors = markers(level, '#~=').filter(e => e.x > p.x - 64 && e.x < p.x + 128 && e.y >= bottom - 16)
          .sort((a, b) => Math.abs(a.x - p.x - 32) - Math.abs(b.x - p.x - 32));
        for (const floor of floors) {
          planned = planInputs(s, { ...floor, id: `floor:${floor.x},${floor.y}`, w: 16, h: 16, platform: true });
          if (planned.length) return planned.shift();
        }
      }
    }
    return input;
  };
}

// 実際の固定刻みで候補入力を先読みする。状態を改変せず、採用した左右・跳躍だけを返す。
// 同じ位置でも上昇・下降、保持・解放、能力、雪台の反動を別の候補として残す。
function planInputs(initial, target, stomp = false) {
  const actions = [-1, 0, 1].flatMap(direction => [false, true].map(jump => ({
    left: direction < 0, right: direction > 0, jump,
  })));
  let beam = [{ state: initial, inputs: [], cost: 0 }];
  const visited = new Map();
  const distance = state => {
    const p = state.player;
    const goal = state.entities.find(e => e.id === target.id) ?? target;
    return Math.abs(p.x + p.w / 2 - goal.x - goal.w / 2) +
      Math.abs(p.y + (target.platform ? p.h : p.h / 2) - goal.y - (target.platform ? 0 : goal.h / 2)) * 1.5;
  };
  let best = beam[0];
  let bestDistance = distance(initial);
  for (let depth = 0; depth < (stomp ? 24 : 45); depth++) {
    const next = [];
    for (const node of beam) {
      for (const input of actions) {
        let state = node.state;
        const inputs = [...node.inputs];
        let success = false;
        for (let tick = 0; tick < 8; tick++) {
          state = step(state, input);
          inputs.push(input);
          success = state.telemetry.some(e => e.type === (stomp ? 'stomp' : target.type === 'J' ? 'snowpad' : 'collect') && (e.entityId ?? e.id) === target.id);
          if (!stomp && target.type !== 'J') {
            const p = state.player;
            const goal = state.entities.find(e => e.id === target.id) ?? target;
            success = target.platform
              ? p.grounded && p.x < goal.x + goal.w && p.x + p.w > goal.x && Math.abs(p.y + p.h - goal.y) < 1
              : !goal.alive && p.grounded;
          }
          if (success || state.status !== 'playing' || state.runHits > initial.runHits) break;
        }
        if (state.runHits > initial.runHits || state.runMisses > initial.runMisses) continue;
        if (success) return inputs;
        if (state.status !== 'playing') continue;
        const p = state.player;
        const goal = state.entities.find(e => e.id === target.id) ?? target;
        const dx = Math.abs(p.x + p.w / 2 - goal.x - goal.w / 2);
        const dy = Math.abs(p.y + p.h / 2 - goal.y - goal.h / 2);
        const cost = dx + dy * 1.5 + inputs.length * 0.08;
        const key = [Math.round(p.x / 5), Math.round(p.y / 5), Math.round(p.vx / 30),
          Math.round(p.vy / 60), p.grounded, state.jumpHeld, p.jumps, state.stage,
          state.ability, state.collectedRice, state.secretCollected, Math.floor(state.tick / 48)].join(',');
        if ((visited.get(key) ?? Infinity) <= cost) continue;
        visited.set(key, cost);
        const candidate = { state, inputs, cost };
        next.push(candidate);
        if (p.grounded && distance(state) < bestDistance) {
          best = candidate;
          bestDistance = distance(state);
        }
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    beam = next.slice(0, 32);
    if (!beam.length) break;
  }
  return !stomp && distance(initial) - bestDistance > 24 ? best.inputs : [];
}
