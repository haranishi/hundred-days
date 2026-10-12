// 定刻ごはん 基準シミュレーター（決定的・DOM非依存）。
// これが「ルールの正」。day-065-teikoku-gohan/lib/sim.js はこの挙動と1tickも違えないこと。
// 時間の単位は「分」(tick)。整数のみ。乱数なし。

export const KINDS = {
  cut:    { label: '切る', icon: '🔪', time: 2, hot: false },
  grill:  { label: '焼く', icon: '🔥', time: 3, hot: true },
  simmer: { label: '煮る', icon: '🍲', time: 4, hot: true },
};

const MAX_TICKS = 120; // 無限ループ防止（DAGなので通常は30分以内に終わる）

export function yardOf(level) {
  return Object.keys(level.nodes).find((k) => level.nodes[k].kind === 'yard');
}

export function edgeOf(level, a, b) {
  const e = level.edges.find((x) => x.from === a && x.to === b);
  if (!e) throw new Error(`線路がありません ${a}->${b}`);
  return e;
}

// 出庫線から配膳駅までの全経路（DAG前提。分岐は edges 配列の順に並ぶ）
export function allPaths(level) {
  const out = [];
  const walk = (n, path) => {
    if (level.nodes[n].kind === 'serve') { out.push(path); return; }
    for (const e of level.edges.filter((x) => x.from === n)) walk(e.to, [...path, e.to]);
  };
  walk(yardOf(level), [yardOf(level)]);
  return out;
}

// 分岐ごとの選択 {分岐ノードID: 次のノードID} から経路を作る。未指定の分岐は edges 配列の先頭の出口。
export function buildPath(level, choices = {}) {
  let n = yardOf(level);
  const path = [n];
  while (level.nodes[n].kind !== 'serve') {
    const outs = level.edges.filter((e) => e.from === n);
    const pick = outs.length > 1 && choices[n] && outs.some((e) => e.to === choices[n]) ? choices[n] : outs[0].to;
    path.push(pick);
    n = pick;
  }
  return path;
}

// 経路 → 区間の列。線路(edge)は len 分、駅(station)は調理時間ぶん「占有」する。
export function sectionsOf(level, path) {
  const sections = [];
  for (let i = 0; i < path.length - 1; i++) {
    const e = edgeOf(level, path[i], path[i + 1]);
    sections.push({ type: 'edge', id: e.id, key: 'e:' + e.id, dur: e.len });
    const n = level.nodes[path[i + 1]];
    if (KINDS[n.kind]) {
      sections.push({ type: 'station', id: path[i + 1], key: 's:' + path[i + 1], kind: n.kind, dur: n.time ?? KINDS[n.kind].time, hot: KINDS[n.kind].hot });
    }
  }
  return sections;
}

// plan = { order: [列車ID...（出発順）], paths: { 列車ID: [ノードID...] } }
// 戻り値の timeline[列車ID] = [{key,type,id,kind?,enter,ready,leave,waited}]  (アニメと運行図に使う)
export function simulate(level, plan) {
  const headway = level.headway ?? 1;      // k番目の列車は k*headway 分以降に出庫線へ入れる
  const grace = level.burnGrace ?? 1;      // 火の駅で仕上がってから、何分まで待っても焦げないか
  const trains = plan.order.map((id, k) => {
    const def = level.trains.find((t) => t.id === id);
    return { id, k, ingredient: def.ingredient, sections: sectionsOf(level, plan.paths[id]), pos: -1, readyAt: null,
      steps: [], burnt: false, burntAt: null, arrivedAt: null, timeline: [], waits: [] };
  });
  const occ = new Map(); // 区間 key -> 列車ID（1区間に1列車）
  let t = 0;
  for (; t <= MAX_TICKS; t++) {
    const claims = new Map(); // この分に「入りたかった」最も優先度の高い列車(k)
    let moved = true;
    while (moved) {
      moved = false;
      for (const tr of trains) { // trains は出発順（優先順）に並んでいる
        if (tr.arrivedAt !== null) continue;
        if (tr.pos === -1) { if (t < tr.k * headway) continue; }
        else if (t < tr.readyAt) continue;
        const next = tr.sections[tr.pos + 1];
        if (!next) { // 最終区間を終えた → 配膳駅に到着（配膳駅は何台でも入れる）
          const cur = tr.timeline[tr.timeline.length - 1];
          cur.leave = t; cur.waited = t - cur.ready;
          tr.arrivedAt = t; occ.delete(tr.sections[tr.pos].key);
          moved = true; continue;
        }
        const claimer = claims.get(next.key);
        const free = !occ.has(next.key);
        if (free && (claimer === undefined || claimer >= tr.k)) {
          if (tr.pos >= 0) {
            const cur = tr.sections[tr.pos], seg = tr.timeline[tr.timeline.length - 1];
            occ.delete(cur.key);
            seg.leave = t; seg.waited = t - seg.ready;
            if (cur.type === 'station') {
              tr.steps.push(cur.kind);
              if (cur.hot && seg.waited > grace) { tr.burnt = true; tr.burntAt = cur.id; }
            }
          }
          tr.pos += 1; occ.set(next.key, tr.id); tr.readyAt = t + next.dur;
          tr.timeline.push({ key: next.key, type: next.type, id: next.id, kind: next.kind ?? null, enter: t, ready: t + next.dur, leave: null, waited: 0, blockedBy: null });
          moved = true;
        } else {
          if (claimer === undefined || tr.k < claimer) claims.set(next.key, tr.k);
          const seg = tr.timeline[tr.timeline.length - 1];
          if (seg && seg.blockedBy === null && occ.has(next.key)) seg.blockedBy = occ.get(next.key); // 最初に止められた相手
        }
      }
    }
    if (trains.every((x) => x.arrivedAt !== null)) break;
  }
  const problems = [];
  const results = trains.map((tr) => {
    const def = level.trains.find((x) => x.id === tr.id);
    const order = level.orders.find((o) => o.id === def.order);
    const stepsOk = tr.steps.join() === order.steps.join();
    const late = tr.arrivedAt > order.due;
    if (tr.burnt) problems.push({ train: tr.id, order: order.id, kind: 'burnt', at: tr.burntAt });
    else if (!stepsOk) problems.push({ train: tr.id, order: order.id, kind: 'wrong', made: tr.steps });
    else if (late) problems.push({ train: tr.id, order: order.id, kind: 'late', by: tr.arrivedAt - order.due });
    return { train: tr.id, order: order.id, arrivedAt: tr.arrivedAt, steps: tr.steps, burnt: tr.burnt, burntAt: tr.burntAt, stepsOk, late };
  });
  const finish = Math.max(...trains.map((x) => x.arrivedAt ?? Infinity));
  const timeline = Object.fromEntries(trains.map((x) => [x.id, x.timeline]));
  return { cleared: problems.length === 0, problems, finish, results, timeline };
}

// 星: ★★★=par以内、★★=par+1以内、★=クリア。失敗は 0。
export function starsOf(level, result) {
  if (!result.cleared) return 0;
  if (result.finish <= level.par) return 3;
  if (result.finish <= level.par + 1) return 2;
  return 1;
}
