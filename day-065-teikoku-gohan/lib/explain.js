// 結果の文・場所の呼び方・共有文。DOMに触らない（単体テストで文面を固定する）。
// 原因は sim の timeline から読む：waited>0 の区間が「待たされた場所」、blockedBy が相手の列車。
import { KINDS, allPaths, sectionsOf } from './sim.js';
import { STEPS, dishName, ingredientIcon, stepIcons } from './recipes.js';
import { isBranch, stepsOfPath } from './plan.js';

export function orderOfTrain(level, trainId) {
  const def = level.trains.find((t) => t.id === trainId);
  return level.orders.find((o) => o.id === def.order);
}

export function orderDish(order) {
  return dishName(order.ingredient, order.steps);
}

// 列車は「運ぶ注文の料理名」で呼ぶ（画面のカードも「→料理名」）
export function trainDish(level, trainId) {
  return orderDish(orderOfTrain(level, trainId));
}

export function trainIcon(level, trainId) {
  return ingredientIcon(level.trains.find((t) => t.id === trainId).ingredient);
}

export function stationTime(level, id) {
  const n = level.nodes[id];
  return n.time ?? KINDS[n.kind].time;
}

/* 焦げた瞬間（分）＝仕上がり＋猶予＋1。sim は駅を出る分に「猶予を超えて待ったか」で焦げを決めるので、
   焦げる組み方で最も早く出られるのがこの分。再生の「焦げた！」・音・運行図の✖・文の時刻を、この分にそろえる */
export function burnMinute(level, seg) {
  return seg.ready + (level.burnGrace ?? 1) + 1;
}

/* 出庫線から、一度も待たずにその駅に着くまでの分（reach）と、その駅を通って配膳駅まで行く道のり（through）。
   どちらも一番短い経路で。同じ種類の駅の「近」「遠」を決める */
export function stationDistance(level, id) {
  let reach = Infinity;
  let through = Infinity;
  for (const path of allPaths(level)) {
    if (!path.includes(id)) continue;
    const secs = sectionsOf(level, path);
    const at = secs.findIndex((s) => s.type === 'station' && s.id === id);
    reach = Math.min(reach, secs.slice(0, at).reduce((sum, s) => sum + s.dur, 0));
    through = Math.min(through, secs.reduce((sum, s) => sum + s.dur, 0));
  }
  return { reach, through };
}

/* 同じ種類の駅が2つ以上ある面では、名前に見分けを足す。
   調理時間が全部ちがえば時間（「3分」）。同じ時間があれば、出庫線からの道のりが短い順に「近」「遠」（3つなら「近」「中」「遠」）。
   道のりが同じなら、その駅を通って配膳駅まで行く道のりで比べる。
   地図の上下では呼ばない（運行図の行の上下や、配膳への入り口の上下と紛らわしかった）。 */
const qualifierCache = new WeakMap();
export function stationQualifiers(level) {
  if (qualifierCache.has(level)) return qualifierCache.get(level);
  const groups = {};
  for (const [id, n] of Object.entries(level.nodes)) {
    if (KINDS[n.kind]) (groups[n.kind] ||= []).push(id);
  }
  const out = {};
  for (const ids of Object.values(groups)) {
    if (ids.length === 1) {
      out[ids[0]] = '';
      continue;
    }
    const times = ids.map((id) => stationTime(level, id));
    if (new Set(times).size === ids.length) {
      for (const id of ids) out[id] = `${stationTime(level, id)}分`;
      continue;
    }
    const d = Object.fromEntries(ids.map((id) => [id, stationDistance(level, id)]));
    const sorted = [...ids].sort((a, b) => d[a].reach - d[b].reach || d[a].through - d[b].through);
    const words = sorted.length === 2 ? ['近', '遠'] : sorted.length === 3 ? ['近', '中', '遠'] : sorted.map((_, i) => `近い順に${i + 1}`);
    sorted.forEach((id, i) => {
      out[id] = words[i];
    });
  }
  qualifierCache.set(level, out);
  return out;
}

// 駅の名前（例：🔥焼く駅・🔥焼く駅（上））。icon:false で絵文字なし、suffix:'' で「駅」なし
export function stationName(level, id, { icon = true, suffix = '駅' } = {}) {
  const n = level.nodes[id];
  if (KINDS[n.kind]) {
    const q = stationQualifiers(level)[id];
    return `${icon ? STEPS[n.kind].icon : ''}${STEPS[n.kind].label}${suffix}${q ? `（${q}）` : ''}`;
  }
  if (n.kind === 'serve') return '配膳駅';
  if (n.kind === 'yard') return '車庫';
  return isBranch(level, id) ? '分岐' : '合流';
}

/* 待たされた場所の呼び方（1つの規則。運行図の行と同じ分け方）。
   出発前の車庫は「車庫」、出庫線は「出庫線」、駅は駅の名前。
   それ以外の線路は、その列車が次に着く駅の名前に「の手前」（次に駅が無ければ「配膳の手前」）。
   分岐・合流の名前は使わない（結果の文の「合流の手前」と運行図の「配膳の手前」が同じ所を指していて、紛らわしかった）。
   timeline はその列車の区間の列（sim.timeline[列車]）。seg が線路のときに、次の駅を探すのに使う */
export function placeName(level, seg, timeline) {
  if (seg.type === 'yard') return '車庫';
  if (seg.type === 'station') return stationName(level, seg.id);
  const e = level.edges.find((x) => x.id === seg.id);
  if (level.nodes[e.from].kind === 'yard') return '出庫線';
  if (KINDS[level.nodes[e.to].kind]) return `${stationName(level, e.to)}の手前`;
  const i = timeline.findIndex((s) => s.key === seg.key);
  const next = timeline.slice(i + 1).find((s) => s.type === 'station');
  return next ? `${stationName(level, next.id)}の手前` : '配膳の手前';
}

function departureIndex(sim, trainId) {
  return sim.results.findIndex((r) => r.train === trainId);
}

/* 出発前に車庫で待った分。sim は区間に入ってからしか記録しないので、
   出発の予定（k×headway 分）と実際に出庫線へ入った分の差から求める。
   相手は、その予定の分に出庫線にいた列車（出庫線へは出発順に入るので、必ず先に出た列車） */
export function yardWait(level, sim, trainId) {
  const k = departureIndex(sim, trainId);
  const planned = k * (level.headway ?? 1);
  const first = sim.timeline[trainId][0];
  const waited = first.enter - planned;
  if (waited <= 0) return null;
  let blockedBy = null;
  for (const [id, segs] of Object.entries(sim.timeline)) {
    const s = segs[0];
    if (id !== trainId && s.key === first.key && s.enter <= planned && planned < s.leave) blockedBy = id;
  }
  return { type: 'yard', id: null, key: 'yard', enter: planned, ready: planned, leave: first.enter, waited, blockedBy };
}

// 道のり＝経路の区間（線路と駅）の所要の合計。一度も待たされなければ、出発の分＋道のり で着く
export function routeMinutes(level, path) {
  return sectionsOf(level, path).reduce((sum, s) => sum + s.dur, 0);
}

// 同じ料理を作る経路（通る駅の工程の並びが注文と同じもの）のうち、いちばん短い道のり
export function shortestRouteForDish(level, trainId) {
  const order = orderOfTrain(level, trainId);
  const want = order.steps.join('>');
  let best = Infinity;
  for (const path of allPaths(level)) {
    if (stepsOfPath(level, path).join('>') === want) best = Math.min(best, routeMinutes(level, path));
  }
  return best;
}

// 待たされた区間の一覧（時間順）。車庫での待ちも含む
export function waitsOf(level, sim, trainId) {
  const yard = yardWait(level, sim, trainId);
  const segs = sim.timeline[trainId].filter((s) => s.waited > 0);
  return yard ? [yard, ...segs] : segs;
}

/* 待たせた相手を全部、分数つきで（[{ train, minutes }]、最初に待たせた順）。sim は「最初に止められた相手」しか残さないので
   timeline から求める。待った分 m（ready ≦ m ＜ leave）ごとに、行きたい区間（次の区間。車庫での待ちなら出庫線）に
   その分いた列車（enter ≦ m ＜ leave）を数える。sim はその分の動きを全部終えても次の区間がふさがっているときだけ待たせるので、
   どの分にも相手がちょうど1両いて、分数の合計は待った分と一致する（tests/explain.test.mjs が全計画で確かめる）。
   合流で後から来た列車に先を越されたときも、その列車が相手に入る（同じ分に入りたい列車は、先に出発した列車が先に進む） */
export function blockersOf(level, sim, trainId, wait) {
  const segs = sim.timeline[trainId];
  const want = wait.type === 'yard' ? segs[0].key : segs[segs.indexOf(wait) + 1]?.key;
  const out = [];
  for (let m = wait.ready; m < wait.leave; m++) {
    let who = null;
    for (const [id, other] of Object.entries(sim.timeline)) {
      if (id !== trainId && other.some((x) => x.key === want && x.enter <= m && m < x.leave)) who = id;
    }
    if (!who) continue;
    const hit = out.find((b) => b.train === who);
    if (hit) hit.minutes += 1;
    else out.push({ train: who, minutes: 1 });
  }
  return out;
}

/* 待たされた場所ごとにまとめる（呼び方が同じ場所の待ちは足す。最初に待った順）。
   blockers はその場所で待たせた相手と分数（合計は waited と同じ）。blockedBy はいちばん長く待たせた相手 */
export function waitPlaces(level, sim, trainId) {
  const out = [];
  for (const w of waitsOf(level, sim, trainId)) {
    const name = placeName(level, w, sim.timeline[trainId]);
    let place = out.find((x) => x.name === name);
    if (!place) {
      place = { name, waited: 0, blockers: [], blockedBy: null };
      out.push(place);
    }
    place.waited += w.waited;
    for (const b of blockersOf(level, sim, trainId, w)) {
      const hit = place.blockers.find((x) => x.train === b.train);
      if (hit) hit.minutes += b.minutes;
      else place.blockers.push({ ...b });
    }
    place.blockedBy = place.blockers.reduce((a, b) => (!a || b.minutes > a.minutes ? b : a), null)?.train ?? null;
  }
  return out;
}

// 「『お刺身』に1分、『ひと口ステーキ』に2分」
export function blockersWords(level, blockers) {
  return blockers.map((b) => `『${trainDish(level, b.train)}』に${b.minutes}分`).join('、');
}

const KIND_WORD = { burnt: '焦げた', wrong: '工程違い', late: '遅れた' };
const KIND_SHORT = { burnt: '焦げた', wrong: '工程違い' };

function orderSteps(order) {
  return `${stepIcons(order.steps)}${order.steps.length === 1 ? ' だけ' : ''}`;
}

// 列車ひとつ分の結果。kind は 'ok' | 'burnt' | 'wrong' | 'late'（1列車につき1つ。焦げ＞工程違い＞遅れ）
export function explainTrain(level, sim, trainId) {
  const result = sim.results.find((r) => r.train === trainId);
  const order = orderOfTrain(level, trainId);
  const dish = orderDish(order);
  const problem = sim.problems.find((p) => p.train === trainId);
  const base = { train: trainId, order: order.id, dish, icon: ingredientIcon(order.ingredient), arrivedAt: result.arrivedAt, due: order.due };
  if (!problem) {
    return { ...base, ok: true, kind: 'ok', text: `${dish} ${result.arrivedAt}分（締切${order.due}分）`, short: `${result.arrivedAt}分` };
  }
  if (problem.kind === 'burnt') {
    const seg = sim.timeline[trainId].find((s) => s.type === 'station' && s.id === problem.at && s.waited > (level.burnGrace ?? 1));
    let text = `${stationName(level, problem.at)}で、仕上がってから${seg.waited}分待たされて焦げた`;
    if (seg.blockedBy) text += `。出口を『${trainDish(level, seg.blockedBy)}』の列車がふさいでいた`;
    return { ...base, ok: false, kind: 'burnt', text, short: KIND_SHORT.burnt, at: problem.at, waited: seg.waited, blockedBy: seg.blockedBy };
  }
  if (problem.kind === 'wrong') {
    const made = result.steps;
    const text = made.length
      ? `通った駅は ${stepIcons(made)}。注文は ${orderSteps(order)}`
      : `どの駅も通らなかった。注文は ${orderSteps(order)}`;
    return { ...base, ok: false, kind: 'wrong', text, short: KIND_SHORT.wrong, made };
  }
  /* 遅れ：待ちが原因か、道のりと出発順が原因かを分けて出す。
     B＝到着−待ちの合計（区間での待ち＋車庫での待ち）＝一度も待たされなければ着いた分＝出発の分＋道のり。
     B が締切以内なら待ちだけが原因。B が締切を過ぎるなら、待たなくても間に合わない（道のりか出発順を変える） */
  const by = problem.by;
  const due = order.due;
  const places = waitPlaces(level, sim, trainId);
  const total = places.reduce((sum, w) => sum + w.waited, 0);
  const B = result.arrivedAt - total;
  const route = sim.timeline[trainId].reduce((sum, s) => sum + (s.ready - s.enter), 0);
  const k = departureIndex(sim, trainId);
  const start = k * (level.headway ?? 1);
  const shortest = shortestRouteForDish(level, trainId);
  const late = { ...base, ok: false, kind: 'late', short: `${by}分遅れ`, by, withoutWaits: B, route, shortest };
  let text;
  if (!places.length) {
    text = `${dish}が${by}分遅れ。待たされてはいない。出発が${k + 1}番目（${start}分後）で、道のりが${route}分かかり、${B}分に着く（締切${due}分）`;
    Object.assign(late, { waited: 0, blockedBy: null });
  } else {
    // 合計していちばん長く待った場所と、そこで待たせた相手を全員（分数つき）。同じ長さなら先の方
    const main = places.reduce((a, b) => (b.waited > a.waited ? b : a));
    text = `${dish}が${by}分遅れ。${main.name}で${blockersWords(level, main.blockers)}待たされた`;
    if (main.blockers.length > 1) text += `（合計${main.waited}分）`;
    if (total > main.waited) text += `。ほかでも${total - main.waited}分待った`;
    text += B <= due ? `。待たされなければ${B}分に着いた` : `。待たされなくても${B}分かかる（締切${due}分）`;
    Object.assign(late, { place: main.name, waited: main.waited, blockedBy: main.blockedBy, blockers: main.blockers });
  }
  /* 一番短い道の一言は、それで間に合うときだけ（待たずに、出発の分＋一番短い道のり ≦ 締切）。
     間に合わないのに出すと、道を変えても同じ遅れのままになる（体験評価R3・面6） */
  if (shortest < route && start + shortest <= due) text += `。同じ料理を作る道で一番短いのは道のり${shortest}分`;
  return { ...late, text };
}

/* ★1・★2（最短ではないクリア）で、時間をどこで失ったか。いちばん長く待った場所（呼び方が同じ場所の待ちは足す） */
export function timeLossLine(level, sim) {
  const head = `最短は${level.par}分。あと${sim.finish - level.par}分縮められる。`;
  let worst = null;
  for (const r of sim.results) {
    for (const p of waitPlaces(level, sim, r.train)) if (!worst || p.waited > worst.waited) worst = { ...p, train: r.train };
  }
  return worst
    ? `${head}いちばん待たされたのは『${trainDish(level, worst.train)}』（${worst.name}で${worst.waited}分）`
    : `${head}待たされた列車は無い。出発順か道のりを変えると縮まる`;
}

// 出発順に並べた全列車の結果
export function explainAll(level, sim) {
  return sim.results.map((r) => explainTrain(level, sim, r.train));
}

// 星の数（見本のダイヤでのクリアは★1まで）
export function starsFor(level, sim, starsOfFn, { usedSample = false } = {}) {
  const s = starsOfFn(level, sim);
  return usedSample && s > 0 ? 1 : s;
}

export function starsWords(stars) {
  return stars > 0 ? `星${stars}つ` : '失敗';
}

// 結果シートの一行
export function headline(level, sim, { stars, usedSample = false }) {
  if (sim.cleared) {
    if (usedSample) return `完食！ ${sim.finish}分 見本のダイヤなので★1`;
    if (stars === 3) return `完食！ ${sim.finish}分 最短ダイヤ！`;
    return `完食！ ${sim.finish}分 あと${sim.finish - level.par}分で★★★`;
  }
  const total = level.trains.length;
  const problems = sim.problems;
  if (total === 1) {
    const p = problems[0];
    return `${trainDish(level, p.train)}が${KIND_WORD[p.kind]}`;
  }
  const count = { burnt: 0, wrong: 0, late: 0 };
  for (const p of problems) count[p.kind] += 1;
  const kinds = Object.keys(count).filter((k) => count[k] > 0);
  if (kinds.length === 1) return `${total}つの注文のうち${problems.length}つが${KIND_WORD[kinds[0]]}`;
  const parts = [['burnt', '焦げ'], ['wrong', '工程違い'], ['late', '遅れ']]
    .filter(([k]) => count[k] > 0)
    .map(([k, w]) => `${w}${count[k]}`);
  return `${total}つの注文のうち${problems.length}つが失敗（${parts.join('・')}）`;
}

export function shareText(level, stars, finish) {
  return `定刻ごはん Day65｜面${level.no}「${level.title}」★${stars} ${finish}分で完食 #100日チャレンジ #個人開発`;
}

// 分岐の切替ボタンの名前（例：分岐 焼く駅へ）。出口の先を、その列車の選択どおりにたどって最初の駅か配膳駅で呼ぶ
export function exitDestination(level, choices, fromNode, toNode) {
  let n = toNode;
  const seen = new Set([fromNode]);
  while (!seen.has(n)) {
    seen.add(n);
    const kind = level.nodes[n].kind;
    if (KINDS[kind] || kind === 'serve') return n;
    const outs = level.edges.filter((e) => e.from === n);
    const pick = outs.length > 1 && choices[n] && outs.some((e) => e.to === choices[n]) ? choices[n] : outs[0].to;
    n = pick;
  }
  return n;
}

export function branchLabel(level, choices, node, exitTo) {
  const dest = exitDestination(level, choices, node, exitTo);
  return `分岐 ${stationName(level, dest, { icon: false })}へ`;
}
