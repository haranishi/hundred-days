// 撮影：scenes.mjs の場面を、配信物の本物の遊びの画面で、仮の時計（1コマ＝1/30 秒）のもとに流して JPEG の連番に残す。
//   node capture.mjs <場面> [--every N]（N コマに1枚だけ残す下見）[--port 4880]
// 出力：output/takes/<場面>/f<コマ番号>.jpg（録る区間だけ）・states.jsonl（毎コマの状態の要約）・take.json（印・結末・ブラウザ・GPU）。
// 遊びの操作は道順の台本（window.__autopilot）と自動操作の口（window.__input）だけで行い、状態や数値は書き換えない。
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, openGame, startServer } from './lib/harness.mjs';
import { SCENES, VIEWPORT, DPR, PROMO_CSS } from './scenes.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else a._.push(argv[i]);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const name = String(args._[0] ?? '');
const scene = SCENES[name];
if (!scene) {
  console.error(`場面の名前: ${Object.keys(SCENES).join(' / ')}`);
  process.exit(2);
}
const every = Math.max(1, Number(args.every ?? 1));
const dir = path.join(OUT, 'takes', name);
mkdirSync(dir, { recursive: true });

/** states.jsonl に残す毎コマの要約。 */
const SUMMARY = () => {
  const s = window.__state;
  const p = s.player;
  return {
    t: Number(s.t.toFixed(3)),
    screen: s.screen,
    phase: s.phase,
    finale: s.finale,
    p: { x: +p.x.toFixed(2), z: +p.z.toFixed(2), st: p.stance, light: +p.light.toFixed(2), tier: p.lightTier, stones: p.stones, act: p.action, prompt: p.prompt },
    g: s.guards.map((g) => ({ id: g.id, x: +g.x.toFixed(2), z: +g.z.toFixed(2), view: Math.round(g.view), s: +g.s.toFixed(2), st: g.state, aw: g.awareness, down: g.down, sees: g.sees })),
    discoveries: s.discoveries,
    takedowns: s.takedowns,
    stonesUsed: s.stonesUsed,
    outcome: s.outcome,
    cam: { yaw: Math.round(s.camera.yaw), pitch: Math.round(s.camera.pitch) },
    pilot: window.__autopilot.status()?.status ?? null,
    pilotStep: window.__autopilot.status()?.step ?? null,
  };
};

async function main() {
  const server = await startServer(Number(args.port ?? 4880));
  let g = null;
  const take = { scene: name, every, marks: [], started: new Date().toISOString() };
  writeFileSync(path.join(dir, 'states.jsonl'), '');
  try {
    g = await openGame({ server, query: scene.query, viewport: VIEWPORT, dpr: DPR, css: PROMO_CSS + (scene.css ?? '') });
    take.browser = g.browserName;
    take.browserReason = g.reason;
    take.gpu = g.gpu;
    console.log(`場面 ${name}・${g.browserName}（${g.gpu}）`);
    const page = g.page;
    let idx = 0;
    let rec = false;
    let saved = 0;
    let last = null;
    const d = {
      page,
      get idx() {
        return idx;
      },
      get last() {
        return last;
      },
      async state() {
        return page.evaluate(() => window.__state);
      },
      /** n コマ進める。録る区間なら JPEG を残す。 */
      async frame(n = 1) {
        for (let i = 0; i < n; i++) {
          await g.frame();
          idx++;
          last = await page.evaluate(SUMMARY);
          appendFileSync(path.join(dir, 'states.jsonl'), `${JSON.stringify({ f: idx, rec, ...last })}\n`);
          if (rec && idx % every === 0) {
            await page.screenshot({ path: path.join(dir, `f${String(idx).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
            saved++;
          }
        }
        return last;
      },
      /** 条件（毎コマの要約を受ける関数）が立つまで進める。maxSec を超えたら失敗。 */
      async until(pred, maxSec, label) {
        const max = Math.round(maxSec * 30);
        for (let i = 0; i < max; i++) {
          const s = await d.frame();
          if (pred(s)) return s;
          if (s.outcome === 'caught' || s.screen === 'gameover') throw new Error(`${label}：捕まった（${s.t} 秒）`);
        }
        throw new Error(`${label}：${maxSec} 秒たっても条件が立たない`);
      },
      async route(steps, rname = 'promo') {
        await page.evaluate((r) => window.__autopilot.start(r), { name: rname, steps });
      },
      async stopRoute() {
        await page.evaluate(() => window.__autopilot.stop());
      },
      async input(fn, a) {
        await page.evaluate(fn, a);
      },
      rec(on) {
        rec = on;
        d.mark(on ? 'rec-on' : 'rec-off');
      },
      mark(label) {
        take.marks.push({ label, f: idx, t: last?.t ?? null });
        console.log(`  印 ${label}：コマ ${idx}・ゲーム ${last?.t ?? '-'} 秒`);
      },
    };
    await d.frame();
    await scene.run(d);
    take.final = last;
    take.saved = saved;
    take.frames = idx;
    take.consoleErrors = g.errors;
    console.log(`残したコマ ${saved}・全 ${idx} コマ・結末 ${last?.outcome ?? 'なし'}・発見 ${last?.discoveries}・当て身 ${last?.takedowns}・小石 ${last?.stonesUsed}・エラー ${g.errors.length}`);
  } catch (e) {
    take.error = String(e?.stack ?? e);
    console.error(e);
    process.exitCode = 1;
  } finally {
    writeFileSync(path.join(dir, 'take.json'), JSON.stringify(take, null, 2));
    if (g) await g.browser.close();
    await server.stop();
  }
}

main();
