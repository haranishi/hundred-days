// プロモ動画の絵コンテ（tools/promo/timeline.mjs）と、重ね物の置き場所（overlay.mjs）の試験。
// Chromium も ffmpeg も使わない。録画の前に崩れていると分かることだけを確かめる（録画そのものの照合は render-promo.mjs が行う）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { readingOf, ruledOutIds } from '../lib/deduction.js';
import { hitTest, propScreenRect } from '../lib/hit.js';
import { createTransform } from '../lib/transform.js';
import {
  BEAT, CAPTIONS, DURATION_SECONDS, END_ANIM, FPS, SCALE, SECTIONS, TAKES, VIEW,
  captionPlain, captionSwitchAt, checkTexts, deriveCues, pathEnd, pathStart, pathValue, simulate,
} from '../tools/promo/timeline.mjs';
import { CAPTION_BOX, PLATE_BOUND, SAFE, textMaxWidth } from '../tools/promo/overlay.mjs';
import { stampLandingDelay } from '../tools/promo/audit.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const onBeat = (t) => near(t / BEAT, Math.round(t / BEAT), 1e-6);

test('動画は縦1080×1920・30fps・32〜36秒（録画は CSS 540×960 を倍率2で撮る）', () => {
  assert.equal(VIEW.width * SCALE, 1080);
  assert.equal(VIEW.height * SCALE, 1920);
  assert.equal(FPS, 30);
  assert.ok(DURATION_SECONDS >= 32 && DURATION_SECONDS <= 36, `${DURATION_SECONDS}`);
});

test('場面（take）は切れ目なくつながり、切れ目と場面の頭は拍に乗る', () => {
  assert.equal(TAKES[0].start, 0);
  for (let i = 1; i < TAKES.length; i += 1) assert.equal(TAKES[i].start, TAKES[i - 1].end);
  assert.equal(TAKES[TAKES.length - 1].end, DURATION_SECONDS);
  const sections = Object.values(SECTIONS);
  assert.equal(sections[0].start, 0);
  for (let i = 1; i < sections.length; i += 1) assert.equal(sections[i].start, sections[i - 1].end);
  for (const s of sections) assert.ok(onBeat(s.start), `場面の頭 ${s.start} が拍に乗らない`);
  for (const take of TAKES) assert.ok(sections.some((s) => s.start === take.start), `切れ目 ${take.start} が場面の頭でない`);
  assert.equal(SECTIONS.end.start, TAKES[TAKES.length - 1].endCardAt);
});

test('画面に出す文字：絵文字なし・許可した欧文だけ・一行16字まで・1コマ目の字幕は12字まで', () => {
  assert.deepEqual(checkTexts(), []);
  const first = CAPTIONS.find((c) => c.start === 0);
  assert.ok(first && Array.from(captionPlain(first.text)).length <= 12);
});

test('字幕は時刻順で重ならず、どの字幕にも置き場所がある', () => {
  for (let i = 0; i < CAPTIONS.length; i += 1) {
    const c = CAPTIONS[i];
    assert.ok(c.start < c.end && c.end <= DURATION_SECONDS);
    if (i > 0) assert.equal(c.start, CAPTIONS[i - 1].end, `字幕 ${i} の頭が前の字幕の終わりと合わない`);
    if (c.text != null) assert.ok(CAPTION_BOX[c.pos], `字幕 ${captionPlain(c.text)} の置き場所 ${c.pos} が無い`);
    if (c.after) assert.ok(['solved', 'deduction', 'verdict', 'stage'].includes(c.after));
    // 場面の頭の字幕は、録画の初めから出しておく。それ以外は、同じ場面の録画の中で切り替える
    const take = TAKES.find((t) => c.start >= t.start && c.start < t.end);
    if (c.start !== take.start) assert.ok(captionSwitchAt(c) > take.start, `字幕 ${captionPlain(c.text)} の切り替えが前の場面にはみ出す`);
  }
});

test('字幕の字は安全余白（左右64px・上150px・下350px）の内側、札は内容の列の内側に収まる', () => {
  for (const [pos, box] of Object.entries(CAPTION_BOX)) {
    const center = (box.left + box.right) / 2; const max = textMaxWidth(box);
    assert.ok(max > 0, pos);
    assert.ok(center - max / 2 >= SAFE.left && center + max / 2 <= SAFE.right, `${pos}: 字の幅の上限が SAFE の外へ出る`);
    assert.ok(box.top >= SAFE.top && box.top + box.height <= SAFE.bottom, `${pos}: 札が上下の安全余白にかかる`);
    assert.ok(box.left >= PLATE_BOUND.left && box.right <= PLATE_BOUND.right, `${pos}: 札が内容の列の外へ出る`);
    assert.equal(SAFE.left * SCALE, 64); assert.equal((VIEW.width - SAFE.right) * SCALE, 64);
    assert.equal(SAFE.top * SCALE, 150); assert.equal((VIEW.height - SAFE.bottom) * SCALE, 350);
  }
  // どの字幕も、いちばん小さい字にすれば札の中に一行で入る（字の幅は、字数×字の大きさ×1.02 で見積もる）
  for (const c of CAPTIONS.filter((x) => x.text != null)) {
    const box = CAPTION_BOX[c.pos];
    assert.ok(Array.from(captionPlain(c.text)).length * box.min * 1.02 <= textMaxWidth(box), captionPlain(c.text));
  }
});

test('操作の列をルール本体で再生すると、夜1と夜3は指を離した所で再現でき、夜5は邪魔な道具を端へ寄せるだけ', () => {
  const [a, b, c] = TAKES.map((take) => simulate(take));
  const night1 = a.find((r) => r.kind === 'drag');
  assert.equal(night1.success, true);
  assert.equal(night1.want.lamp, 101);
  assert.equal(night1.solve.lamp, CASES[0].stage.lamp.solution);
  assert.equal(night1.solve.reading, readingOf(CASES[0]));
  assert.match(night1.solve.reading, /99cm/); assert.match(night1.solve.reading, /165cm/);
  const n3 = b.filter((r) => r.kind === 'drag');
  assert.deepEqual(n3.map((r) => r.success), [false, false, false, true]);
  assert.deepEqual(n3.slice(0, 3).map((r) => r.want.item), ['帽子 横 121cm', '外套 横 119cm', '鞄 横 93cm']);
  assert.equal(n3[3].solve.lamp, CASES[2].stage.lamp.solution);
  assert.ok(c.every((r) => !r.success));
  const umbrella = stageOf(CASES[4]);
  for (const r of c) assert.ok(umbrella.props.find((p) => p.id === r.id).decoy, `${r.id} は邪魔な道具ではない`);
});

test('推理：外すのはアリバイのある人、選ぶのは犯人（夜1）', () => {
  const rows = simulate(TAKES[0]);
  const exclude = rows.find((r) => r.kind === 'tap' && r.want.excluded);
  const accuse = rows.find((r) => r.kind === 'tap' && r.want.phase === 'verdict');
  assert.deepEqual(exclude.want.excluded, [...ruledOutIds(CASES[0])]);
  assert.equal(accuse.want.culprit.id, CASES[0].culprit);
  assert.ok(exclude.at < accuse.at);
});

test('近さの言葉は、ドラッグの途中で段が上がっていくだけ（夜1は 遠い→すこし似ている→近い→再現できた）', () => {
  const night1 = simulate(TAKES[0]).find((r) => r.kind === 'drag');
  assert.deepEqual(night1.bands.map((b) => b.text), ['すこし似ている', '近い', '再現できた']);
  assert.ok(night1.bands.every((b) => b.up));
  // 128.65〜128.05cm は重なり率が上下して言葉が揺れる。そこを1コマ（1/30秒）より速く通る
  const path = TAKES[0].events[0].path;
  let enter = null; let leave = null;
  for (let t = 0; t <= pathEnd(path); t += 0.001) {
    const v = pathValue(path, t);
    if (enter === null && v <= 128.65) enter = t;
    if (leave === null && v <= 128.05) { leave = t; break; }
  }
  assert.ok(leave - enter < 1 / FPS, `${(leave - enter).toFixed(3)}秒`);
});

test('1コマ目は、灯りを下げていく途中（0秒と0.3秒で灯りの高さが違い、影はガイドへ近づく）', () => {
  const path = TAKES[0].events[0].path;
  assert.ok(pathStart(path) < 0, '指は動画の頭より前に置く');
  const v0 = pathValue(path, 0); const v1 = pathValue(path, 0.3);
  assert.ok(v1 < v0 - 1, `${v0} → ${v1}`);
  assert.ok(v0 > CASES[0].stage.lamp.solution, '灯りは正解より上から下りる（影はガイドへ上がる）');
});

test('ドラッグの値は動ける範囲の中で、時刻は戻らない。つかむ所では、狙った物がつかまる', () => {
  const wall = { width: 506, height: 506 * 180 / 260 };      // 幅540の画面の壁（余白16px・枠1px）
  const t = createTransform(wall.width, wall.height);
  for (const take of TAKES) {
    const caseDef = CASES.find((c) => c.id === take.caseId);
    const stage = stageOf(caseDef);
    const arrangement = { ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((p) => [p.id, p.x.start])) };
    for (const event of take.events.filter((e) => e.drag)) {
      const range = event.drag === 'lamp' ? stage.lamp : stage.props.find((p) => p.id === event.drag).x;
      for (let i = 0; i < event.path.length; i += 1) {
        assert.ok(event.path[i][1] >= range.min && event.path[i][1] <= range.max, `${take.id}: ${event.drag} の値 ${event.path[i][1]}`);
        if (i > 0) assert.ok(event.path[i][0] >= event.path[i - 1][0]);
      }
      const point = event.drag === 'lamp' ? t.toScreen(stage.lamp.x, arrangement.ly) : (() => { const r = propScreenRect(t, stage.props.find((p) => p.id === event.drag), arrangement.xs[event.drag]); return { x: r.cx, y: r.cy }; })();
      assert.equal(hitTest(t, stage, arrangement, point.x, point.y), event.drag, `${take.id}: ${event.drag} をつかめない`);
      const end = event.path[event.path.length - 1][1];
      if (event.drag === 'lamp') arrangement.ly = end; else arrangement.xs[event.drag] = end;
    }
  }
});

test('効果音の合図：時刻順・尺の内側。判子は3つ（再現・解決・再現）、場面の切れ目と終了カードに合図がある', () => {
  const cues = deriveCues();
  for (let i = 1; i < cues.length; i += 1) assert.ok(cues[i].at >= cues[i - 1].at);
  assert.ok(cues.every((c) => c.at >= 0 && c.at < DURATION_SECONDS));
  assert.deepEqual(cues.filter((c) => c.kind === 'stamp').map((c) => c.word), ['再現', '解決', '再現']);
  assert.equal(cues.filter((c) => c.kind === 'chime').length, 2);
  for (const take of TAKES.slice(1)) assert.ok(cues.some((c) => c.kind === 'cut' && c.at === take.start));
  assert.ok(cues.some((c) => c.kind === 'end' && c.at === SECTIONS.end.start));
  assert.ok(cues.filter((c) => c.kind === 'meter').every((c) => c.step >= 2 && c.step <= 4));
  // 測った時刻を渡すと、判子の合図はその時刻に置かれる
  const moved = deriveCues({ stamps: { 'a:0': 9.0 } });
  assert.ok(moved.some((c) => c.kind === 'stamp' && c.at === 9.0));
});

test('終了カードの動きは、終了カードの間に収まる', () => {
  const span = SECTIONS.end.end - SECTIONS.end.start;
  for (const [name, at] of Object.entries(END_ANIM)) assert.ok(at >= 0 && at < span - 1.5, `${name} ${at}`);
});

test('判子は、画面が切り替わってから約0.12秒で紙に着く（app.css の stamp-in：0.38秒・cubic-bezier(0.2, 1.4, 0.4, 1)）', () => {
  const delay = stampLandingDelay();
  assert.ok(delay > 0.1 && delay < 0.13, `${delay}`);
  assert.ok(delay < 0.38 / 2, '行き過ぎて戻るより前に、最終の大きさを一度通る');
});
