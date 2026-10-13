// V1〜V7 の検査そのもの（開発・検証用。配信しない）。verify-levels.mjs と build-levels.mjs が使う。
// 単体テストへ移すときは、この関数を tests/ に写して同じ数字が出ることを確かめる。
import { loadLevel, initialState, act, replay, shadows, beams, stateKey, canWin, NORMAL, ACTIONS } from './sim.mjs';
import { solve, withoutGuards } from './solve.mjs';

export const RULE = Object.freeze({
  v3Ratio: 1.3, v3Levels: 3, // 箱が光を止めない世界で「解なし」か par が3割以上増える面が3つ以上
  v4Levels: 2, // 箱が巡回に効かない世界で「解なし」か par が増える面が2つ以上（依頼の「変わる」より厳しく、助けになる向きだけ数える）
  v5Levels: 3, // 自然に見える押し間違いの後が解なしになる面が3つ以上
  v6Ratio: 0.7, // 警備なしの世界で par が3割以上短くなる面が過半数
  v7Levels: 2, // 後半の面のうち、同じ箱が二役以上を持つ面が2つ以上
  msPerLevel: 30_000,
});

// 解の手順をたどり、箱ごとに「怪盗がその箱の影にいた手」と「警備員がその箱で引き返した手」を集める。
// 影は、怪盗が動いた直後（警備員が動く前）と、警備員が動いた後の両方で見る。
export function rolesAlong(level, moves) {
  const per = level.boxes.map(() => ({ shadow: [], turn: [] }));
  let state = initialState(level);
  for (let n = 0; n < moves.length; n++) {
    const r = act(level, state, moves[n], NORMAL);
    if (!r.valid) throw new Error(`解の${n + 1}手目が無効 (${r.reason})`);
    const mid = { ...state, player: r.state.player, boxes: r.state.boxes, treasure: r.state.treasure };
    for (const s of [mid, r.state]) {
      if (r.state.status === 'escaped') break;
      for (const sh of shadows(level, s)) {
        if (sh.cell[0] === s.player[0] && sh.cell[1] === s.player[1]) {
          per[sh.box].shadow.push({ step: n + 1, source: sh.source, afterTreasure: s.treasure });
        }
      }
    }
    for (const e of r.events) if (e.type === 'guard' && e.action === 'turn-box') per[e.box].turn.push({ step: n + 1, guard: e.index });
    state = r.state;
  }
  return per;
}

// 罠の確認：moves を再生して、途中で見つからず、最後の手が箱を押す手で、その直前は解けて、直後は解けない（調べ尽くして）こと。
export function verifyTrap(level, trap) {
  if (!trap) return { ok: false, why: '罠の記録なし' };
  const r = replay(level, trap.moves);
  if (!r.ok) return { ok: false, why: `罠の手順が無効 (${r.at + 1}手目 ${r.reason})` };
  if (r.state.status !== 'play') return { ok: false, why: `罠の途中で ${r.state.status}` };
  const before = r.history[r.history.length - 2];
  const last = act(level, before, trap.moves[trap.moves.length - 1]);
  const pushed = last.events.find((e) => e.type === 'push');
  if (!pushed) return { ok: false, why: '最後の手が箱を押していない' };
  if (trap.box !== undefined && pushed.box !== trap.box) return { ok: false, why: `押した箱が ${pushed.box}（記録は ${trap.box}）` };
  const pre = canWin(level, before, Infinity);
  const post = canWin(level, r.state, Infinity);
  return { ok: pre === 'alive' && post === 'dead', pre, post, box: pushed.box, steps: trap.moves.length };
}

// 全状態を前向きに広げ、勝ちにつながる状態を後ろ向きに求める。押し間違い（解ける→解けない に変わる押し）を拾う。
export function explore(level, world = NORMAL) {
  const start = initialState(level);
  const ids = new Map([[stateKey(start), 0]]);
  const states = [start];
  const parent = [null];
  const preds = [[]];
  const wins = new Set();
  const pushes = [];
  for (let id = 0; id < states.length; id++) {
    for (const a of ACTIONS) {
      const r = act(level, states[id], a, world);
      if (!r.valid || r.state.status === 'caught') continue;
      if (r.state.status === 'escaped') { wins.add(id); continue; }
      const k = stateKey(r.state);
      let to = ids.get(k);
      if (to === undefined) {
        to = states.length;
        ids.set(k, to);
        states.push(r.state);
        parent.push({ from: id, action: a });
        preds.push([]);
      }
      preds[to].push(id);
      if (r.events.some((e) => e.type === 'push')) pushes.push({ from: id, to, action: a, box: r.events.find((e) => e.type === 'push').box });
    }
  }
  const alive = new Set(wins);
  const queue = [...wins];
  while (queue.length) {
    const id = queue.pop();
    for (const p of preds[id]) if (!alive.has(p)) { alive.add(p); queue.push(p); }
  }
  const pathOf = (id) => {
    const out = [];
    for (let link = parent[id]; link; link = parent[link.from]) out.push(link.action);
    return out.reverse().join('');
  };
  const traps = pushes.filter((p) => alive.has(p.from) && !alive.has(p.to))
    .map((p) => ({ moves: pathOf(p.from) + p.action, box: p.box, into: intoLight(level, states[p.from], p.action) }))
    .sort((a, b) => a.moves.length - b.moves.length);
  return { reachable: states.length, alive: alive.size, dead: states.length - alive.size, traps };
}

// その押しで、箱が「今光っているマス」へ入ったか（＝光を止めに行く、自然に見える押し）
function intoLight(level, state, action) {
  const r = act(level, state, action);
  const push = r.events.find((e) => e.type === 'push');
  if (!push) return false;
  return beams(level, state).some((b) => b.cells.some((c) => c[0] === push.to[0] && c[1] === push.to[1]));
}

// 1面ぶんの全検査。数字だけを返し、合否の判定は judge() が全面をまとめて行う。
export function analyze(data) {
  const level = loadLevel(data);
  const t0 = Date.now();
  const normal = solve(data, { level, exhaust: true });
  const v2 = solve(data, { level, world: { ...NORMAL, push: false } });
  const v3 = solve(data, { level, world: { ...NORMAL, noShade: 'all' } });
  const v4 = solve(data, { level, world: { ...NORMAL, noTurn: 'all' } });
  const v6 = solve(withoutGuards(data));
  const v5 = data.trap ? verifyTrap(level, data.trap) : null;
  const roles = normal.solution ? rolesAlong(level, data.solution ?? normal.solution) : [];
  const perBox = roles.map((r, b) => {
    const noShade = solve(data, { level, world: { ...NORMAL, noShade: [b] } });
    const noTurn = solve(data, { level, world: { ...NORMAL, noTurn: [b] } });
    const shade = r.shadow.length > 0 && (!noShade.solvable || noShade.par >= normal.par * RULE.v3Ratio);
    const turn = r.turn.length > 0 && (!noTurn.solvable || noTurn.par > normal.par);
    const exit = !!(v5?.ok && v5.box === b);
    return { box: b, shadowSteps: r.shadow.length, turnSteps: r.turn.length, noShade, noTurn, shade, turn, exit, count: [shade, turn, exit].filter(Boolean).length };
  });
  const initialSeen = beams(level, initialState(level)).some((b) => b.cells.some((c) => c[0] === level.start[0] && c[1] === level.start[1]));
  return { id: data.id, name: data.name, w: level.w, h: level.h, normal, v2, v3, v4, v5, v6, perBox, initialSeen, ms: Date.now() - t0 };
}

// 全面の数字から V1〜V7 の合否を出す。late＝後半（面の数の半分より後ろ）。
export function judge(results) {
  const n = results.length;
  const late = results.slice(Math.floor(n / 2));
  const v3ok = (r) => !r.v3.solvable || r.v3.par >= r.normal.par * RULE.v3Ratio;
  const v4ok = (r) => !r.v4.solvable || r.v4.par > r.normal.par;
  const v6ok = (r) => r.v6.solvable && r.v6.par <= r.normal.par * RULE.v6Ratio;
  const v7ok = (r) => r.perBox.some((b) => b.count >= 2);
  return {
    V1: { pass: results.every((r) => r.normal.solvable && !r.initialSeen && r.ms <= RULE.msPerLevel), detail: `${results.filter((r) => r.normal.solvable).length}/${n} 面で解あり` },
    V2: { pass: results.every((r) => !r.v2.solvable), detail: `${results.filter((r) => !r.v2.solvable).length}/${n} 面で解なし` },
    V3: { pass: results.filter(v3ok).length >= RULE.v3Levels, detail: `${results.filter(v3ok).length} 面（必要 ${RULE.v3Levels}）` },
    V4: { pass: results.filter(v4ok).length >= RULE.v4Levels, detail: `${results.filter(v4ok).length} 面（必要 ${RULE.v4Levels}）` },
    V5: { pass: results.filter((r) => r.v5?.ok).length >= RULE.v5Levels, detail: `${results.filter((r) => r.v5?.ok).length} 面（必要 ${RULE.v5Levels}）` },
    V6: { pass: results.filter(v6ok).length > n / 2, detail: `${results.filter(v6ok).length}/${n} 面（必要 過半数）` },
    V7: { pass: late.filter(v7ok).length >= RULE.v7Levels, detail: `後半 ${late.length} 面のうち ${late.filter(v7ok).length} 面（必要 ${RULE.v7Levels}）` },
    v3ok, v4ok, v6ok, v7ok,
  };
}
