// 滑走者の見た目の採点用に、決まった姿勢（立つ・両側の切り・低い姿勢・制動・空中の構え）を、近くから数方向で撮る。
// node tools/shots/rider-capture.mjs --out DIR [--url http://127.0.0.1:5185/] [--spawn first-snow] [--set board|ski] [--only 姿勢,姿勢]
// --set ski：スキーの人の撮り方（アドレスへ ?gear=ski を足して使う）。スノーボード用の撮り方（後ろ 35° 右・高さ 10°・距離 3 m）は、
// 低く近いので、奥へ向いた 2 本の板が、画面では水平に横切って見え、「体と板の向きがずれている」と採点された（スキーの見た目の採点 1 周目）。
// スキーは、ゲームのカメラに近い真後ろの上・真横・前の斜め・後ろの斜めの高い所から、遠くの望遠で撮る。切る場面は、板がいっぱいに傾く速さで撮る。
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { GPU_ARGS, ready } from './common.mjs';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://127.0.0.1:5185/' }, out: { type: 'string' }, spawn: { type: 'string', default: 'first-snow' }, set: { type: 'string', default: 'board' }, only: { type: 'string' } } });
if (!values.out) { console.error('--out DIR を指定してください'); process.exit(1); }
await mkdir(values.out, { recursive: true });
const url = new URL(values.url); url.searchParams.set('debug', '1');
// 姿勢ごとの操作の列と、撮る向き（距離 m・方位°（0＝真後ろ、90＝左、180＝正面、270＝右）・仰角°）
const POSES = [
  { id: '1-stand', steps: [[2.2, {}]], orbits: [[3.0, 35, 10], [3.0, 200, 8], [2.6, 110, 14]] },
  { id: '2-toe', steps: [[2.5, {}], [0.9, { steer: 0.95 }]], orbits: [[3.2, 30, 12], [3.2, 215, 10]] },
  { id: '3-heel', steps: [[2.5, {}], [0.9, { steer: -0.95 }]], orbits: [[3.2, 330, 12], [3.2, 150, 10]] },
  { id: '4-tuck', steps: [[2.0, {}], [1.5, { tuck: 1 }]], orbits: [[3.0, 40, 12], [3.0, 190, 6]] },
  { id: '5-brake', steps: [[3.0, {}], [0.6, { brake: 1 }]], orbits: [[3.4, 20, 14]] },
  { id: '6-air-grab', steps: [[2.5, {}], [0.8, { jump: true }], [0.14, {}], [0.36, { jump: true }]], orbits: [[3.2, 60, 6], [3.2, 200, 4]] },
  { id: '7-air-spin', steps: [[2.5, {}], [0.8, { jump: true }], [0.14, {}], [0.3, { jump: true, steer: 1 }]], orbits: [[3.4, 20, 10]] },
];
// スキー用。向きは [距離, 方位, 仰角, 画角]。'game' は、ゲームのカメラそのまま。操作の 'air'・'crash' は「その状態になるまで進めてから、その秒数」。
// spawn は、姿勢ごとの出発地点（名前か、場所と向きと速さ）。空中の姿勢は、中くらいのジャンプ台で撮る（滞空 1.1〜2.7 秒）
// SIDE は左から、RSIDE は右から。FRONT は右前から、HIGH は左後ろの上から、RHIGH は右後ろの上から。
// つかみは、右手で板をつかむので、右から撮る。左から撮っていたときは、つかまない手しか写らず、採点役は「手が板に届いていない」
// 「テールとセーフティが同じ絵」と読んだ（見た目の採点 2・3 周目。方位 90 を「右」と思い込んでいた）
const BACK = [7, 0, 18, 22], SIDE = [7, 90, 8, 22], FRONT = [7, 200, 10, 22], HIGH = [7, 35, 26, 22], RSIDE = [7, 270, 8, 22], RHIGH = [7, 325, 26, 22];
const FLAT = { x: -42, z: 1372, heading: 0, speed: 0 }; // 湖の、雪の乗った氷の上（平ら。ストックで押して進む場面）
const SKI_POSES = [
  { id: '1-stand', steps: [[3.0, {}]], orbits: [BACK, SIDE, FRONT, HIGH, 'game'] },
  { id: '2-right-45', steps: [[6.0, {}], [0.9, { steer: 0.95 }]], orbits: [BACK, FRONT, HIGH, 'game'] },
  { id: '3-left-45', steps: [[6.0, {}], [0.9, { steer: -0.95 }]], orbits: [BACK, FRONT, HIGH] },
  { id: '4-right-slow', steps: [[2.5, {}], [0.9, { steer: 0.95 }]], orbits: [BACK, FRONT] }, // 遅いとき（時速 30 km）の切り方
  // 低い姿勢は、ゲームのカメラ（後ろの上）でも撮る。この向きからは、前への倒れが縮んで見えないので、腕のたたみ方と頭の低さで読ませる（滑りの採点 2 周目）
  { id: '5-tuck', steps: [[3.0, {}], [1.5, { tuck: 1 }]], orbits: [BACK, SIDE, FRONT, HIGH, 'game'] },
  // 制動：板は横を向き、体は進む向きを向く。向きの基準は、胸（板を基準にすると、どの絵も体を斜めから見ることになり、
  // 体の後ろへ流した棒が「真横へ突き出た」と読まれた＝見た目の採点 2 周目）
  { id: '6-brake', basis: 'chest', steps: [[4.5, {}], [0.6, { brake: 1 }]], orbits: [BACK, SIDE, FRONT, HIGH, 'game'] },
  { id: '7-air-free', spawn: 'jump-mid', steps: [['air', 0.5, {}]], orbits: [BACK, SIDE, FRONT, 'game'] },
  { id: '8-air-safety', spawn: 'jump-mid', steps: [[6.4, {}], ['air', 0.6, { jump: true }]], orbits: [BACK, RSIDE, FRONT, RHIGH, 'game'] },
  { id: '9-air-mute', spawn: 'jump-mid', steps: [[6.4, {}], ['air', 0.08, { jump: true, steer: -1 }], [0.5, { jump: true }]], orbits: [BACK, RSIDE, FRONT, RHIGH] },
  { id: '10-air-tail', spawn: 'jump-mid', steps: [[6.4, {}], ['air', 0.08, { jump: true, steer: 1 }], [0.5, { jump: true }]], orbits: [BACK, RSIDE, FRONT, RHIGH] },
  // ストックで押す：1 回の押しは 1 秒。3 分の 1 ずつずらして、3 コマ撮る（突く → 押し切る → 戻す）
  { id: '11-push', spawn: FLAT, steps: [[1.3, { tuck: 1 }]], orbits: [BACK, SIDE, FRONT, 'game'] },
  { id: '11b-push', spawn: FLAT, steps: [[1.63, { tuck: 1 }]], orbits: [SIDE, FRONT] },
  { id: '11c-push', spawn: FLAT, steps: [[1.97, { tuck: 1 }]], orbits: [SIDE, FRONT] },
  // 板・金具・握りの近くの絵。足もとは、後ろの少し右の上から（斜め横から撮ると、手前の棒の先が、奥の靴に重なって写り、
  // 「輪が金具に重なる」と読まれた。実際は、板の外へ 18 cm 離れている）
  { id: '12-close', steps: [[3.0, {}]], orbits: [[2.6, 22, 30, 30, -0.6], [2.0, 250, 10, 30, -0.1]] },
  // 転倒：日の当たる、ゆるい谷のゲレンデで、小さく跳んで、宙返りを半分で止める（逆さに着地して転ぶ）。
  // 中くらいの台で撮ったときは、着地の斜面が急で日かげ寄りのため、影が体から遠くへ伸びて「体が浮いている」と読まれた（見た目の採点 2 周目）
  { id: '13-crash', steps: [[4.0, {}], [0.8, { jump: true }], [0.12, {}], ['air', 0.5, { jump: true, tuck: 1 }], ['crash', 0.5, {}]], orbits: [BACK, SIDE, HIGH, 'game'] },
  { id: '14-crash-late', steps: [[4.0, {}], [0.8, { jump: true }], [0.12, {}], ['air', 0.5, { jump: true, tuck: 1 }], ['crash', 1.1, {}]], orbits: [HIGH, 'game'] },
];
const only = values.only ? new Set(values.only.split(',')) : null; // --only 1-stand,6-brake：その姿勢だけ撮る
const POSE_SET = (values.set === 'ski' ? SKI_POSES : POSES).filter(p => !only || only.has(p.id));
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const problems = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 })).newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`例外: ${e.message}`));
  await page.goto(url.href, { waitUntil: 'load', timeout: 30000 });
  await ready(page);
  await page.locator('[data-start]').click();
  await page.evaluate(() => window.__ginrei.setManual(true));
  await page.addStyleTag({ content: '.ui-layer { visibility: hidden !important; }' });
  for (const pose of POSE_SET) {
    await page.evaluate((s) => window.__ginrei.teleport(s), pose.spawn ?? values.spawn);
    for (const step of pose.steps) {
      if (step[0] === 'air' || step[0] === 'crash') {
        // その状態（空中・転倒）になるまで（最大 12 秒）進めてから、決まった秒数だけ進める
        await page.evaluate(([mode, sec, i]) => {
          window.__ginrei.setInput(i);
          for (let t = 0; t < 12 && window.__ginrei.state().mode !== mode; t += 1 / 60) window.__ginrei.advance(1 / 60);
          for (let t = 0; t < sec - 1e-9; t += 1 / 60) window.__ginrei.advance(Math.min(1 / 60, sec - t));
        }, [step[0], step[1], step[2]]);
        continue;
      }
      const [seconds, input] = step;
      await page.evaluate(([sec, i]) => { window.__ginrei.setInput(i); for (let t = 0; t < sec - 1e-9; t += 1 / 60) window.__ginrei.advance(Math.min(1 / 60, sec - t)); }, [seconds, input]);
    }
    for (let k = 0; k < pose.orbits.length; k++) {
      const game = pose.orbits[k] === 'game';
      const [dist, az, el, fov = 40, lift = 0] = game ? [] : pose.orbits[k];
      await page.evaluate((o) => new Promise((done) => {
        window.__ginreiDev.feedback.setOrbit(o); window.__ginrei.advance(0);
        requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(() => { window.__ginrei.advance(0); requestAnimationFrame(done); }); });
      }), game ? null : { dist, az, el, fov, lift, basis: pose.basis });
      await page.screenshot({ path: join(values.out, `${pose.id}-${game ? 'game' : k + 1}.png`) });
    }
    await page.evaluate(() => window.__ginreiDev.feedback.setOrbit(null));
    const s = await page.evaluate(() => { const s = window.__ginrei.state(); return { gear: s.gear ?? 'board', mode: s.mode, kmh: Math.round(s.speed * 3.6), edge: Math.round(s.edge * 57.3), crouch: +s.crouch.toFixed(2), grab: s.air.grab, reach: s.air.reach, air: +s.air.time.toFixed(2), spin: Math.round(s.air.spin * 57.3) }; });
    console.log(pose.id, JSON.stringify(s));
  }
} finally { await browser.close(); }
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; } else console.log('問題なし');
