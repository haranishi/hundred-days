// OWNER: tools
// 自動プレイを GPU を使うブラウザ（tools/lib/browser.mjs）で流し、一定間隔（ゲーム内の秒）でスクショと状態ログを .captures/<周>/play/ に保存する。
// スクショの瞬間はシミュレーションを止めて撮る（window.__play.freeze）ので、決まった時刻の絵になる。
//
//   npm run play -- r00b                       自動プレイ basic を実時間で流す（3分＋結果）
//   npm run play -- r00b --speed 4             4倍速（3分を約45秒で）
//   npm run play -- r00b --script steps.json   台本を流す（[{ "at": 秒, "do": "press|release|tap|hold|look", "key": "w", "ms": 500, "dx": 0, "dy": 0 }]）
//   --interval 5（スクショの間隔、秒）--q high --no-build --out play（保存先のフォルダ名）--vsync-off
//   --until 40（ゲーム内の40秒で打ち切る。見た目の確認用。完走の判定はしない）
//   --creature raiyoku（r03-roster：怪獣を選ぶ。kurenai・raiyoku・homuratsuno。既定は紅竜）
//   --audio（r03-roster：操作なしでも音が出る設定で開き、出来事と音のずれ（window.__audioLog）を summary.json の audioSync に書く）
//   --shots-at 12.5,40（その時刻にもスクショを撮る。技を出している瞬間の画を撮るため）
//   --shot-on lightning.hop:3,lava.launch:4+0.5（出来事がその回数だけ出た刻み（+秒 を付けるとその秒だけ後）で止めて撮る。前の1枚を撮った後から数える）
// 台本のキーは 'w'・'space'・'shift'・'c'（ゆっくり降りる、r02-controls）・'left'・'right'・'q'・'e' など（src/harness/keys.ts）。
// summary.json の endedAt は時間切れになったゲーム内時刻（r02-controls：180.0 になるはず）。
// r05-camera：states.jsonl の各行に camera（位置・向き・画角と、追うカメラの揺れ・画角の跳ね・沈み込み・持ち上げ）も残す。
// r06-camera2：camera に置き方の規則の答え（mode：寄せた・上げた・網点に任せた）と、寄せた距離・網点を広げる度合いも残す。
// r06-balance：--measure で、毎コマの破壊率・怒り・大技の回数を記録し、summary.json の measure に、怒りが初めて満タンになった時刻と、
// 大技（rage.release）を使った時刻・使った後3秒と8秒の破壊率の伸び（%）を書く。人に近い遊び方の台本（tests/gameplay/humanPlay.ts が
// 書き出す --script）と組んで、3体の強さをブラウザで確かめる（.captures/r06-balance）。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, assertHardwareGpu, buildApp, launchBrowser, parseArgs, portFrom, startPreview } from './lib/harness.mjs';

const VIEWPORT = { width: 1600, height: 900 };
const DURATION = 180;

const args = parseArgs(process.argv.slice(2));
const round = String(args.round ?? args._[0] ?? 'scratch');
const speed = Math.max(1, Math.min(16, Number(args.speed ?? 1)));
const interval = Math.max(1, Number(args.interval ?? 5));
const quality = String(args.q ?? 'high');
const outDir = path.join(ROOT, '.captures', round, String(args.out ?? 'play'));
const until = args.until !== undefined ? Number(args.until) : null;
const creature = args.creature ? String(args.creature) : null;
const withAudio = Boolean(args.audio);
const withMeasure = Boolean(args.measure);
const extraShots = args['shots-at'] ? String(args['shots-at']).split(',').map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];
const eventShots = args['shot-on']
  ? String(args['shot-on'])
      .split(',')
      .map((x) => {
        const [type, rest = '1'] = x.split(':');
        const [n, after = '0'] = rest.split('+');
        return { type, n: Number(n), after: Number(after) };
      })
  : [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * --measure の記録（[ゲーム内時刻, 遊んでいるか, 破壊率, 怒り, rage.release の回数] の並び）から：怒りが初めて満タンになった時刻と、
 * 大技を使った時刻ごとの3秒・8秒の伸び（%、時間切れまで。3秒たつ前に時間切れなら truncated）。tests/gameplay/humanPlay.ts と同じ数え方。
 */
function measureOf(rec) {
  const play = rec.filter((r) => r[1] === 1);
  if (play.length === 0) return null;
  const end = play[play.length - 1][0];
  const desAt = (t) => (play.find((r) => r[0] >= t) ?? play[play.length - 1])[2];
  const full = play.find((r) => r[3] >= 100);
  const uses = [];
  let seen = play[0][4];
  for (const r of play) {
    for (; seen < r[4]; seen++) uses.push(r[0]);
  }
  const pct = (v) => Math.round(v * 1e5) / 1e3;
  return {
    endT: end,
    destruction: pct(play[play.length - 1][2]),
    rageFullAt: full ? full[0] : null,
    specials: uses.map((t) => ({ t, gain3: pct(desAt(Math.min(end, t + 3)) - desAt(t)), gain8: pct(desAt(Math.min(end, t + 8)) - desAt(t)), truncated: t + 3 > end })),
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const script = args.script ? JSON.parse(await readFile(path.resolve(String(args.script)), 'utf8')) : null;
  if (!args['no-build']) buildApp();
  const server = await startPreview(portFrom(args, 5306));
  const browser = await launchBrowser({ uncapped: Boolean(args['vsync-off']), autoplay: withAudio });
  const t0 = Date.now();
  const errors = [];
  const shots = [];
  const states = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (script) await page.addInitScript((steps) => (window.__playtestScript = steps), script);
    if (withMeasure)
      await page.addInitScript(() => {
        const rec = (window.__measureRec = []);
        let lastT = -1;
        const loop = () => {
          const s = window.__state;
          if (s && s.t !== lastT) {
            lastT = s.t;
            rec.push([s.t, s.phase === 'playing' ? 1 : 0, s.score.destruction, s.score.rage, s.events?.['rage.release'] ?? 0]);
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
    const kind = script ? 'script' : 'basic';
    await page.goto(`${server.url}/?playtest=${kind}&speed=${speed}&q=${quality}${creature ? `&creature=${creature}` : ''}`);
    await page.waitForFunction(() => (window.__appReady === true && window.__state !== undefined) || typeof window.__appError === 'string', null, { timeout: 120000 });
    const appError = await page.evaluate(() => window.__appError ?? null);
    if (appError) throw new Error(`ページの起動に失敗: ${appError}`);
    const gpu = await page.evaluate(() => window.__app?.gpu ?? 'unknown');
    assertHardwareGpu(gpu);

    let nextShot = 0;
    let nextLog = 0;
    let watching = null;
    const armEventShot = async () => {
      watching = eventShots.shift() ?? null;
      if (watching) await page.evaluate(([type, n, after]) => window.__play.freezeOn(type, n, after), [watching.type, watching.n, watching.after]);
    };
    await armEventShot();
    // 時間切れの瞬間の状態（結果の後も街は崩れ続けるので、数字はこの瞬間のものを報告する）
    let endState = null;
    const deadline = Date.now() + ((DURATION + 10) / speed) * 1000 + 180000;
    let last = null;
    while (Date.now() < deadline) {
      // r05-camera：状態の記録にカメラの値も残す（位置・向き・画角と、追うカメラの揺れ・画角の跳ね・沈み込み・持ち上げ。指摘「状態の記録にカメラの値が無い」）
      const s = await page.evaluate(() => {
        const st = window.__state;
        const cam = window.__app?.camera;
        if (!st || !cam) return st;
        const e = cam.matrixWorld.elements;
        const f = cam.userData?.follow;
        const r2 = (v) => Math.round(v * 100) / 100;
        return {
          ...st,
          camera: {
            pos: [r2(cam.position.x), r2(cam.position.y), r2(cam.position.z)],
            dir: [-e[8], -e[9], -e[10]].map((v) => Math.round(v * 1e4) / 1e4),
            fov: r2(cam.fov),
            ...(f ? { shakeDeg: Math.round(f.shakeDeg * 1000) / 1000, kickDeg: r2(f.kickDeg), sinkM: r2(f.sinkM), liftM: r2(f.liftM), distance: r2(f.distance) } : {}),
            // r06-camera2：置き方の規則の答え（free・pull・lift・pullLift・blocked・push）と、寄せた距離・網点を広げる度合い
            ...(f && f.mode !== undefined ? { mode: f.mode, pulledIn: r2(f.pulledIn), spread: r2(f.spread ?? 0), costMs: Math.round((f.costMs ?? 0) * 1000) / 1000 } : {}),
          },
        };
      });
      last = s;
      if (!endState && s.phase === 'result') endState = s;
      if (s.t >= nextLog) {
        states.push(s);
        nextLog += 0.5;
      }
      if (watching && (await page.evaluate(() => window.__play.frozen))) {
        const frozen = await page.evaluate(() => window.__state);
        const file = path.join(outDir, `on-${watching.type.replace('.', '_')}-${watching.n}-t${frozen.t.toFixed(2).replace('.', '_')}.png`);
        await page.screenshot({ path: file, type: 'png' });
        shots.push({ t: frozen.t, file: path.relative(ROOT, file), phase: frozen.phase, on: `${watching.type}:${watching.n}`, action: frozen.dragon.action, mode: frozen.dragon.mode });
        await page.evaluate(() => window.__play.freeze(false));
        await armEventShot();
      }
      const extra = extraShots.length > 0 && s.t >= extraShots[0];
      if (s.t >= nextShot || extra) {
        if (extra) extraShots.shift();
        await page.evaluate(() => window.__play.freeze(true));
        const frozen = await page.evaluate(() => window.__state);
        const file = path.join(outDir, extra ? `at${frozen.t.toFixed(1).replace('.', '_')}-${frozen.dragon.action}.png` : `t${String(Math.round(frozen.t)).padStart(3, '0')}.png`);
        await page.screenshot({ path: file, type: 'png' });
        await page.evaluate(() => window.__play.freeze(false));
        shots.push({ t: frozen.t, file: path.relative(ROOT, file), phase: frozen.phase, destruction: frozen.score.destruction, collapsed: frozen.buildings.collapsed, action: frozen.dragon.action, mode: frozen.dragon.mode });
        if (!extra) nextShot += interval;
      }
      if (s.phase === 'result' && s.t >= DURATION + 1.5) break;
      if (until !== null && s.t >= until) break;
      await sleep(80);
    }
    const file = path.join(outDir, 'result.png');
    await page.screenshot({ path: file, type: 'png' });
    shots.push({ t: last?.t ?? -1, file: path.relative(ROOT, file), phase: last?.phase ?? 'unknown' });

    const fpsList = states.filter((s) => s.fps > 0).map((s) => s.fps).sort((a, b) => a - b);
    // r03-roster：出来事と音のずれ（出来事ごとに、いちばん早く出た音で測る。音速の遅れをわざと足した遠い音は外す）
    let audioSync = null;
    if (withAudio) {
      await page.waitForTimeout(700);
      const log = await page.evaluate(() => window.__audioLog ?? null);
      if (log) {
        const byEvent = new Map();
        for (const e of log.entries.filter((x) => !x.dropped)) {
          const k = `${e.ev}@${e.t}`;
          const cur = byEvent.get(k);
          if (!cur || e.skewMs < cur.skewMs) byEvent.set(k, e);
        }
        const judged = [...byEvent.values()].filter((e) => e.prop === 0);
        const perType = {};
        for (const e of judged) (perType[e.ev] ??= []).push(e.skewMs);
        const q = (v, p) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];
        audioSync = {
          state: log.state,
          judged: judged.length,
          over50ms: judged.filter((e) => e.skewMs > 50).length,
          maxSkewMs: judged.length ? Math.max(...judged.map((e) => e.skewMs)) : null,
          perType: Object.fromEntries(Object.entries(perType).map(([k, v]) => [k, { n: v.length, max: Math.max(...v), p50: q(v, 0.5) }])),
          soundCounts: log.counts,
          missing: log.entries.filter((e) => e.dropped === 'missing').map((e) => e.sound).filter((x, i, a) => a.indexOf(x) === i),
        };
      }
    }
    const at = (q) => (fpsList.length ? fpsList[Math.min(fpsList.length - 1, Math.floor(q * fpsList.length))] : 0);
    const measure = withMeasure ? measureOf(await page.evaluate(() => window.__measureRec ?? [])) : null;
    const end = endState ?? last;
    const summary = {
      round,
      date: new Date().toISOString(),
      kind,
      creature: last?.creature?.id ?? creature ?? 'kurenai',
      speed,
      quality,
      browser: browser.browserType().name(),
      gpu,
      viewport: VIEWPORT,
      wallSeconds: Math.round((Date.now() - t0) / 100) / 10,
      finished: last?.phase === 'result',
      firstCollapseAt: last?.firstCollapseAt ?? null,
      endedAt: last?.endedAt ?? null,
      atEnd: end && {
        t: end.t,
        destruction: end.score.destruction,
        yen: end.score.yen,
        maxCombo: end.score.maxCombo,
        buildings: end.buildings,
      },
      fps: { p10: at(0.1), p50: at(0.5), min: fpsList[0] ?? 0 },
      // r03-roster：3体の違いの数字（空中の最高速・雷の跳ね・地割れの長さ・突進で傾けた棟数など。時間切れの瞬間の値）
      stats: end?.creature?.stats ?? null,
      audioSync,
      measure,
      events: last?.events ?? {},
      consoleErrors: errors,
      shots,
    };
    await writeFile(path.join(outDir, 'states.jsonl'), states.map((s) => JSON.stringify(s)).join('\n') + '\n');
    await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    const pct = ((summary.atEnd?.destruction ?? 0) * 100).toFixed(2);
    console.log(
      `自動プレイ(${kind}, ${speed}倍): 完走=${summary.finished} 結果の時刻=${summary.endedAt?.toFixed(2) ?? 'なし'}秒 最初の崩落=${summary.firstCollapseAt?.toFixed(1) ?? 'なし'}秒 3分での破壊率=${pct}% 最大連鎖=${summary.atEnd?.maxCombo ?? 0} 崩落=${summary.atEnd?.buildings.collapsed ?? 0}棟 fps p50=${summary.fps.p50} エラー=${errors.length}`,
    );
    if (summary.stats) console.log(`怪獣 ${summary.creature}: ${JSON.stringify(summary.stats)}`);
    if (measure)
      console.log(
        `測り: 3分の破壊率=${measure.destruction}% 怒りが初めて満タン=${measure.rageFullAt?.toFixed(1) ?? 'なし'}秒 大技=${measure.specials.length}回 ${measure.specials.map((u) => `${u.t.toFixed(1)}秒+${u.gain3.toFixed(2)}%`).join(' ')}`,
      );
    if (audioSync) console.log(`音のずれ（${audioSync.judged} 件）：最大 ${audioSync.maxSkewMs}ms・50ms 超え ${audioSync.over50ms} 件・鳴らない音 ${audioSync.missing.join('・') || 'なし'}`);
    console.log(`保存先: ${path.relative(ROOT, outDir)}/（スクショ ${shots.length} 枚・states.jsonl・summary.json）`);
    if (errors.length > 0 || (until === null && !summary.finished)) process.exitCode = 1;
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
