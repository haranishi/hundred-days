// ルールの境界を、手で作った小さな盤で確かめる（開発用・配信しない）。単体テスト rules.test.mjs の元になる。
// 使い方: node rules-check.mjs   （1つでも外れたら終了コード1）
import { loadLevel, initialState, act, scene, preview, beams, canWin, replay, starsFor, guardPose, WAIT } from './sim.mjs';

let bad = 0;
const ok = (cond, msg) => { if (!cond) { bad++; console.log('NG:', msg); } else console.log('ok:', msg); };
const L = (board, guards = [], lasers = []) => loadLevel({ id: 'X', board, guards, lasers });
const lit = (lv, st) => new Set(beams(lv, st).flatMap((b) => b.cells.map((c) => c.join())));
const W = (at, looks) => ({ kind: 'watch', at, looks });
const P = (path, start = 0, dir = 1) => ({ kind: 'patrol', path, start, dir });

// 1 影の端：箱の手前は光、すぐ後ろは影。影は壁まで続く
{
  const lv = L(['.P...E', '......', '..B..T'], [W([0, 2], ['R'])]);
  const s = initialState(lv);
  const L1 = lit(lv, s);
  ok(L1.has('1,2') && !L1.has('3,2') && !L1.has('5,2'), '1 箱の手前 [1,2] は光、後ろ [3,2]〜[5,2] は光らない');
  const sh = scene(lv, s).shadows.map((x) => x.cell.join());
  ok(sh.includes('3,2') && sh.includes('4,2') && sh.includes('5,2'), '1 影は箱の後ろから盤の端まで');
}
// 2 箱を光の外へ押すと、元の箱のマスに入った自分に光が届く（uncovered）
{
  const lv = L(['..P..E', '..B...', '.....T'], [W([0, 1], ['R'])]);
  const r = act(lv, initialState(lv), 'D');
  ok(r.valid && r.state.status === 'caught' && r.state.caught.reason === 'uncovered' && r.state.caught.phase === 'move', '2 光を止めていた箱を下へどかすと uncovered で見つかる');
}
// 3 光源の方へ箱を押していくと、ずっと影にいる
{
  const lv = L(['.....E', '...BP.', '.....T'], [W([0, 1], ['R'])]);
  let s = initialState(lv);
  for (const m of 'LL') { const r = act(lv, s, m); s = r.state; }
  ok(s.status === 'play' && s.boxes[0][0] === 1 && s.player[0] === 2, '3 光源へ向けて2回押しても見つからない');
}
// 4 巡回は道の端で向きを変えるのに1歩使う
{
  const lv = L(['P....E', '......', '.....T'], [P([[1, 2], [2, 2], [3, 2]], 2, 1)]);
  const r = act(lv, initialState(lv), WAIT);
  const g = r.events.find((e) => e.type === 'guard');
  const pose = guardPose(lv, 0, r.state.guards[0]);
  ok(g.action === 'turn' && pose.at[0] === 3 && pose.facing === 'L', '4 端の警備員は、その場で左を向く（位置は変わらない）');
  const r2 = act(lv, r.state, WAIT);
  ok(guardPose(lv, 0, r2.state.guards[0]).at[0] === 2, '4 向きを変えた次の手で、1マス戻る');
}
// 5 次のマスに箱があると引き返す。箱は動かない
{
  const lv = L(['P....E', '......', '.B...T'], [P([[1, 2], [2, 2], [3, 2]].reverse(), 0, 1)]);
  // 道は [3,2]→[2,2]→[1,2]。[1,2] に箱。警備員は [3,2] から左へ。
  let s = initialState(lv);
  const e1 = act(lv, s, WAIT); s = e1.state;
  ok(preview(lv, s).moves[0].action === 'turn-box', '5 予告も「箱の前で引き返す」を示す');
  const e2 = act(lv, s, WAIT); s = e2.state;
  const g = e2.events.find((e) => e.type === 'guard');
  ok(g.action === 'turn-box' && g.box === 0 && g.to[0] === 2 && s.boxes[0][0] === 1, '5 箱の手前 [2,2] で引き返す（箱は押されない）');
}
// 6 その手で警備員の次のマスへ箱を押すと、予告では進むはずの警備員が引き返す
{
  const lv = L(['..P..E', '..B...', '......', '.....T'], [P([[0, 2], [1, 2], [2, 2], [3, 2]], 1, 1)]);
  const s = initialState(lv);
  const pv = preview(lv, s).moves[0];
  const r = act(lv, s, 'D');
  const g = r.events.find((e) => e.type === 'guard');
  ok(pv.action === 'move' && g.action === 'turn-box', '6 予告は「進む」、箱を押した手では「引き返す」');
}
// 7 今は暗いが、警備員が1歩進むと光るマスへ入る → 判定Bで見つかる
{
  const lv = L(['P.....', '......', '.....E', 'T.....'], [W([3, 0], ['L', 'D'])]);
  // 見張りは左→下の順。最初は左を見ている。[3,1] は今は暗いが、次の向き（下）で光る。
  let s = initialState(lv);
  s = { ...s, player: [3, 2] };
  const r = act(lv, s, 'U');
  ok(r.state.status === 'caught' && r.state.caught.phase === 'guard' && r.state.caught.reason === 'guard-rotate', '7 暗いマスへ入り、見張りが向きを変えて見つかる（判定B）');
}
// 8 光っているマスへ入る → 判定Aで見つかる
{
  const lv = L(['.P...E', '......', '.....T'], [W([0, 1], ['R'])]);
  const r = act(lv, initialState(lv), 'D');
  ok(r.state.status === 'caught' && r.state.caught.phase === 'move' && r.state.caught.reason === 'walked-in', '8 光の中へ入ると walked-in');
}
// 9 無効な手は手数も時間も進めない
{
  const lv = L(['#P.BB.', '..B...', '..#..E', '.....T'], [P([[4, 2], [4, 3]], 0, 1)]);
  const s = initialState(lv);
  const tries = [['L', 'wall'], ['U', 'edge']];
  for (const [m, why] of tries) { const r = act(lv, s, m); ok(!r.valid && r.reason === why && r.state === s, `9 ${m} は ${why} で無効（状態はそのまま）`); }
  const s2 = { ...s, player: [2, 0] };
  ok(act(lv, s2, 'R').reason === 'stuck', '9 箱が2つ並ぶと押せない');
  ok(act(lv, s2, 'D').reason === 'stuck', '9 箱の先が壁なら押せない');
  const s3 = { ...s, player: [5, 1] };
  ok(act(lv, s3, 'D').reason === 'locked', '9 宝を持たずに出口へは入れない');
  const s4 = { ...s, player: [3, 2] };
  ok(act(lv, s4, 'R').reason === 'guard', '9 警備員のマスへは入れない');
}
// 10 宝を持って出口に入ると成功。その手で警備員は動かない
{
  const lv = L(['P.TE..', '......'], [P([[4, 1], [5, 1]], 0, 1)]);
  const r = replay(lv, 'RRR');
  ok(r.state.status === 'escaped' && r.state.steps === 3, '10 宝→出口で成功（3手）');
  const last = act(lv, r.history[2], 'R');
  ok(!last.events.some((e) => e.type === 'guard'), '10 成功した手では警備員が動かない');
}
// 11 光っている宝のマスに入ると、宝は取れるがその手で見つかる
{
  const lv = L(['.P...E', '...T..', '......'], [W([0, 1], ['R'])]);
  const s = { ...initialState(lv), player: [3, 0] };
  const r = act(lv, s, 'D');
  ok(r.state.treasure === true && r.state.status === 'caught', '11 光る宝を取った手で見つかる');
}
// 12 光は宝と警備員を通り抜け、壁・出口・箱で止まる
{
  const lv = L(['......', 'T..#..', '.....E', 'P.....'], [W([5, 1], ['L']), W([2, 3], ['R'])]);
  const s = initialState(lv);
  const L12 = lit(lv, s);
  ok(L12.has('4,1') && !L12.has('2,1') && !L12.has('0,1'), '12 壁 [3,1] で止まる');
  const lv2 = L(['T....E', '......', 'P.....'], [W([0, 1], ['R']), W([3, 1], ['R'])]);
  const L13 = lit(lv2, initialState(lv2));
  ok(L13.has('2,1') && L13.has('4,1') && L13.has('5,1'), '12 警備員 [3,1] の上も光は通る');
  const lv3 = L(['....T.', 'P....E'], [W([0, 0], ['R'])]);
  ok(lit(lv3, initialState(lv3)).has('4,0') && lit(lv3, initialState(lv3)).has('5,0'), '12 光は宝 [4,0] の上を通り、盤の端 [5,0] まで');
  const lv4 = L(['T.....', 'P.....', '.....E'], [W([5, 0], ['D'])]);
  ok(lit(lv4, initialState(lv4)).has('5,1') && !lit(lv4, initialState(lv4)).has('5,2'), '12 出口 [5,2] で光が止まる');
}
// 13 影の中で待てば、警備員が動いても見つからない
{
  const lv = L(['.....E', '..B.P.', '.....T'], [W([0, 1], ['R'])]);
  const r = replay(lv, '....');
  ok(r.state.status === 'play' && r.state.steps === 4, '13 影の中で4回待っても大丈夫');
}
// 14 同時に複数の光が当たったら、警備員（番号順）→レーザーの順で原因を選ぶ
{
  // 見張り1（[0,2]・上→右）と見張り2（[4,0]・左→下）が、同じ手で [4,2] を照らす
  const lv = L(['P.....', '......', '.....E', '.....T'], [W([0, 2], ['U', 'R']), W([4, 0], ['L', 'D'])]);
  const s = { ...initialState(lv), player: [4, 3] };
  const r = act(lv, s, 'U');
  ok(r.state.caught?.phase === 'guard' && r.state.caught.source.kind === 'guard' && r.state.caught.source.index === 0, '14 2人が同時に照らしたら、番号の小さい警備員1が原因');
}
// 15 星の境界
ok(starsFor(10, 10) === 3 && starsFor(10, 15) === 2 && starsFor(10, 16) === 1 && starsFor(25, 38) === 2 && starsFor(25, 39) === 1, '15 星：par=10 で 10→★3・15→★2・16→★1、par=25 で 38→★2・39→★1');
// 17 巡回の道は一直線に限る（L字は面データの検査で止める）
{
  let threw = false;
  try { L(['P....E', '......', '.....T'], [P([[1, 1], [2, 1], [2, 2]])]); } catch { threw = true; }
  ok(threw, '17 L字の道は読み込みで止まる');
}
// 16 詰みの検出
{
  const lv = L(['..P..E', '..B...', '......', '....T.'], [W([0, 2], ['R'])]);
  ok(canWin(lv, initialState(lv)) === 'alive', '16 最初は alive');
  const r = replay(lv, 'RDLL'); // 箱を左の端へ押しやる
  ok(r.state.status === 'play' && canWin(lv, r.state) === 'dead', '16 箱を左の壁際へ押しやると dead');
}

if (bad) { console.log(`\n${bad} 件が外れた`); process.exit(1); }
console.log('\nルールの境界はすべて想定どおり');
