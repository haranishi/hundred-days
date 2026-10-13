// 幅優先の全探索ソルバー（テスト専用・配信しない）。作業記録の reference/solve.mjs の写しで、sim の読み込み先だけ load-sim.mjs に変えてある。
// ルールは sim の act() だけを使う。同じ状態（怪盗の位置・箱の位置・警備員の状態・宝）は二度見ない。
// 最短手数（par）、最短解の本数（上限つき）、見本の解（ACTIONS の順で最初に見つかったもの）、探索した状態数を返す。
import { sim } from './load-sim.mjs';
const { loadLevel, initialState, act, stateKey, ACTIONS, NORMAL } = sim;

export const COUNT_CAP = 9999; // 最短解の本数はここで打ち切る（表では 9999+ と出す）

// data：面データ（levels.json の1件）。world：sim.mjs の NORMAL か、その変形。
// exhaust=true なら解が見つかっても最後まで調べ、届く状態の総数（reachable）も数える。
export function solve(data, { world = NORMAL, exhaust = false, maxStates = 3_000_000, level: given } = {}) {
  const level = given ?? loadLevel(data);
  const t0 = Date.now();
  const start = initialState(level);
  const parent = new Map([[stateKey(start), null]]);
  let frontier = new Map([[stateKey(start), { state: start, count: 1 }]]);
  let depth = 0;
  let found = null; // { par, count, lastKey, lastAction }
  let truncated = false;
  while (frontier.size && !truncated) {
    const next = new Map();
    let winCount = 0;
    let winAt = null;
    for (const [key, { state, count }] of frontier) {
      for (const a of ACTIONS) {
        const r = act(level, state, a, world);
        if (!r.valid || r.state.status === 'caught') continue;
        if (r.state.status === 'escaped') {
          winCount = Math.min(COUNT_CAP + 1, winCount + count);
          if (!winAt) winAt = { key, action: a };
          continue;
        }
        const k = stateKey(r.state);
        if (parent.has(k) && !next.has(k)) continue; // もっと浅い層で見た状態
        const slot = next.get(k);
        if (slot) slot.count = Math.min(COUNT_CAP + 1, slot.count + count);
        else {
          parent.set(k, { key, action: a });
          next.set(k, { state: r.state, count });
          if (parent.size >= maxStates) { truncated = true; break; }
        }
      }
      if (truncated) break;
    }
    depth += 1;
    if (winAt && !found) {
      found = { par: depth, count: winCount, explored: parent.size, solution: pathTo(parent, winAt) };
      if (!exhaust) break;
    }
    frontier = next;
  }
  return {
    solvable: !!found,
    par: found?.par ?? null,
    count: found?.count ?? 0,
    countCapped: (found?.count ?? 0) > COUNT_CAP,
    explored: found?.explored ?? parent.size,
    reachable: exhaust || !found ? parent.size : null,
    solution: found?.solution ?? null,
    truncated,
    ms: Date.now() - t0,
  };
}

function pathTo(parent, winAt) {
  const moves = [winAt.action];
  let link = parent.get(winAt.key);
  while (link) {
    moves.push(link.action);
    link = parent.get(link.key);
  }
  return moves.reverse().join('');
}

// 面データから警備員とレーザーを外した面（V6：警備なしの世界）
export function withoutGuards(data) {
  return { ...data, guards: [], lasers: [] };
}
