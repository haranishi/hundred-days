// 面データを組み立て、ソルバーで par・見本の解・統計を計算して ../levels.json と ../levels.txt に書く（開発用・配信しない）。
// 使い方: node build-levels.mjs          … levels.json と levels.txt を書き直す
//         node build-levels.mjs --place L5 … その面の箱を盤の全マスに置き直して、条件に合う置き場所を並べる（手で調整する前提）
import { writeFileSync } from 'node:fs';
import { loadLevel, replay, initialState, guardPose, NORMAL } from './sim.mjs';
import { solve } from './solve.mjs';
import { explore, verifyTrap, analyze } from './checks.mjs';

const W = (at, looks, start = 0) => ({ kind: 'watch', at, looks, start });
const Pa = (path, start = 0, dir = 1) => ({ kind: 'patrol', path, start, dir });
const row = (y, a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, y]);

// 面の定義（手作り）。trap は「自然に見える押し間違い」の手順。最後の手が箱を押し、その直後から解けなくなる。
export const BASE = [
  { id: 'L1', name: 'はじめの影', hint: '光に入ると見つかる。箱を光の中へ押すと、その先に影ができる。',
    roleNote: '箱1が見張りの光を止め、その影を通って宝を取る（遮光）。',
    discovery: '箱が光を止め、後ろに影ができる。影の中は安全',
    board: ['....P.', '..B..E', '......', '....T.'], guards: [W([0, 2], ['R'])], lasers: [], trap: null },
  { id: 'L2', name: '交わる光', hint: '光が2本ある。1つの箱で、2本ともさえぎれる場所はないか。',
    roleNote: '箱1を2本の光が交わるマスに置くと、両方を止める（遮光）。横の光の手前に落とすと二度と動かせない（出口）。',
    discovery: '2本の光が交わるマスなら、箱1つで両方を止められる',
    board: ['.....E', 'PB....', '......', '......', '......', '.....T'], guards: [W([0, 2], ['R']), W([3, 5], ['U'])], lasers: [],
    trap: { moves: 'URD', box: 0, note: '目の前の横の光へ箱を落とすと、縦の光が残り、箱も二度と動かせない' } },
  { id: 'L3', name: 'レーザーの線', hint: 'レーザーは壁から出る。影は、光が来る向きの反対側にできる。',
    roleNote: '箱1をレーザーの台の側に置くと、金庫の入口まで影が届く（遮光）。真下に落とすと壁際で動かせない（出口）。',
    discovery: '影は光源の反対側にできる。箱は光源の側に置く',
    board: ['.P.....', '.......', '.....B.', '#.....#', '##.####', '##TE###'], guards: [], lasers: [{ at: [0, 3], dir: 'R' }],
    trap: { moves: 'RRRRDD', box: 0, note: '箱をその場で真下のレーザーへ落とすと、影は金庫の入口に届かず、箱も壁際で動かせない' } },
  { id: 'L4', name: 'まわる見張り', hint: '見張りは1手ごとに右へ回る。点線は次の光。光のない所に、何手いられるか数えよう。',
    roleNote: '箱1で見張りの右の線をふさぎ、宝の前の通路を影にする（遮光）。右へ押しすぎると止められない（出口）。',
    discovery: '回る光は待てば向きを変える。長くいる線だけ箱でふさぐ',
    board: ['P.....E', '......#', '......T', '.B....#', '.......'], guards: [W([3, 2], ['U', 'R', 'D', 'L'])], lasers: [],
    trap: { moves: 'DDDRUDRRR', box: 0, note: '箱を右の端まで押しすぎると、宝の前の通路を照らす光を止められない' } },
  { id: 'L5', name: '引き返す警備員', hint: '警備員は道を行き来する。どこで引き返せば、通れるだろう。',
    roleNote: '箱1を巡回の道の端に置くと、警備員はその手前で引き返し、光も止まる（巡回＋遮光）。右の穴から落とすと廊下に詰まる（出口）。',
    discovery: '巡回の道に置いた箱で、警備員を引き返させる（光も止まる）',
    board: ['E.....', 'P...B.', '##..##', '.....T', '######'], guards: [Pa(row(3, 0, 2))], lasers: [],
    trap: { moves: 'RURRRRDLULD', box: 0, note: '宝に近い右の穴から箱を落とすと、廊下に詰まって宝へ行けない' } },
  { id: 'L6', name: '通り道をふさがない', hint: '箱は引けない。押したあと、自分はどこを通るか考えよう。',
    roleNote: '箱1を見張りの側の穴から廊下へ入れて光を止める（遮光）。出口に近い穴へ押し上げると、その穴がふさがる（出口）。',
    discovery: '光を止めても、箱で自分の通り道をふさいだら出られない',
    board: ['######E', '.......', '#.##.##', '....B..', 'P.....T'], guards: [W([0, 1], ['R'])], lasers: [],
    trap: { moves: 'RRRRU', box: 0, note: '出口に近い穴へ箱をまっすぐ押し上げると、その穴がふさがる' } },
  { id: 'L7', name: '一つで二役', hint: 'レーザーと警備員、両方をさえぎれる場所はないか。',
    roleNote: '箱1をレーザーの線に沿って巡回の道の端まで押し下げると、レーザーも警備員も止まる（遮光＋巡回）。手前の列で落とすとレーザーが残る（出口）。',
    discovery: '1つの箱が、レーザーを止めながら警備員も引き返させる',
    board: ['E......', '.B.....', '.......', '.#...##', 'P.....T', '#######'], guards: [Pa(row(4, 1, 3), 1, 1)], lasers: [{ at: [3, 5], dir: 'U' }],
    trap: { moves: 'UUURURDD', box: 0, note: 'レーザーの手前の列で箱を巡回へ落とすと、レーザーが残って右へ渡れない' } },
  { id: 'L8', name: '宝物庫', hint: '箱は2つ。どちらを、どこへ押すか。見張りの回る向きも見よう。',
    roleNote: '箱1はレーザーの線へ（遮光）、箱2は巡回の道の端へ（巡回）。箱2を広い穴から落とすと、宝への廊下がふさがる（出口）。',
    discovery: '2つの箱を、レーザー用と警備員用に使い分ける',
    board: ['E.......', '.B..B...', '........', '........', '.#.#..##', 'P......T', '########'], guards: [Pa(row(5, 1, 4), 1, 1), W([6, 2], ['L', 'U', 'R', 'D'])], lasers: [{ at: [2, 6], dir: 'U' }],
    trap: { moves: 'UUUURURRDRURDDDD', box: 1, note: '右の箱を広い穴から廊下へ落とすと、宝への廊下がふさがる' } },
];

// 同じ長さのまま、行って戻るだけの2手（UD・LR など）を「待つ」2回に置き換えられるなら置き換える（お手本を見やすくする）
function tidy(level, moves) {
  const back = { U: 'D', D: 'U', L: 'R', R: 'L' };
  let m = moves;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i + 1 < m.length; i++) {
      if (back[m[i]] !== m[i + 1]) continue;
      const cand = m.slice(0, i) + '..' + m.slice(i + 2);
      const r = replay(level, cand);
      if (r.ok && r.state.status === 'escaped' && r.state.steps === m.length) { m = cand; changed = true; break; }
    }
  }
  return m;
}

export function build(def, no) {
  const level = loadLevel(def);
  const s = solve(def, { level, exhaust: true });
  if (!s.solvable) throw new Error(`${def.id} が解けない`);
  const ex = explore(level);
  const solution = tidy(level, s.solution);
  const trap = def.trap ? { ...def.trap, check: verifyTrap(level, def.trap) } : null;
  if (trap && !trap.check.ok) throw new Error(`${def.id} の罠が成り立たない ${JSON.stringify(trap.check)}`);
  const a = analyze({ ...def, solution });
  const roles = { note: def.roleNote, boxes: a.perBox.map((b) => ({ box: b.box, shade: b.shade, turn: b.turn, exit: b.exit })) };
  return {
    id: def.id, no, name: def.name, hint: def.hint, discovery: def.discovery,
    board: def.board, guards: def.guards, lasers: def.lasers,
    par: s.par, solution,
    stats: { solutions: s.count, solutionsCapped: s.countCapped, explored: s.explored, reachable: s.reachable, dead: ex.dead },
    trap: trap && { moves: trap.moves, box: trap.box, note: trap.note },
    roles,
  };
}

// 盤の文字表示（levels.txt）：警備員 G（巡回の道は :）、レーザーの台 *、それ以外は面データの文字
export function boardText(def) {
  const level = loadLevel(def);
  const st = initialState(level);
  return def.board.map((line, y) => [...line].map((ch, x) => {
    const g = st.guards.findIndex((gs, i) => { const p = guardPose(level, i, gs).at; return p[0] === x && p[1] === y; });
    if (g >= 0) return 'G';
    if (def.lasers.some((l) => l.at[0] === x && l.at[1] === y)) return '*';
    if (def.guards.some((gd) => gd.kind === 'patrol' && gd.path.some((p) => p[0] === x && p[1] === y)) && ch === '.') return ':';
    return ch;
  }).join(' ')).join('\n');
}

const arrow = { U: '上', R: '右', D: '下', L: '左' };
function describe(def) {
  const lines = def.guards.map((g, i) => (g.kind === 'watch'
    ? `警備員${i + 1}：見張り [${g.at}]・向き ${g.looks.map((d) => arrow[d]).join('→')}（最初 ${arrow[g.looks[g.start ?? 0]]}）`
    : `警備員${i + 1}：巡回 [${g.path[0]}]〜[${g.path[g.path.length - 1]}]・最初 [${g.path[g.start ?? 0]}] から ${(g.dir ?? 1) > 0 ? '道の後ろへ' : '道の前へ'}`));
  return lines.concat(def.lasers.map((l, i) => `レーザー${i + 1}：台 [${l.at}]・${arrow[l.dir]}向き`));
}

if (process.argv.includes('--place')) {
  const id = process.argv[process.argv.indexOf('--place') + 1];
  const def = BASE.find((d) => d.id === id);
  const empty = def.board.map((r) => r.replace(/B/g, '.'));
  const cells = empty.flatMap((r, y) => [...r].flatMap((ch, x) => (ch === '.' ? [[x, y]] : [])));
  for (const [x, y] of cells) {
    const board = empty.map((r, yy) => (yy === y ? r.slice(0, x) + 'B' + r.slice(x + 1) : r));
    try {
      const s = solve({ ...def, board }, { maxStates: 200000 });
      const nopush = solve({ ...def, board }, { world: { ...NORMAL, push: false }, maxStates: 200000 });
      if (s.solvable && !nopush.solvable) console.log(`箱 [${x},${y}] par=${s.par} 最短解${s.count}本`);
    } catch { /* 置けないマス */ }
  }
} else {
  const out = BASE.map((def, i) => build(def, i + 1));
  writeFileSync(new URL('../levels.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
  const txt = BASE.map((def, i) => [`面${i + 1} ${def.name}（${out[i].id}・${def.board[0].length}×${def.board.length}・par ${out[i].par}）`,
    boardText(def), ...describe(def), `見本の解：${out[i].solution}`, def.trap ? `罠：${def.trap.moves}（${def.trap.note}）` : '罠：なし', `箱の役：${def.roleNote}`, ''].join('\n'));
  writeFileSync(new URL('../levels.txt', import.meta.url), ['# 箱影の怪盗 面の一覧（build-levels.mjs が書く。手で直さない）',
    '# 記号：# 壁 / . 床 / P 怪盗 / B 箱 / T 宝 / E 出口 / G 警備員の最初の位置 / : 巡回の道 / * レーザーの台', '', ...txt].join('\n'));
  for (const L of out) console.log(`${L.id} ${L.name} par=${L.par} 最短解${L.stats.solutions}本 状態${L.stats.explored}/${L.stats.reachable} 詰み${L.stats.dead} 見本=${L.solution}`);
}
