/* 運行図。横軸が分、行は「出庫線」「使われた駅（左から）」「配膳の手前の線路」。
   列車がその区間にいた時間を列車の色の帯で描き、仕上がり（線路なら走り終わり）のあとの待ちは斜線、焦げた瞬間に✖。
   行のあいだの線路を走っている時間は、列車の色の細い斜め線で前の帯と次の帯を結ぶ（時間と場所の図）。
   行のあいだの線路で待った時間は、次の行の帯の下に点線（結果の文の「〇〇の手前」と同じ範囲）。
   どの列車も、出発から配膳まで途切れずにたどれる。
   文字をくっきり出すため、viewBox の幅を入れ物の幅（px）と同じにして描く（幅が変わったら描き直す）。 */
import { s } from './dom.js';
import { KINDS } from './sim.js';
import { stationName, trainDish, waitPlaces, yardWait, burnMinute, stationDistance } from './explain.js';

/* 配膳駅へ入る線路が2本以上使われた面では、駅と同じ決め方で見分ける：長さが全部ちがえば長さ（「2分」・短い順）、
   そうでなければ出庫線からの道のり（線路の始まりに一度も待たずに着く分）が短い順に「近」「遠」。
   返すのは行に並べる順の [{ edge, q }] */
function serveRowsOf(level, edges) {
  if (edges.length < 2) return edges.map((edge) => ({ edge, q: '' }));
  if (new Set(edges.map((e) => e.len)).size === edges.length) {
    return [...edges].sort((a, b) => a.len - b.len).map((edge) => ({ edge, q: `${edge.len}分` }));
  }
  const start = (e) => {
    const n = level.nodes[e.from];
    if (n.kind === 'yard') return 0;
    if (KINDS[n.kind]) return stationDistance(level, e.from).reach + (n.time ?? KINDS[n.kind].time);
    // 分岐・合流から出る線路：そこへ入る線路の始まり＋長さの一番短いもの
    return Math.min(...level.edges.filter((x) => x.to === e.from).map((x) => start(x) + x.len));
  };
  const sorted = [...edges].sort((a, b) => start(a) - start(b));
  const words = sorted.length === 2 ? ['近', '遠'] : sorted.length === 3 ? ['近', '中', '遠'] : sorted.map((_, i) => `近い順に${i + 1}`);
  return sorted.map((edge, i) => ({ edge, q: words[i] }));
}

export function chartRows(level, sim) {
  const segs = Object.values(sim.timeline).flat();
  const used = new Set(segs.map((x) => x.key));
  const yardEdge = level.edges.find((e) => level.nodes[e.from].kind === 'yard');
  const serveId = Object.keys(level.nodes).find((n) => level.nodes[n].kind === 'serve');
  const rows = [{ key: `e:${yardEdge.id}`, label: '出庫線' }];
  const pos = (id) => level.nodes[id].pos;
  Object.keys(level.nodes)
    .filter((id) => KINDS[level.nodes[id].kind] && used.has(`s:${id}`))
    .sort((a, b) => pos(a)[0] - pos(b)[0] || pos(a)[1] - pos(b)[1])
    .forEach((id) => rows.push({ key: `s:${id}`, label: stationName(level, id, { suffix: '' }), station: id }));
  const serveEdges = level.edges.filter((e) => e.to === serveId && used.has(`e:${e.id}`));
  for (const { edge, q } of serveRowsOf(level, serveEdges)) {
    rows.push({ key: `e:${edge.id}`, label: q ? `配膳の手前（${q}）` : '配膳の手前' });
  }
  return rows;
}

/* その行の区間に入る前に、手前で待った時間の一覧（出庫線の行なら車庫での待ち）。
   前の行を出てからこの行に入るまでの、行に無い線路での待ちを全部。結果の文の「〇〇の手前」と同じ範囲になる */
function approachWaits(level, sim, trainId, seg, rowKeys) {
  const segs = sim.timeline[trainId];
  const i = segs.indexOf(seg);
  if (i === 0) {
    const y = yardWait(level, sim, trainId);
    return y ? [{ from: y.enter, to: y.leave, waited: y.waited, where: '車庫' }] : [];
  }
  const out = [];
  for (let j = i - 1; j >= 0 && !rowKeys.has(segs[j].key); j--) {
    const prev = segs[j];
    if (prev.waited > 0) out.unshift({ from: prev.ready, to: prev.leave, waited: prev.waited, where: '手前' });
  }
  return out;
}

function burntSeg(level, sim, trainId) {
  const r = sim.results.find((x) => x.train === trainId);
  if (!r.burnt) return null;
  return sim.timeline[trainId].find((x) => x.type === 'station' && x.id === r.burntAt && x.waited > (level.burnGrace ?? 1));
}

// 運行図を文で（要約と、行ごとの中身）
export function chartText(level, sim, rows = chartRows(level, sim)) {
  const rowKeys = new Set(rows.map((r) => r.key));
  const items = rows.map((row) => {
    const parts = [];
    for (const r of sim.results) {
      const burnt = burntSeg(level, sim, r.train);
      for (const seg of sim.timeline[r.train]) {
        if (seg.key !== row.key) continue;
        let t = `${trainDish(level, r.train)} ${seg.enter}〜${seg.leave}分`;
        const before = approachWaits(level, sim, r.train, seg, rowKeys);
        if (before.length) t += `（その前に${before[0].where}で${before.reduce((sum, w) => sum + w.waited, 0)}分待ち）`;
        if (seg.waited > 0) t += `（うち${seg.waited}分は先が空くのを待った）`;
        if (burnt === seg) t += `・${burnMinute(level, seg)}分に焦げた`;
        parts.push({ enter: seg.enter, text: t });
      }
    }
    parts.sort((a, b) => a.enter - b.enter);
    return { label: row.label, text: parts.length ? parts.map((p) => p.text).join('、') : '使われなかった' };
  });
  // いちばん長い待ち（結果の文と同じく、呼び方が同じ場所の待ちは足す）
  let longest = null;
  for (const r of sim.results) {
    for (const w of waitPlaces(level, sim, r.train)) {
      if (!longest || w.waited > longest.waited) longest = { ...w, train: r.train };
    }
  }
  let summary = `運行図。横が分（0〜${sim.finish}分）。行は${rows.map((x) => x.label).join('・')}。`;
  summary += longest
    ? `いちばん長い待ちは${longest.name}の${longest.waited}分（${trainDish(level, longest.train)}）。`
    : '待ちはなし。';
  const burnt = sim.results.filter((r) => r.burnt);
  if (burnt.length) {
    summary += `焦げたのは${burnt.map((r) => `${stationName(level, r.burntAt)}（${trainDish(level, r.train)}・${burnMinute(level, burntSeg(level, sim, r.train))}分）`).join('・')}。`;
  }
  return { summary, items, traces: chartTrace(level, sim, rows) };
}

/* 列車ごとの道のり（文）。例：焼きにんじん：出庫線 0〜1分 → 走る 1〜3分 → 🔥焼く 3〜6分 → 配膳の手前 6〜7分 → 7分に着いた
   行に無い線路は「走る」にまとめ、待ちがあれば（うちN分待ち）を付ける。出発前に車庫で待った分は先頭に出す。焦げた駅には焦げた分を付ける */
export function chartTrace(level, sim, rows = chartRows(level, sim)) {
  const labelOf = new Map(rows.map((r) => [r.key, r.label]));
  return sim.results.map((r) => {
    const parts = [];
    const burnt = burntSeg(level, sim, r.train);
    const yard = yardWait(level, sim, r.train);
    if (yard) parts.push(`車庫で待つ ${yard.enter}〜${yard.leave}分`);
    let run = null;
    const flush = () => {
      if (!run) return;
      parts.push(`走る ${run.from}〜${run.to}分${run.waited ? `（うち${run.waited}分待ち）` : ''}`);
      run = null;
    };
    for (const seg of sim.timeline[r.train]) {
      if (labelOf.has(seg.key)) {
        flush();
        parts.push(`${labelOf.get(seg.key)} ${seg.enter}〜${seg.leave}分${seg.waited ? `（うち${seg.waited}分待ち）` : ''}${burnt === seg ? `・${burnMinute(level, seg)}分に焦げた` : ''}`);
      } else {
        run = run ? { ...run, to: seg.leave, waited: run.waited + seg.waited } : { from: seg.enter, to: seg.leave, waited: seg.waited };
      }
    }
    flush();
    parts.push(`${r.arrivedAt}分に着いた`);
    return { train: r.train, label: trainDish(level, r.train), text: parts.join(' → ') };
  });
}

export function renderChart(level, sim, width) {
  const rows = chartRows(level, sim);
  const { summary } = chartText(level, sim, rows);
  const W = Math.max(240, Math.round(width));
  // 行の名前の幅（12pxの文字：全角12・半角の数字7・絵文字15の見積もり）。いちばん長い名前が入るだけ取る（幅の45%まで）
  const textW = (t) => [...t].reduce((sum, c) => sum + (/[\x20-\x7e]/.test(c) ? 7 : c.codePointAt(0) > 0x2fff && c.codePointAt(0) < 0x1f000 ? 12 : 15), 0);
  const labelW = Math.min(Math.round(W * 0.45), Math.max(Math.min(118, Math.round(W * 0.36)), Math.max(...rows.map((r) => textW(r.label))) + 14));
  const padR = 12;
  const axisH = 22;
  const rowH = 26;
  const barH = 14;
  const H = axisH + rows.length * rowH + 4;
  const maxT = Math.max(1, sim.finish);
  const plotW = W - labelW - padR;
  const x = (t) => labelW + (t / maxT) * plotW;
  const r2 = (v) => Math.round(v * 10) / 10;
  const NO_R = 6.5; // 番号の丸の半径（帯の高さ14pxに収まる）
  const NO_MIN_W = NO_R * 2 + 4; // 番号の丸を帯の中に置ける、いちばん細い帯の幅（左右に2pxずつ）
  const departNo = new Map(sim.results.map((r, i) => [r.train, i + 1])); // sim.results は出発順

  const svg = s('svg', { class: 'chart__svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': summary });
  const defs = s('defs');
  for (const r of sim.results) {
    defs.append(s('pattern', { id: `hatch-${r.train}`, class: `tc-${r.train}`, patternUnits: 'userSpaceOnUse', width: 5, height: 5, patternTransform: 'rotate(45)' },
      s('rect', { class: 'hatch__bg', width: 5, height: 5 }),
      s('rect', { class: 'hatch__fg', width: 2.2, height: 5 })));
  }
  svg.append(defs);

  // 目盛り：1分ごとの細い線、5分ごと（短いときは2分ごと）に数字
  const step = maxT <= 10 ? 2 : 5;
  const grid = s('g', { class: 'chart__grid' });
  /* 最後（完食の分）は「23分」と右寄せで出す。その手前の目盛りの数字と重なるときは、手前の数字を省く。
     重なりは文字の幅の見積もりで判定する（11pxの数字1つ＝7px・「分」＝12px・すき間6px。実際より少し大きめ） */
  const DIGIT = 7;
  const UNIT = 12;
  const GAP = 6;
  const endLeft = x(maxT) - (String(maxT).length * DIGIT + UNIT);
  for (let t = 0; t <= maxT; t++) {
    const major = t % step === 0 || t === maxT;
    grid.append(s('line', { class: major ? 'grid grid--major' : 'grid', x1: r2(x(t)), y1: axisH - 4, x2: r2(x(t)), y2: H - 2 }));
    if (t === maxT) grid.append(s('text', { class: 'chart__tick chart__tick--end', x: r2(x(t)), y: 12, text: `${t}分` }));
    else if (t % step === 0 && x(t) + (String(t).length * DIGIT) / 2 + GAP <= endLeft) {
      grid.append(s('text', { class: 'chart__tick', x: r2(x(t)), y: 12, text: `${t}` }));
    }
  }
  svg.append(grid);

  /* 行から行へ移るところを、列車の色の細い線で結ぶ（帯より下に描く）。
     あいだの線路で待ったときは、次の行の点線（待ち）の始まりへ結び、点線と点線のあいだ・最後の点線から帯までも細い線でつなぐ */
  const rowIndex = new Map(rows.map((row, i) => [row.key, i]));
  const center = (i) => axisH + i * rowH + rowH / 2;
  const dotY = (i) => axisH + i * rowH + (rowH - barH) / 2 + barH + 3.5;
  const runs = s('g', { class: 'chart__runs' });
  const runLine = (train, t1, y1, t2, y2) => runs.append(s('line', { class: `run-line tc-${train}`, x1: r2(x(t1)), y1: r2(y1), x2: r2(x(t2)), y2: r2(y2) }));
  for (const r of sim.results) {
    let prevVisit = null;
    for (const seg of sim.timeline[r.train]) {
      if (!rowIndex.has(seg.key)) continue;
      const i = rowIndex.get(seg.key);
      if (prevVisit) {
        const waits = approachWaits(level, sim, r.train, seg, rowIndex);
        if (!waits.length) {
          runLine(r.train, prevVisit.seg.leave, center(prevVisit.i), seg.enter, center(i));
        } else {
          runLine(r.train, prevVisit.seg.leave, center(prevVisit.i), waits[0].from, dotY(i));
          for (let k = 1; k < waits.length; k++) if (waits[k].from > waits[k - 1].to) runLine(r.train, waits[k - 1].to, dotY(i), waits[k].from, dotY(i));
          const last = waits[waits.length - 1];
          if (seg.enter > last.to) runLine(r.train, last.to, dotY(i), seg.enter, dotY(i));
        }
      }
      prevVisit = { seg, i };
    }
  }
  svg.append(runs);

  rows.forEach((row, i) => {
    const y = axisH + i * rowH;
    const g = s('g', { class: 'chart__row' },
      s('line', { class: 'chart__base', x1: labelW, y1: y + rowH / 2, x2: W - padR, y2: y + rowH / 2 }),
      s('text', { class: 'chart__label', x: labelW - 8, y: y + rowH / 2, text: row.label }));
    for (const r of sim.results) {
      const burnt = burntSeg(level, sim, r.train);
      for (const seg of sim.timeline[r.train]) {
        if (seg.key !== row.key) continue;
        const top = y + (rowH - barH) / 2;
        const barW = Math.max(1, x(seg.ready) - x(seg.enter));
        g.append(s('rect', { class: `bar bar--solid tc-${r.train}`, x: r2(x(seg.enter)), y: top, width: r2(barW), height: barH, rx: 2 }));
        // 出発の番号（地図の丸・編成のカード・結果の行と同じ紺の丸）。色が見分けにくくても、どの列車か分かる。丸が入らない細い帯には付けない
        if (barW >= NO_MIN_W) {
          const cx = r2(x(seg.enter) + NO_R + 2);
          const cy = top + barH / 2;
          g.append(s('g', { class: 'chart__no' },
            s('circle', { class: 'chart__no-disc', cx, cy, r: NO_R }),
            s('text', { class: 'chart__no-text', x: cx, y: cy + 0.5, text: String(departNo.get(r.train)) })));
        }
        if (seg.leave > seg.ready) {
          g.append(s('rect', { class: `bar bar--wait tc-${r.train}`, x: r2(x(seg.ready)), y: top, width: r2(x(seg.leave) - x(seg.ready)), height: barH, rx: 2, fill: `url(#hatch-${r.train})` }));
        }
        // ✖は焦げた瞬間（仕上がり＋猶予＋1分）。駅を出た分ではない（再生の「焦げた！」と同じ分）
        if (burnt === seg) {
          const m = burnMinute(level, seg);
          g.append(s('text', { class: 'chart__burn', x: r2(x(m)), y: y + rowH / 2, 'data-minute': m, text: '✖' }));
        }
        // 手前で待った時間は、帯の下に点線で（ほかの列車の帯と重ならない高さ）
        const ly = top + barH + 3.5;
        for (const w of approachWaits(level, sim, r.train, seg, rowIndex)) {
          g.append(s('line', { class: `wait-line tc-${r.train}`, x1: r2(x(w.from)), y1: ly, x2: r2(x(w.to)), y2: ly }));
        }
      }
    }
    svg.append(g);
  });
  return svg;
}
