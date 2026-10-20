/* プロモ動画の絵コンテ。操作の時刻・字幕・音の合図は、ここが唯一の正。
   画（render-promo.mjs）も音（promo-audio.mjs）も、この時刻を読む。片方だけ動かすと合わなくなる。

   時刻はすべて「動画の頭を 0 秒とした秒」。マイナスは、動画に映る前の準備の手（夜1は、動画の頭より前に灯りを上げておく）。
   96BPM（1拍 0.625秒・1小節 2.5秒）。場面の切れ目は拍に乗せ、BGM の和音もそこで替える。

   操作はすべて実際の入力（CDP のタッチ）。ドラッグは「時刻と値（灯りは高さ・道具は横位置 cm）」の折れ線で書き、
   render-promo.mjs が、押した位置からの相対の動き（アプリと同じ換算）に直して指を動かす。
   画面の値の予想と、近さの言葉が変わる時刻は、アプリのルール本体（lib/stage.js）で同じ操作を再生して出す。
   合格の判定・そろえる動き・光る演出は、アプリ自身に任せる（ここで成功を作らない）。 */
import { CASES } from '../../lib/cases.js';
import { SNAP_MS, SOLVE_HOLD_MS } from '../../lib/config.js';
import { judge, readingOf, suspectsOf } from '../../lib/deduction.js';
import { createSession, describeAssessment, lampReadout, propReadout, select, setLamp, setPropX } from '../../lib/stage.js';

export const FPS = 30;
export const VIEW = Object.freeze({ width: 540, height: 960 });   // 録画の画面（CSS px）。出力は2倍の 1080×1920
export const SCALE = 2;
export const BPM = 96;
export const BEAT = 60 / BPM;
export const DURATION_SECONDS = 33.125;                            // 53拍

/* 場面の切れ目。BGM の和音の切り替えも、この時刻に合わせる */
export const SECTIONS = Object.freeze({
  hook: { start: 0, end: 4.375 },        // 夜1：灯りを下げていく途中から（まだ「遠い」）
  solve: { start: 4.375, end: 8.75 },    // 夜1：近さが伸びて、ガイドに重なる → そろう → 光る
  solved: { start: 8.75, end: 10.0 },    // 「再現」の判子・現場図・身長の読み
  deduce: { start: 10.0, end: 13.75 },   // 推理：1人を外し、犯人を選ぶ →「解決」の判子
  night3: { start: 13.75, end: 23.75 },  // 夜3：道具を横へ、灯りを縦へ →「再現」
  night5: { start: 23.75, end: 27.5 },   // 夜5：関係ない道具の影を、壁の外へ
  end: { start: 27.5, end: DURATION_SECONDS },   // 終了カード
});

/* 成功の演出の長さ（アプリの定数）。指を離してから：保持 350ms → そろえる 420ms → 光る 600ms → solved の画面 */
export const SOLVE = Object.freeze({ hold: SOLVE_HOLD_MS / 1000, snap: SNAP_MS / 1000, flash: 0.6 });
export const SOLVE_TOTAL = SOLVE.hold + SOLVE.snap + SOLVE.flash;

/* 進行の準備（ページを開く前に localStorage へ入れる）。夜3・夜5を開くためだけに使い、画面には出さない */
export const STORAGE_KEY = 'kage-shogen:v1';
export const progressFor = (ids) => ({ v: 1, cleared: Object.fromEntries(ids.map((id) => [id, { stars: 3 }])), last: null });

const SUSPECT = (id, part) => `[data-suspect-id="${id}"] .${part}`;

/* 場面（take）。1つの場面は、ページを開き直して撮る1本の録画。
   drag：path は [時刻, 値, 加減速] の列。最初の点で指を置き、最後の点で離す（同じ値の点を2つ置くと、止めてから離す）。 */
export const TAKES = Object.freeze([
  {
    id: 'a', caseId: 'rack', cleared: [], start: 0, end: 13.75,
    events: [
      // 動画の頭より前に、灯りを上げておく（影はガイドから離れる）。動画の頭は、灯りを下げ始めた所。
      // 128.65〜128.05cm は、格子で数える重なり率が上下して「すこし似ている／遠い」が揺れる。指を速く通して、1コマも映さない
      { drag: 'lamp', path: [[-1.7, 135], [-0.5, 164, 'inout'], [0, 162.4, 'in'], [4.25, 129.0], [4.31, 127.6], [5.9, 109.4], [6.9, 104.1], [7.25, 101.2, 'out'], [7.35, 101.2]] },
      { tap: '#to-deduction', at: 10.0, label: '推理する' },
      { tap: SUSPECT('hinata', 'exclude'), at: 11.05, label: '外す' },
      { tap: SUSPECT('moriyama', 'accuse'), at: 12.33, label: 'この人だ' },   // 「解決」の判子が、20拍目（12.5秒）の和音の頭に着く
    ],
  },
  {
    id: 'b', caseId: 'bag', cleared: ['rack', 'hat'], start: 13.75, end: 23.75,
    events: [
      { drag: 'hat', path: [[14.0, 30], [15.2, 121, 'inout'], [15.3, 121]] },
      { drag: 'coat', path: [[15.6, 205], [16.8, 119, 'inout'], [16.9, 119]] },
      { drag: 'bag', path: [[17.2, 70], [17.9, 93, 'inout'], [18.0, 93]] },
      { drag: 'lamp', path: [[18.4, 150], [19.2, 137, 'in'], [20.0, 120.5], [20.7, 108.5], [21.05, 103.2, 'out'], [21.2, 103.2]] },
    ],
  },
  {
    id: 'c', caseId: 'umbrella', cleared: ['rack', 'hat', 'bag', 'chair'], start: 23.75, end: DURATION_SECONDS, endCardAt: 27.5,
    events: [
      { drag: 'globe', path: [[24.0, 100], [25.2, 230, 'inout'], [25.3, 230]] },
      { drag: 'bowler', path: [[25.6, 140], [26.8, 10, 'inout'], [26.9, 10]] },
    ],
  },
]);

/* 字幕。{文字|色} の部分だけ色を付ける。色の名前は、アプリの意味の色（灯り＝琥珀・判子＝朱・道具＝紙色・影＝薄い藍）。
   一行・16字まで（1コマ目は12字まで）。場所（pos）は画面ごとに、盤・操作・重要な数字に重ならない所：
     note＝再現室の注記の欄（近さの行の下・操作の上）／side＝成功の画面の現場図の上の帯／top＝推理の見出しの所（結末の画面では上の空き）
   字幕は画の動きより 0.2 秒先に切り替える（lead）。画面ごと替わる所は、新しい字幕が古い画面に重ならないよう、切り替わりに合わせる。
   絵文字・実在の商標・他作品の名前・言い切れない主張は書かない。 */
export const CAPTIONS = Object.freeze([
  { start: 0, end: 4.375, text: '壁の{人影|shade}は、本物か。', pos: 'note' },
  { start: 4.375, end: 6.6, text: '{灯り|lamp}を動かすと、{影|shade}が動く。', pos: 'note' },
  { start: 6.6, end: 8.75, text: '重なれば、{再現|stamp}。', pos: 'note' },
  { start: 8.75, end: 10.0, text: '{灯りの高さ|lamp}から、身長が分かる。', pos: 'side', lead: 0.1, after: 'solved' },
  { start: 10.0, end: 13.75, text: '{アリバイ|lamp}と照らして、犯人を選ぶ。', pos: 'top', lead: 0.12, after: 'deduction' },
  { start: 13.75, end: 18.4, text: '夜が進むと、{道具|prop}が増える。', pos: 'note' },
  { start: 18.4, end: 22.6, text: '縦は{灯り|lamp}、横は{道具|prop}。', pos: 'note' },
  { start: 22.6, end: 23.75, text: null, lead: 0.5, after: 'solved' },     // 夜3の成功の画面：注記の欄の場所は現場図に重なるので、消すだけ（判子「再現」で伝わる）
  { start: 23.75, end: 27.5, text: '全5夜。{影|shade}は嘘をつかない。', pos: 'note' },
]);
export const CAPTION_LEAD = 0.2;

export const END_CARD = Object.freeze({
  badge: '100日チャレンジ Day 71',
  title: '影証言',
  tag: '灯りの高さで、証言の嘘を暴く',
  sub: '全5夜・無料・登録なし',
  urlHost: 'hundred-days.pages.dev',
  urlPath: '/day-071-kage-shogen/',
});
/* 終了カードの中の動き（CSS のアニメ）の時刻。終了カードを出した時刻からの秒。音の合図もここに合わせる */
export const END_ANIM = Object.freeze({ fade: 0.25, lamp: 0.2, rise: 0.35, land: 0.95, title: 0.75, sub: 1.05, url: 1.3, badge: 0.2 });

/* 字幕の {…|色} を、色つきの部分の配列に分ける */
export function parseCaption(text) {
  const parts = [];
  for (const m of text.matchAll(/\{([^|}]+)\|([a-z]+)\}|([^{]+)/g)) parts.push(m[1] ? { t: m[1], c: m[2] } : { t: m[3] });
  return parts;
}
export const captionPlain = (text) => (text == null ? '' : parseCaption(text).map((p) => p.t).join(''));

/* 画面に出す文字の検査。絵文字・欧文の混入を止める（使える欧文は許可リストだけ） */
export function checkTexts() {
  const texts = [...CAPTIONS.filter((c) => c.text != null).map((c) => captionPlain(c.text)), ...Object.values(END_CARD)];
  const problems = [];
  for (const text of texts) {
    if (/\p{Extended_Pictographic}|\uFE0F|\u200D/u.test(text)) problems.push(`絵文字: ${text}`);
    const latin = text.match(/[A-Za-z][A-Za-z0-9.\-/]*/g) ?? [];
    for (const word of latin) if (!['Day', 'hundred-days.pages.dev'].includes(word) && !/^\/?day-071-kage-shogen\/?$/.test(word)) problems.push(`許可リストにない欧文: ${word}`);
  }
  for (const c of CAPTIONS) if (Array.from(captionPlain(c.text)).length > 16) problems.push(`字幕が16字を超える: ${captionPlain(c.text)}`);
  const first = CAPTIONS.find((c) => c.start === 0);
  if (!first || Array.from(captionPlain(first.text)).length > 12) problems.push('1コマ目の字幕が無いか、12字を超える');
  return problems;
}

/* 字幕を切り替え始める時刻（古い字幕が消え始める時刻）。場面の頭の字幕は、ページを開いたときに出ている */
export const captionSwitchAt = (cap) => cap.start - (cap.lead ?? CAPTION_LEAD);

/* ---------------------------------------------------------------- ドラッグの折れ線 */

const EASE = { linear: (u) => u, in: (u) => u * u, out: (u) => 1 - (1 - u) ** 2, inout: (u) => u * u * (3 - 2 * u) };
const round = (x, digits = 3) => Math.round(x * 10 ** digits) / 10 ** digits;

export const pathStart = (path) => path[0][0];
export const pathEnd = (path) => path[path.length - 1][0];

/* 折れ線の時刻 t の値。区間ごとに、終点に書いた加減速（既定は等速）で補間する */
export function pathValue(path, t) {
  if (t <= path[0][0]) return path[0][1];
  for (let i = 1; i < path.length; i += 1) {
    const [t1, v1, ease = 'linear'] = path[i];
    const [t0, v0] = path[i - 1];
    if (t <= t1) return t1 === t0 ? v1 : v0 + (v1 - v0) * EASE[ease]((t - t0) / (t1 - t0));
  }
  return path[path.length - 1][1];
}

/* 夜ごとの「動かす物」の名前（選ぶ札・読み出しと同じ） */
export const labelOf = (caseDef, id) => (id === 'lamp' ? '灯り' : caseDef.stage.props.find((p) => p.id === id).label);
const bandText = (description) => (description.detail ? `${description.label}（${description.detail}）` : description.label);

/* ---------------------------------------------------------------- 操作の列をルール本体で再生する */

/* 1つの場面を、最初から再生する。返す行は、操作ごとの「その後に画面に出るはずの値」と、ドラッグの途中で近さの言葉が変わる時刻。 */
export function simulate(take) {
  const caseDef = CASES.find((c) => c.id === take.caseId);
  const session = createSession(caseDef);
  let phase = 'stage';
  const excluded = new Set();
  const rows = [];
  for (const [index, event] of take.events.entries()) {
    if (event.drag) {
      if (phase !== 'stage') throw new Error(`${take.id}: ${index + 1}番目のドラッグは再現室の外`);
      const id = event.drag;
      const current = id === 'lamp' ? session.arrangement.ly : session.arrangement.xs[id];
      if (current === undefined) throw new Error(`${take.id}: 動かせない物 ${id}`);
      if (Math.abs(current - event.path[0][1]) > 1e-9) throw new Error(`${take.id}: ${id} の最初の値 ${event.path[0][1]} が、いまの値 ${current} と違う`);
      for (let i = 1; i < event.path.length; i += 1) if (!(event.path[i][0] >= event.path[i - 1][0])) throw new Error(`${take.id}: ${id} の折れ線の時刻が戻る`);
      if (!select(session, id)) throw new Error(`${take.id}: ${id} を選べない`);
      // 近さの言葉が変わる時刻（10ms 刻みで再生。実際の画面は指の動き＝約16ms ごとに追う）
      const bands = [];
      let last = bandText(describeAssessment(session));
      let lastStep = describeAssessment(session).step;
      const from = pathStart(event.path); const to = pathEnd(event.path);
      for (let t = from; t <= to + 1e-9; t += 0.01) {
        const v = pathValue(event.path, t);
        if (id === 'lamp') setLamp(session, v); else setPropX(session, id, v);
        const d = describeAssessment(session);
        const text = bandText(d);
        if (text !== last) { bands.push({ at: round(t), text, step: d.step, fromText: last, fromStep: lastStep }); last = text; lastStep = d.step; }
      }
      // 0.12秒以内に続いた変化（格子で数える重なり率が、しきい値の近くで上下する所）は、1つの変化にまとめる。
      // まとめた結果、言葉が元に戻ったものは捨てる。up は、まとめた前後で段が上がったか
      const merged = [];
      for (const b of bands) {
        const prev = merged[merged.length - 1];
        if (prev && b.at - prev.lastAt <= 0.12) Object.assign(prev, { text: b.text, step: b.step, lastAt: b.at });
        else merged.push({ ...b, lastAt: b.at });
      }
      const changes = merged.filter((m) => m.text !== m.fromText).map((m) => ({ at: m.at, text: m.text, step: m.step, up: m.step > m.fromStep }));
      const end = event.path[event.path.length - 1][1];
      if (id === 'lamp') setLamp(session, end); else setPropX(session, id, end);
      const release = describeAssessment(session);
      const row = {
        index, kind: 'drag', id, label: labelOf(caseDef, id), start: from, release: to, end,
        want: { lamp: lampReadout(session), item: id === 'lamp' ? '' : `${labelOf(caseDef, id)} 横 ${propReadout(session, id)}cm`, band: bandText(release), phase: 'stage' },
        bands: changes, success: release.label === '再現できた',
      };
      if (row.success) {
        // 指を離すと、アプリが判定する。保持 → そろえる → 光る → solved。そろえたあとの値は正解の配置
        const solution = { ly: caseDef.stage.lamp.solution, xs: Object.fromEntries(caseDef.stage.props.map((p) => [p.id, p.decoy ? session.arrangement.xs[p.id] : p.x.solution])) };
        row.solve = { snapAt: round(to + SOLVE.hold), flashAt: round(to + SOLVE.hold + SOLVE.snap), solvedAt: round(to + SOLVE_TOTAL), lamp: Math.round(solution.ly), reading: readingOf(caseDef) };
        phase = 'solved';
      }
      rows.push(row);
    } else if (event.tap) {
      const row = { index, kind: 'tap', selector: event.tap, label: event.label, at: event.at };
      if (event.tap === '#to-deduction') {
        if (phase !== 'solved') throw new Error(`${take.id}: 「推理する」は成功の画面でだけ押せる`);
        phase = 'deduction';
        row.want = { phase };
      } else if (/\.exclude$/.test(event.tap)) {
        if (phase !== 'deduction') throw new Error(`${take.id}: 「外す」は推理の画面でだけ押せる`);
        const id = event.tap.match(/data-suspect-id="([^"]+)"/)[1];
        excluded.add(id);
        row.want = { phase, excluded: [...excluded] };
      } else if (/\.accuse$/.test(event.tap)) {
        if (phase !== 'deduction') throw new Error(`${take.id}: 「この人だ」は推理の画面でだけ押せる`);
        const id = event.tap.match(/data-suspect-id="([^"]+)"/)[1];
        const result = judge(caseDef, id);
        if (!result.correct) throw new Error(`${take.id}: ${id} は犯人ではない（${result.message}）`);
        phase = 'verdict';
        row.want = { phase, title: `第${caseDef.no}夜　${caseDef.title}`, text: caseDef.closing, culprit: suspectsOf(caseDef).find((s) => s.id === id) };
      } else throw new Error(`${take.id}: 想定していない押す所 ${event.tap}`);
      rows.push(row);
    }
  }
  return rows;
}

/* ---------------------------------------------------------------- 効果音の合図 */

/* 効果音の合図。{ at: 秒, kind, ... }。kind：
   lamp（灯りを動かす弱い音。2.5cm 動くごとに1つ。高さで音程が変わる）・slide（道具をすべらせる音。len 秒）・meter（近さの目盛りが増える）
   snap（そろって吸い付く）・chime（光る＝成功）・stamp（判子。書き出した動画から測ったコマ）・tap（ボタン）・cross（外す）
   cut（場面の切れ目）・end（終了カード）・rise／land（終了カードの影が上がって収まる）
   measured には、render-promo.mjs が書き出した動画から測った時刻を入れる（無ければ予想の時刻）：
     bands['a:0:2'] … 場面a・操作0・近さの変化2番目の時刻／solved['a:0'] … 成功の画面が出た時刻／stamps['a:0'] … 判子が押されたコマ／taps['a:2'] … 押した結果が画に出た時刻
   指の動きの音（lamp・slide）は、指の動きから画が動くまで（約1コマ）遅らせて置く */
export const DRAG_LAG = 0.03;
export function deriveCues(measured = {}) {
  const { bands = {}, solved = {}, stamps = {}, taps = {} } = measured;
  const cues = [];
  const add = (at, kind, extra = {}) => cues.push({ at: round(at), kind, ...extra });
  for (const take of TAKES) {
    for (const row of simulate(take)) {
      const key = `${take.id}:${row.index}`;
      if (row.kind === 'drag') {
        const lag = DRAG_LAG;
        const event = take.events[row.index];
        if (row.id === 'lamp') {
          // 2.5cm 動くごとに、弱い音。高さ（cm）を音程に使う
          let lastV = event.path[0][1];
          for (let t = row.start; t <= row.release + 1e-9; t += 0.005) {
            const v = pathValue(event.path, t);
            if (Math.abs(v - lastV) >= 2.5) { add(t + lag, 'lamp', { height: round(v, 1), up: v > lastV }); lastV = v; }
          }
        } else {
          add(row.start + lag, 'slide', { len: round(row.release - row.start), label: row.label });
        }
        row.bands.forEach((b, i) => { if (b.up) add(bands[`${key}:${i}`] ?? b.at + lag, 'meter', { step: b.step }); });
        if (row.solve) {
          const shown = solved[key] ?? row.solve.solvedAt + lag;
          add(shown - SOLVE.snap - SOLVE.flash, 'snap');
          add(shown - SOLVE.flash, 'chime');
          add(stamps[key] ?? shown + 0.12, 'stamp', { word: '再現' });
        }
      } else if (row.kind === 'tap') {
        add(row.at, /\.exclude$/.test(row.selector) ? 'cross' : 'tap');
        if (row.want.phase === 'verdict') add(stamps[key] ?? (taps[key] ?? row.at + 0.05) + 0.12, 'stamp', { word: '解決' });
      }
    }
  }
  for (const take of TAKES.slice(1)) add(take.start, 'cut');
  const end = SECTIONS.end.start;
  add(end, 'end');
  add(end + END_ANIM.rise, 'rise');
  add(end + END_ANIM.land, 'land');
  return cues.filter((c) => c.at >= 0 && c.at < DURATION_SECONDS).sort((a, b) => a.at - b.at);
}
