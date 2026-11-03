// OWNER: core
// 描画の段階の重さを、この Mac で数字にする（tasks 4.2。2026-11-03 スマホ対応）。実機（スマホの GPU）の値ではない。
//   A. 4段（?quality=high|mid|low|min）× 構図（courtyard・garden・gate）：?perf= の 360 コマで、コマの間隔 p50・p95、1コマの CPU 時間、
//      描画命令数、実際の描画の画素数（__perfResult.width×height）。条件を交互に回して3周（同じ時刻の負荷で比べる）。垂直同期は外す。
//      加えて GPU の時間（EXT_disjoint_timer_query_webgl2。下の gpuTimerScript）。この Mac では間隔が CPU で決まり、段の差が間隔に出にくいため。
//   B. 影・ブルームを切った場合（min 段）：ビルドの時だけ書き換えた版（下の VARIANTS）を作って、同じ形で測る。段階には入れない（入れるかは本人が決める）。
//   C. 自動の引き下げ：?touch=1&adaptive=1（自動操作でも引き下げを許す）で開き、CDP の Emulation.setCPUThrottlingRate で遅くして、
//      window.__quality.history() に降下が記録されるか。遅くしないとき・?quality= を付けたときは降下しないか。垂直同期は外さない。
//   端末は 844×390・画素比2・hasTouch・isMobile。各段の画素比の上限（1.5・1.25・1・0.75）は 2 より小さいので、画素比3の端末でも描く画素数は同じ。
//   負荷平均（uptime）を測る前後で残す（機械の負荷で何倍にも伸びるため）。
//
//   node tools/quality-bench.mjs a3                     全部（A・B・C）
//   S. 見比べの撮影：min 段の各版（base・noshadow・nobloom・両方）と、4段（base）を ?shot=<構図> で撮る（.captures/<周>/quality-shots/）。
//   --parts A,B,C,S  --spots courtyard,garden,gate  --rounds 3  --observe 20（C の観察秒）  --port 5408  --no-build
// 出力：.captures/<周>/quality-bench-<parts>.json と、同じ場所の .md（表）。1回の実行が長いので、A・B・C を分けて流せる。
// 配信は自前の小さな静的サーバー（1つのポートで版ごとに /<版>/ の下へ出す）。終わりに必ず閉じる。
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { ROOT, parseArgs } from './core/harness.mjs';
import { launchArgs, resolveBrowser } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const round = String(args._[0] ?? 'scratch');
const port = Number(args.port ?? 5408);
const parts = String(args.parts ?? 'A,B,C,S').split(',');
const spots = String(args.spots ?? 'courtyard,garden,gate').split(',');
const rounds = Math.max(1, Number(args.rounds ?? 3));
const observeSec = Math.max(8, Number(args.observe ?? 20));
const gpuTiming = String(args.gpu ?? '1') !== '0';
const VIEWPORT = { width: 844, height: 390 };
const DPR = 2;
const TIERS = ['high', 'mid', 'low', 'min'];

/** ビルドの時だけ書き換える版。from が見つからなければ止める（黙って同じものを測らない）。 */
const VARIANTS = {
  base: [],
  noshadow: [{ file: 'src/art/render/renderer.ts', from: 'renderer.shadowMap.enabled = true;', to: 'renderer.shadowMap.enabled = false;' }],
  nobloom: [{ file: 'src/art/render/post.ts', from: 'composer.addPass(new EffectPass(camera, bloom, grade));', to: 'composer.addPass(new EffectPass(camera, grade));' }],
};
VARIANTS.noshadow_nobloom = [...VARIANTS.noshadow, ...VARIANTS.nobloom];

function loadAvg() {
  const m = execSync('uptime').toString().match(/load averages?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

const outDirOf = (v) => `dist-bench-${v}`;

async function buildVariant(name) {
  const edits = VARIANTS[name];
  const done = new Set();
  const prev = process.env.KAGE_PAGES;
  process.env.KAGE_PAGES = 'index';
  try {
    await build({
      configFile: path.join(ROOT, 'vite.config.ts'),
      root: ROOT,
      base: './',
      logLevel: 'warn',
      build: { outDir: outDirOf(name), emptyOutDir: true },
      plugins: [
        {
          name: 'kg-bench-variant',
          enforce: 'pre',
          transform(code, id) {
            let out = code;
            edits.forEach((e, i) => {
              if (!id.endsWith(e.file)) return;
              if (!out.includes(e.from)) throw new Error(`${name}: ${e.file} に「${e.from}」が無い`);
              out = out.replace(e.from, e.to);
              done.add(i);
            });
            return out === code ? null : out;
          },
        },
      ],
    });
  } finally {
    if (prev === undefined) delete process.env.KAGE_PAGES;
    else process.env.KAGE_PAGES = prev;
  }
  if (done.size !== edits.length) throw new Error(`${name}: 書き換えが ${done.size}/${edits.length} しか当たらない`);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

/** /<版>/… を dist-bench-<版>/… から返す。/<版>/shared/share.* は隣の day-082-kageuchi/shared/ から（e2e/fixtures.ts と同じ）。 */
function startServer() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const [, variant, ...rest] = u.pathname.split('/');
    let rel = decodeURIComponent(rest.join('/')) || 'index.html';
    let base = path.join(ROOT, outDirOf(variant));
    if (/^shared\/share\.(css|js)$/.test(rel)) {
      base = path.join(ROOT, '..', 'shared');
      rel = rel.slice('shared/'.length);
    }
    const file = path.join(base, rel);
    if (!VARIANTS[variant] || !file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) }));
  });
}

async function newPhone(browser) {
  return browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
}

/**
 * GPU の時間（EXT_disjoint_timer_query_webgl2）：ページの requestAnimationFrame を包み、ゲームの描画面（#game）の WebGL2 で
 * 1回の rAF の処理の間に GPU が使った時間を測って window.__gpuTimes（ms）に貯める。垂直同期を外しても、この Mac では
 * 1コマの間隔が CPU で決まり、GPU の差が間隔に出ないため（--gpu 0 で切れる）。結果は数コマ遅れて届く。GPU_DISJOINT のコマは捨てる。
 */
function gpuTimerScript() {
  const origGet = HTMLCanvasElement.prototype.getContext;
  let gl = null;
  let ext = null;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = origGet.call(this, type, attrs);
    if (!gl && type === 'webgl2' && ctx && this.id === 'game') {
      gl = ctx;
      ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__gpuTimerOk = !!ext;
    }
    return ctx;
  };
  const pending = [];
  const times = [];
  window.__gpuTimes = times;
  let active = false;
  const poll = () => {
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      if (!disjoint) times.push(ns / 1e6);
      gl.deleteQuery(q);
      pending.shift();
    }
  };
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    origRaf((t) => {
      if (!gl || !ext || active) return cb(t);
      poll();
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      active = true;
      try {
        return cb(t);
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        active = false;
        pending.push(q);
      }
    });
}

/** ?perf= の1回分。 */
async function perfOnce(browser, url, label) {
  const ctx = await newPhone(browser);
  try {
    const page = await ctx.newPage();
    if (gpuTiming) await page.addInitScript(gpuTimerScript);
    const errors = [];
    const external = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => !r.url().startsWith(`http://127.0.0.1:${port}/`) && !/^(data|blob):/.test(r.url()) && external.push(r.url()));
    const loadBefore = loadAvg();
    await page.goto(url);
    await page.waitForFunction(() => window.__perfResult !== undefined || typeof window.__appError === 'string', null, { timeout: 240_000, polling: 250 });
    const res = await page.evaluate(() => {
      // 描画したコマ（GPU 0.05ms 超）の後ろ 360 個
      const g = (window.__gpuTimes ?? []).filter((x) => x > 0.05).slice(-360).sort((a, b) => a - b);
      const pct = (q) => (g.length ? Math.round(g[Math.min(g.length - 1, Math.floor(q * g.length))] * 100) / 100 : null);
      return { ...(window.__perfResult ?? { error: window.__appError }), tier: window.__quality?.id(), pr: window.__quality?.pixelRatio(), ao: window.__quality?.ao(), gpuOk: window.__gpuTimerOk ?? false, gpuN: g.length, gpuP50: pct(0.5), gpuP95: pct(0.95) };
    });
    const loadAfter = loadAvg();
    const r = { label, ...res, loadBefore, loadAfter, errors, external };
    console.log(
      `${label.padEnd(30)} p50=${String(res.p50).padStart(6)} p95=${String(res.p95).padStart(6)} cpu50=${String(res.cpuP50).padStart(5)} gpu50=${String(res.gpuP50).padStart(5)} gpu95=${String(res.gpuP95).padStart(5)} calls=${String(res.calls).padStart(4)} ${res.width}×${res.height} pr=${res.pr} ao=${res.ao} 負荷 ${loadBefore?.[0]}→${loadAfter?.[0]}${errors.length ? ` エラー${errors.length}` : ''}`,
    );
    return r;
  } finally {
    await ctx.close();
  }
}

/** 条件を交互に3周。order は周ごとに回す（いつも同じ順だと、先に測る方が有利・不利になる）。 */
async function interleaved(browser, conds, spotList) {
  const out = [];
  for (let k = 0; k < rounds; k++) {
    for (const spot of spotList) {
      const shift = (k + spotList.indexOf(spot)) % conds.length;
      const order = [...conds.slice(shift), ...conds.slice(0, shift)];
      for (const c of order) out.push({ ...(await perfOnce(browser, c.url(spot), `${k + 1}周 ${spot} ${c.name}`)), round: k + 1, spot, cond: c.name });
    }
  }
  return out;
}

const median = (a) => {
  const s = a.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function summarize(rows, conds, spotList, baseName) {
  const table = [];
  for (const spot of spotList) {
    const baseP50 = median(rows.filter((r) => r.spot === spot && r.cond === baseName).map((r) => r.p50));
    const baseGpu = median(rows.filter((r) => r.spot === spot && r.cond === baseName).map((r) => r.gpuP50));
    for (const c of conds) {
      const rs = rows.filter((r) => r.spot === spot && r.cond === c.name);
      const p50 = median(rs.map((r) => r.p50));
      table.push({
        spot,
        cond: c.name,
        n: rs.length,
        p50,
        p95: median(rs.map((r) => r.p95)),
        cpuP50: median(rs.map((r) => r.cpuP50)),
        cpuP95: median(rs.map((r) => r.cpuP95)),
        gpuP50: median(rs.map((r) => r.gpuP50)),
        gpuP95: median(rs.map((r) => r.gpuP95)),
        calls: median(rs.map((r) => r.calls)),
        size: rs[0] ? `${rs[0].width}×${rs[0].height}` : '-',
        pr: rs[0]?.pr,
        ao: rs[0]?.ao,
        vsBase: baseP50 && p50 ? Math.round((p50 / baseP50) * 100) : null,
        gpuVsBase: baseGpu && median(rs.map((r) => r.gpuP50)) ? Math.round((median(rs.map((r) => r.gpuP50)) / baseGpu) * 100) : null,
        p50s: rs.map((r) => r.p50),
        errors: rs.reduce((n, r) => n + r.errors.length, 0),
        external: rs.reduce((n, r) => n + r.external.length, 0),
      });
    }
  }
  return table;
}

function mdTable(table, baseLabel) {
  const lines = [
    `| 構図 | 条件 | 画素（実際の描画） | 画素比 | AO | 間隔 p50 ms | 間隔 p95 ms | CPU p50 ms | CPU p95 ms | GPU p50 ms | GPU p95 ms | 描画命令 | 間隔 p50 の比（${baseLabel}=100） | GPU p50 の比（${baseLabel}=100） | 各周の間隔 p50 |`,
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const t of table) {
    lines.push(`| ${t.spot} | ${t.cond} | ${t.size} | ${t.pr} | ${t.ao ? 'あり' : 'なし'} | ${t.p50} | ${t.p95} | ${t.cpuP50} | ${t.cpuP95} | ${t.gpuP50 ?? '-'} | ${t.gpuP95 ?? '-'} | ${t.calls} | ${t.vsBase ?? '-'} | ${t.gpuVsBase ?? '-'} | ${t.p50s.join(' / ')} |`);
  }
  return lines.join('\n');
}

/** C：自動の引き下げ。 */
async function adaptiveOnce(browser, server, { name, rate, query }) {
  const ctx = await newPhone(browser);
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const cdp = await ctx.newCDPSession(page);
    const loadBefore = loadAvg();
    await page.goto(`${server.url}/base/?touch=1&autostart=1&god=1&seed=1${query}`);
    await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 120_000 });
    // 表示の準備（ここで自動の引き下げが始まる）を待ち、その時刻を覚える。準備の後から遅くする（準備の時間を遅くしないため）
    await page.waitForFunction(
      () => {
        if (!window.__viewReady) return false;
        window.__benchReadyAt ??= performance.now();
        return true;
      },
      null,
      { timeout: 180_000, polling: 'raf' },
    );
    if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const throttledAt = await page.evaluate(() => performance.now());
    // コマの間隔を集める（観察の間だけ）
    await page.evaluate(() => {
      const iv = [];
      window.__benchIv = iv;
      let last = performance.now();
      const loop = (t) => {
        iv.push([t, t - last]);
        last = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    // 観察：ゲームの時刻でなく実時間（降下の判定は performance.now() で動くため）
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < observeSec * 1000) {
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(() => ({ at: performance.now(), tier: window.__quality.tier() })));
    }
    if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const info = await page.evaluate(() => {
      const all = window.__benchIv.slice(1);
      const hist = window.__quality.history();
      const pctOf = (a, q) => {
        const s = a.slice().sort((x, y) => x - y);
        return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10 : null;
      };
      const iv = all.map(([, d]) => d);
      const pct = (q) => pctOf(iv, q);
      // 最初の降下より前（降下が無ければ全部）のコマの間隔
      const firstAt = hist[0]?.at ?? Infinity;
      const before = all.filter(([t]) => t < firstAt).map(([, d]) => d);
      return {
        beforeFirst: { frames: before.length, p50: pctOf(before, 0.5), p90: pctOf(before, 0.9) },
        readyAt: window.__benchReadyAt,
        adaptive: window.__quality.adaptive(),
        explicit: window.__quality.explicit(),
        tierEnd: window.__quality.id(),
        pixelRatioEnd: window.__quality.pixelRatio(),
        history: window.__quality.history(),
        frames: iv.length,
        p50: pct(0.5),
        p90: pct(0.9),
        screen: window.__state?.screen,
      };
    });
    const loadAfter = loadAvg();
    const steps = info.history.map((h) => ({ ...h, sinceReady: Math.round(h.at - info.readyAt), sinceThrottle: Math.round(h.at - throttledAt) }));
    const r = { name, rate, query, ...info, throttledAt, steps, samples, loadBefore, loadAfter, errors };
    console.log(
      `${name.padEnd(28)} 遅さ×${rate} 自動=${info.adaptive} 指定=${info.explicit} 終わり=${info.tierEnd}（画素比 ${info.pixelRatioEnd}） 降下=${steps.map((s) => `${s.from}→${s.to}@${s.sinceReady}ms`).join(', ') || 'なし'} 降下前 p50=${info.beforeFirst.p50} p90=${info.beforeFirst.p90}・全体 p50=${info.p50} p90=${info.p90}ms 負荷 ${loadBefore?.[0]}→${loadAfter?.[0]}${errors.length ? ` エラー${errors.length}` : ''}`,
    );
    return r;
  } finally {
    await ctx.close();
  }
}

async function main() {
  const outDir = path.join(ROOT, '.captures', round);
  await mkdir(outDir, { recursive: true });
  const pick = resolveBrowser();
  if (pick.name !== 'chromium') throw new Error(`Chromium が要る（CDP の CPU の遅さと、垂直同期を外す引数）。いま ${pick.name}（${pick.reason}）`);
  const needVariants = ['base', ...(parts.includes('B') || parts.includes('S') ? ['noshadow', 'nobloom', 'noshadow_nobloom'] : [])];
  if (!args['no-build']) for (const v of needVariants) await buildVariant(v);
  const server = await startServer();
  const result = { round, date: new Date().toISOString(), viewport: VIEWPORT, deviceScaleFactor: DPR, rounds, spots, loadStart: loadAvg() };
  const md = [];
  let uncapped = null;
  let capped = null;
  try {
    uncapped = await chromium.launch({ args: launchArgs('chromium', { uncapped: true }) });
    result.browser = `Chromium ${uncapped.version()}`;
    if (parts.includes('A')) {
      console.log('== A. 4段 × 構図（?perf=、垂直同期なし）');
      const conds = TIERS.map((t) => ({ name: t, url: (spot) => `${server.url}/base/?autostart=1&god=1&seed=1&touch=1&quality=${t}&perf=${spot}` }));
      const rows = await interleaved(uncapped, conds, spots);
      result.gpu = rows.find((r) => r.gpu)?.gpu;
      result.tiers = { rows, table: summarize(rows, conds, spots, 'high') };
      md.push('### A. 4段 × 構図', '', mdTable(result.tiers.table, 'high'), '');
    }
    if (parts.includes('B')) {
      console.log('== B. min 段で影・ブルームを切る（ビルドの時だけ書き換えた版）');
      const conds = Object.keys(VARIANTS).map((v) => ({ name: v, url: (spot) => `${server.url}/${v}/?autostart=1&god=1&seed=1&touch=1&quality=min&perf=${spot}` }));
      const rows = await interleaved(uncapped, conds, spots);
      result.gpu ??= rows.find((r) => r.gpu)?.gpu;
      result.fx = { rows, table: summarize(rows, conds, spots, 'base') };
      md.push('### B. min 段で影・ブルームを切る', '', mdTable(result.fx.table, 'base'), '');
    }
    if (parts.includes('S')) {
      console.log('== S. 見比べの撮影（?shot=）');
      const shotDir = path.join(outDir, 'quality-shots');
      await mkdir(shotDir, { recursive: true });
      const list = [...Object.keys(VARIANTS).map((v) => ({ v, q: 'min' })), ...TIERS.filter((t) => t !== 'min').map((t) => ({ v: 'base', q: t }))];
      result.shots = [];
      for (const spot of spots) {
        for (const { v, q } of list) {
          const ctx = await newPhone(uncapped);
          try {
            const page = await ctx.newPage();
            const errors = [];
            page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.goto(`${server.url}/${v}/?shot=${spot}&touch=1&quality=${q}`);
            await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 180_000, polling: 100 });
            const f = path.join(shotDir, `${spot}-${q}-${v}.png`);
            await page.screenshot({ path: f });
            result.shots.push({ file: path.relative(ROOT, f), errors });
            console.log(`  ${path.relative(ROOT, f)}${errors.length ? ` エラー${errors.length}` : ''}`);
          } finally {
            await ctx.close();
          }
        }
      }
    }
    await uncapped.close();
    uncapped = null;
    if (parts.includes('C')) {
      console.log(`== C. 自動の引き下げ（?touch=1&adaptive=1、垂直同期あり、観察 ${observeSec} 秒）`);
      capped = await chromium.launch({ args: launchArgs('chromium') });
      const cases = [
        { name: '遅くしない', rate: 1, query: '&adaptive=1' },
        { name: 'CPU 4倍遅く', rate: 4, query: '&adaptive=1' },
        { name: 'CPU 8倍遅く', rate: 8, query: '&adaptive=1' },
        { name: 'CPU 16倍遅く', rate: 16, query: '&adaptive=1' },
        // 対照：16倍なら上で必ず降下する遅さ。それでも ?quality= 指定と、adaptive なし（自動操作）では下げない
        { name: 'CPU 16倍遅く・quality=mid 指定', rate: 16, query: '&adaptive=1&quality=mid' },
        { name: 'CPU 16倍遅く・adaptive なし', rate: 16, query: '' },
      ];
      result.adaptive = [];
      for (const c of cases) result.adaptive.push(await adaptiveOnce(capped, server, c));
      const lines = ['| 条件 | 自動の引き下げ | 指定 | 降下（段の番号・表示の準備からの ms） | 終わりの段（画素比） | 最初の降下までのコマの間隔 p50 / p90 ms | 観察中ぜんぶの p50 / p90 ms | 負荷平均（前→後） |', '|---|---|---|---|---|---|---|---|'];
      for (const a of result.adaptive) {
        lines.push(
          `| ${a.name} | ${a.adaptive ? '働く' : '働かない'} | ${a.explicit ? 'あり' : 'なし'} | ${a.steps.map((s) => `${s.from}→${s.to} @${s.sinceReady}`).join('、') || 'なし'} | ${a.tierEnd}（${a.pixelRatioEnd}） | ${a.beforeFirst.p50} / ${a.beforeFirst.p90} | ${a.p50} / ${a.p90} | ${a.loadBefore?.[0]}→${a.loadAfter?.[0]} |`,
        );
      }
      md.push(`### C. 自動の引き下げ（観察 ${observeSec} 秒）`, '', ...lines, '');
    }
  } finally {
    await uncapped?.close();
    await capped?.close();
    await server.close();
  }
  result.loadEnd = loadAvg();
  const head = [
    `測った日時 ${result.date}・${result.browser ?? 'Chromium'}・GPU ${result.gpu ?? '（未取得）'}・${VIEWPORT.width}×${VIEWPORT.height}・画素比${DPR}・hasTouch・isMobile`,
    `負荷平均（1・5・15分）：始め ${result.loadStart?.join(' / ')} → 終わり ${result.loadEnd?.join(' / ')}`,
    '',
  ];
  await writeFile(path.join(outDir, `quality-bench-${parts.join('')}.json`), JSON.stringify(result, null, 2));
  await writeFile(path.join(outDir, `quality-bench-${parts.join('')}.md`), [...head, ...md].join('\n'));
  console.log(`保存先: ${path.relative(ROOT, outDir)}/quality-bench-${parts.join('')}.json・.md`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
