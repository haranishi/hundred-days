// OWNER: tools
// 音の検証（evals/audio.md の材料）：配る OGG を復号して測り、実行時の仕組みを書き出して確かめ、遊んで同期を測る。結果は .captures/<周>/audio/。
//   node tools/audio-render.mjs r00d                    全部（効果音・中身・BGM・書き出し・遊び3分）
//   --skip live,offline,sfx,bgm,content（飛ばす）  --secs 185（遊ぶ秒数）  --speed 1  --port 5334（書き出し用。遊びは +1）
//   --assets <道のり>  効果音・中身・BGM を別の置き場（前の周の写しなど）で測る（書き出しと遊びは public のまま）
//   --creature raiyoku  遊びの3分を、その怪獣で流す（r05-audio。結果は sync_<怪獣>.json と report.json の sync_<怪獣>）
//   --no-build  遊びの3分を、すでにある DR_OUT_DIR のビルドで流す
// 出るもの：sfx.json・content.json・bgm.json・scenarios.json・sync.json・report.json と、png/（スペクトログラム・波形・怪獣3体を並べた図）、wav/。
// content（r02-audio）：重さ（低域が1本の音に寄る度合い・250Hz〜2kHz の比率）、変化（包絡の相関）、咆哮（120Hz 未満・F1/F2 の動き）、怪獣3体の比べ。
// r05-audio：content に怪獣どうしの差（rosterDistances：メル64帯の平均スペクトルの差、怪獣どうし／変化どうし）、書き出しに曲の終わり（finale）、
// 遊びの3分に音ごとの落ちる割合（drops）と最後の大太鼓と時間切れのずれ（musicEnd）を足した。
// r06-audio：BGM の継ぎ目は、作業場所の WAV が今の曲のものか（目録の music.sourceSha1）を確かめ、違えば曲だけ作り直して比べる（前は 9/30 の古い WAV と比べていた）。
// 段階の切り替えが小節の頭かは、曲の記録の grid（端数の拍・一時停止・跳ぶ所で小節の頭がずれた記録）で数える。遊びの3分に、時間切れの前後 0.5 秒の大太鼓の数（endDrums）と、
// 曲の低い帯を引いていた割合と引き始めの回数（lowDuck）を足した。書き出しに finale_mix（曲＋結果の音）。
// 遊びは本番ビルド（DR_OUT_DIR）をプレビューで配り、GPU を使うブラウザ（tools/lib/browser.mjs）を「操作なしでも音が出る」設定で開く。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { ROOT, OUT_DIR, assertHardwareGpu, buildApp, launchBrowser, parseArgs, portFrom, startPreview } from './lib/harness.mjs';
import { ebur, loudnessTimeline, pool, sampleStats, seamExcessDb, seamStepDb, spectrogram, waveform } from './audio/lib/analyze.mjs';
import { contentPart } from './audio/lib/contentReport.mjs';
import { filt } from './audio/lib/dsp.mjs';
import { bandShares } from './audio/lib/fft.mjs';
import { decodeFile, writeWav } from './audio/lib/io.mjs';
import { integratedLufs, maxLoudness } from './audio/lib/loudness.mjs';

const args = parseArgs(process.argv.slice(2));
const round = String(args.round ?? args._[0] ?? 'scratch');
const skip = new Set(String(args.skip ?? '').split(',').filter(Boolean));
const creature = args.creature ? String(args.creature) : null;
const OUT = path.join(ROOT, '.captures', round, 'audio');
const AUDIO = path.resolve(ROOT, String(args.assets ?? path.join('public', 'assets', 'audio')));
const SR = 48000;
const r1 = (x) => Math.round(x * 10) / 10;
const rel = (p) => path.relative(ROOT, p);

/** 32bit 浮動小数の WAV（build.mjs が書いたもの）の左チャンネル。 */
function await_readWavLeft(file) {
  const b = readFileSync(file);
  const n = (b.length - 44) / 8;
  const l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = b.readFloatLE(44 + i * 8);
  return l;
}

async function sfxPart(manifest) {
  const items = Object.entries(manifest.sfx).flatMap(([bank, b]) => b.variants.map((v, i) => ({ bank, i, file: v.file, loop: b.loop })));
  const rows = await pool(items, 8, async (it) => {
    const src = path.join(AUDIO, it.file);
    const s = decodeFile(src);
    const png = path.join(OUT, 'png', 'sfx', `${it.bank.replace('/', '__')}_${it.i + 1}.png`);
    await spectrogram(src, png, { width: 900, height: 320 });
    return { bank: it.bank, variant: it.i + 1, file: it.file, loop: it.loop, ...(await ebur(src)), ...sampleStats(s), png: rel(png) };
  });
  const banks = {};
  for (const r of rows) (banks[r.bank] ??= []).push(r);
  const summary = Object.entries(banks).map(([bank, vs]) => ({
    bank,
    variants: vs.length,
    momentaryMaxLufs: `${Math.min(...vs.map((v) => v.momentaryMaxLufs))}〜${Math.max(...vs.map((v) => v.momentaryMaxLufs))}`,
    truePeakMaxDbtp: Math.max(...vs.map((v) => v.truePeakDbtp)),
    clipped: vs.reduce((a, v) => a + v.clippedSamples, 0),
    tailSeconds: Math.max(...vs.map((v) => v.tailSeconds)),
    onsetMsMax: Math.max(...vs.map((v) => v.onsetMs)),
    bands: vs[0].bands,
  }));
  await writeFile(path.join(OUT, 'sfx.json'), JSON.stringify({ summary, files: rows }, null, 1));
  return { files: rows.length, worstTruePeakDbtp: Math.max(...rows.map((r) => r.truePeakDbtp)), clipped: rows.reduce((a, r) => a + r.clippedSamples, 0), summary };
}

const pearson = (a, b) => {
  const n = Math.min(a.length, b.length);
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) (sa += a[i]), (sb += b[i]);
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db || 1);
};

/**
 * r06-audio：BGM の継ぎ目を比べる WAV（エンコード前の塊）の置き場。指摘「道具が .captures/_audio-work に残った 9/30 の古い WAV と比べていた」
 * 作業場所（--seam-work で変えられる）の WAV の指紋が目録の music.sourceSha1 と全部合えばそれを使う。合わなければ、同じ種で曲だけ作り直し
 * （tools/audio/build.mjs --music-only。.captures/_audio-work-rebuild/ に置く）、指紋が合えばそちらを使う。どちらも合わなければ比べない（null）。
 * 目録に指紋が無い版（r05 まで）は、作り直した OGG が配る OGG とバイト単位で同じときだけ作り直した WAV を使う。
 */
function seamReference(manifest) {
  const m = manifest.music;
  const sha = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');
  const want = m.sourceSha1;
  const wavOf = (dir, f) => path.join(dir, f.replace(/\.ogg$/, '.wav'));
  const fresh = (dir) => m.stems.every((s) => m.chunks[s].every((f, c) => existsSync(wavOf(dir, f)) && (want ? sha(wavOf(dir, f)) === want[s][c] : false)));
  const sameOgg = (dir) => m.stems.every((s) => m.chunks[s].every((f) => existsSync(path.join(dir, f)) && sha(path.join(dir, f)) === sha(path.join(AUDIO, f))));
  const work = path.resolve(ROOT, String(args['seam-work'] ?? path.join('.captures', '_audio-work')));
  if (want && fresh(work)) return { dir: work, how: '作業場所の WAV（指紋が目録と一致）' };
  const rebuild = path.join(ROOT, '.captures', '_audio-work-rebuild');
  const rebuiltOut = path.join(rebuild, 'assets');
  const rebuiltWork = path.join(rebuild, 'work');
  const ok = () => (want ? fresh(rebuiltWork) : sameOgg(rebuiltOut));
  if (!(existsSync(rebuiltWork) && ok())) {
    console.log(`BGM の継ぎ目：作業場所の WAV が今の曲と違う（${rel(work)}）。同じ種（${manifest.seed}）で曲だけ作り直して比べます…`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'audio', 'build.mjs'), '--music-only', '--seed', String(manifest.seed), '--out', rebuiltOut, '--work', rebuiltWork], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) return { dir: null, how: '曲の作り直しに失敗したので比べない' };
  }
  if (ok()) return { dir: rebuiltWork, how: want ? '作り直した WAV（指紋が目録と一致）' : '作り直した WAV（OGG がバイト単位で一致）' };
  return { dir: null, how: '作り直しても今の曲と合わない（生成の作りが目録の版と違う）ので比べない' };
}

async function bgmPart(manifest) {
  const m = manifest.music;
  const pad = Math.round(m.pad * SR);
  const chunk = Math.round(m.chunkSeconds * SR);
  const stems = m.stems.map((name) => {
    const n = chunk * m.chunks[name].length;
    const s = { l: new Float32Array(n), r: new Float32Array(n) };
    m.chunks[name].forEach((f, k) => {
      const d = decodeFile(path.join(AUDIO, f));
      s.l.set(d.l.subarray(pad, pad + chunk), k * chunk);
      s.r.set(d.r.subarray(pad, pad + chunk), k * chunk);
    });
    return s;
  });
  // エンコード前の層（WAV の塊の中身）とつないだ復号を比べ、継ぎ目の乱れを測る。
  // r06-audio：比べる WAV は今の曲のものに限る（目録の music.sourceSha1 と指紋が合う WAV）。作業場所の WAV が古ければ、曲だけ作り直した WAV と比べる
  const ref = args.assets ? { dir: null, how: '別の置き場を測るときは比べない' } : seamReference(manifest);
  const bounds = Array.from({ length: m.chunks[m.stems[0]].length }, (_, k) => k * chunk);
  const barLen = Math.round(m.barSeconds * SR);
  const controls = Array.from({ length: m.bars }, (_, b) => b * barLen).filter((h) => h % chunk !== 0);
  const seams = {};
  const refCorr = {};
  for (const [k, name] of m.stems.entries()) {
    if (!ref.dir) {
      seams[name] = null;
      continue;
    }
    try {
      const orig = new Float32Array(stems[k].l.length);
      m.chunks[name].forEach((f, c) => {
        const buf = await_readWavLeft(path.join(ref.dir, f.replace(/\.ogg$/, '.wav')));
        orig.set(buf.subarray(pad, pad + chunk), c * chunk);
      });
      seams[name] = seamExcessDb(stems[k].l, orig, bounds, controls);
      refCorr[name] = Math.round(pearson(stems[k].l, orig) * 10000) / 10000;
    } catch {
      seams[name] = null;
    }
  }
  const stages = {};
  for (let k = 0; k < stems.length; k++) {
    const name = ['calm', 'rampage', 'peak'][k];
    const n = stems[0].l.length;
    const mix = { l: new Float32Array(n), r: new Float32Array(n) };
    for (let j = 0; j <= k; j++) for (let i = 0; i < n; i++) (mix.l[i] += stems[j].l[i]), (mix.r[i] += stems[j].r[i]);
    const wav = path.join(OUT, 'wav', `bgm_${name}.wav`);
    writeWav(wav, [mix.l, mix.r], SR, 32);
    const png = path.join(OUT, 'png', `bgm_${name}.png`);
    await spectrogram(wav, png, { width: 1800, height: 480, start: 30 });
    const steps = bounds.map((b) => seamStepDb(mix, b));
    const sections = m.sections.map((sec, i) => {
      const a = Math.round((sec.bar - 1) * m.barSeconds * SR);
      const b = Math.round(((m.sections[i + 1]?.bar ?? m.bars + 1) - 1) * m.barSeconds * SR);
      const seg = [mix.l.subarray(a, b), mix.r.subarray(a, b)];
      // r02-audio：区間の中の統合の音量と、2kHz より上の比率（段階を上げたときの同じ区間での上がり幅と明るさを見る）
      return { name: sec.name, fromBar: sec.bar, shortTermMaxLufs: r1(maxLoudness(seg).shortTermMax), integratedLufs: r1(integratedLufs(seg)), above2kPct: r1(bandShares(seg, SR, [2000], 8192)[1] * 100) };
    });
    stages[name] = { ...(await ebur(wav)), ...sampleStats(mix), loopSeamStepDb: steps[0], chunkSeamStepDbMax: Math.max(...steps.slice(1)), sections, wav: rel(wav), png: rel(png) };
  }
  // 同じ区間での上がり幅（静→暴、静→頂、LU）
  const rises = m.sections.map((sec, i) => ({ name: sec.name, calmToRampage: r1(stages.rampage.sections[i].integratedLufs - stages.calm.sections[i].integratedLufs), calmToPeak: r1(stages.peak.sections[i].integratedLufs - stages.calm.sections[i].integratedLufs), above2kPct: ['calm', 'rampage', 'peak'].map((k) => stages[k].sections[i].above2kPct) }));
  const out = { bpm: m.bpm, bars: m.bars, length: m.length, chunkSeconds: m.chunkSeconds, generatorReport: m.report, seamReference: { how: ref.how, dir: ref.dir ? rel(ref.dir) : null, decodedVsReferenceCorr: refCorr }, seams, stages, rises };
  await writeFile(path.join(OUT, 'bgm.json'), JSON.stringify(out, null, 1));
  const seamOf = (k) => seams[m.stems[['calm', 'rampage', 'peak'].indexOf(k)]];
  return { seamReference: out.seamReference, ...Object.fromEntries(Object.entries(stages).map(([k, s]) => [k, { integratedLufs: s.integratedLufs, truePeakDbtp: s.truePeakDbtp, lraLu: s.lraLu, seamExcessDbMax: seamOf(k)?.maxDb ?? null, seamExcessDbMedian: seamOf(k)?.medianDb ?? null, ordinaryDownbeatMaxDb: seamOf(k)?.controlMaxDb ?? null, loopSeamExcessDb: seamOf(k)?.perBoundaryDb[0] ?? null, rawStepAtLoopDb: s.loopSeamStepDb, clipped: s.clippedSamples, dcOffset: s.dcOffset, bands: s.bands, sections: s.sections }])), rises };
}

/** 書き出しのページを配る小さな配り手（/assets は public から、/upload は WAV の受け取り）。 */
function serveOffline(dir, port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ogg': 'audio/ogg' };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/upload') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      await writeFile(path.join(OUT, 'wav', path.basename(url.searchParams.get('name'))), Buffer.concat(chunks));
      res.end('ok');
      return;
    }
    const file = url.pathname.startsWith('/assets/') ? path.join(ROOT, 'public', url.pathname) : path.join(dir, url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) })));
}

/**
 * 段階の切り替え c が小節の頭か。r06-audio：曲の記録に grid（小節の頭の並びが変わった記録）があれば、切り替えの時刻に効いていた並びで数える
 * （指摘「端数の拍を足した所で小節の頭が後ろへずれるのに、最後の並びで数えて『小節に乗っていない』と出していた」）。grid の無い版は最後の並びで数える。
 */
function barAligned(c, songStart, bar, grid = null) {
  const anchors = (grid ?? []).filter((g) => g.from <= c.at + 1e-6);
  const s0 = anchors.length ? anchors[anchors.length - 1].songStart : songStart;
  const k = (c.at - s0) / bar;
  return Math.abs(k - Math.round(k)) < 1e-3;
}

/** 結果の音の中の大太鼓の時刻（鳴らし始めからの秒。tools/audio/sfx/ui.mjs の result と resultGong） */
const RESULT_DRUMS = { uiResult: [0, 0.625], uiResultGong: [] };

/**
 * r06-audio：時間切れの前後 0.5 秒に鳴る大太鼓の数。曲の最後の大太鼓（finalAt、3つの層が同時に打つので1つ）と、結果の音の中の大太鼓。
 * end は時間切れを受けた時刻（コンテキストの秒）、resultEntry は記録の session.end の音（start は実際に鳴らし始めた時刻）。
 */
function endDrums(end, finalAt, drum, resultEntry) {
  const drums = [];
  if (finalAt !== null && drum !== false) drums.push({ from: 'music', at: finalAt });
  if (resultEntry && !resultEntry.dropped) for (const o of RESULT_DRUMS[resultEntry.sound] ?? []) drums.push({ from: resultEntry.sound, at: resultEntry.start + o });
  const rows = drums.map((d) => ({ ...d, relSec: Math.round((d.at - end) * 1000) / 1000 }));
  return { within05: rows.filter((d) => Math.abs(d.relSec) <= 0.5).length, within1: rows.filter((d) => Math.abs(d.relSec) <= 1).length, drums: rows };
}

/**
 * r06-audio：曲の低い帯を引いていた割合と、引き始めの回数（from〜to の間）。記録の low: の引き（掛かり始めから「保持の終わり＋戻りの時定数」まで）をつなぐ。
 * 前の版（引きの終わりを記録していない版）は数えない（null）。
 */
function lowDuckSpans(ducks, from, to) {
  const spans = ducks.filter((d) => d.kind.startsWith('low:') && d.end !== undefined).map((d) => [Math.max(from, d.at), Math.min(to, d.end)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  if (!ducks.some((d) => d.kind.startsWith('low:') && d.end !== undefined) && ducks.some((d) => d.kind.startsWith('low:'))) return null;
  const merged = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const total = merged.reduce((acc, [a, b]) => acc + (b - a), 0);
  // 引いた出来事の数（区間の終わりが記録された引きだけ。書き出しで引きを止めた所は end が 0 で記録されるので数えない）
  const kinds = {};
  for (const d of ducks) if (d.kind.startsWith('low:') && d.end !== undefined && d.end > d.at) kinds[d.kind.slice(4)] = (kinds[d.kind.slice(4)] ?? 0) + 1;
  const near = ducks.filter((d) => d.kind === 'near:collapse');
  // 近い崩落の数と、全帯域の引きが掛かる大きさ（20000m³ を越える）・低い帯の引きが掛かる大きさ（55000m³ を越える）の数
  return { sharePct: r1((total / Math.max(1e-9, to - from)) * 100), onsets: merged.length, seconds: r1(total), triggers: kinds, nearCollapses: near.length, nearCollapsesOver20000: near.filter((d) => (d.v ?? 0) > 20000).length, nearCollapsesOver55000: near.filter((d) => (d.v ?? 0) > 55000).length };
}

async function offlinePart(port) {
  const dir = path.join(ROOT, `${OUT_DIR}-offline`);
  await build({ configFile: false, root: path.join(ROOT, 'tools', 'audio', 'offline'), base: './', publicDir: false, logLevel: 'warn', build: { outDir: dir, emptyOutDir: true, target: 'es2022', assetsDir: 'bundle' } });
  const server = await serveOffline(dir, port);
  const browser = await launchBrowser();
  const results = {};
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(server.url);
    await page.waitForFunction(() => Array.isArray(window.__scenarios), null, { timeout: 30000 });
    for (const name of await page.evaluate(() => window.__scenarios)) {
      const r = await page.evaluate((n) => window.__renderScenario(n), name);
      const wav = path.join(OUT, 'wav', `${name}.wav`);
      const s = decodeFile(wav);
      await spectrogram(wav, path.join(OUT, 'png', `scene_${name}.png`), { width: 1600, height: 420 });
      await waveform(wav, path.join(OUT, 'png', `scene_${name}_wave.png`));
      results[name] = { ...(await ebur(wav)), ...sampleStats(s), seconds: r.seconds, monster: r.monster, limiter: r.limiter, limiterMaxGrDb: r.limiterMaxGrDb, voices: r.voices, ducks: r.ducks, music: r.music, songStartBefore: r.songStartBefore, stageChanges: r.music.changes.map((c) => ({ ...c, alignedToBar: barAligned(c, r.music.songStart, 2.5, r.music.grid) })), timeline: loudnessTimeline(s, 1), played: r.entries.filter((e) => !e.dropped).length, dropped: r.entries.filter((e) => e.dropped).length, missing: r.entries.filter((e) => e.dropped === 'missing').map((e) => e.sound), entries: r.entries };
    }
    // 空間：同じ崩落を4つの距離で。窓ごとの大きさ・遅れ・左右・高域
    const sp = results.spatial;
    if (sp) {
      const s = decodeFile(path.join(OUT, 'wav', 'spatial.wav'));
      sp.windows = sp.entries.filter((e) => e.ev === 'building.collapse' && !e.dropped).map((e) => {
        const a = Math.round(e.t * SR);
        const b = Math.min(s.l.length, a + 6.5 * SR);
        let peak = 0;
        let el = 0;
        let er = 0;
        for (let i = a; i < b; i++) (peak = Math.max(peak, Math.abs(s.l[i]), Math.abs(s.r[i]))), (el += s.l[i] ** 2), (er += s.r[i] ** 2);
        // 立ち上がり：その窓の最大の -20dB を初めて超えた所（遠い音は音速の遅れのぶん後ろに来るはず）
        let first = b;
        for (let i = a; i < b; i++) if (Math.max(Math.abs(s.l[i]), Math.abs(s.r[i])) > peak * 0.1) { first = i; break; }
        const seg = { l: s.l.subarray(a, b), r: s.r.subarray(a, b) };
        const st = sampleStats(seg);
        return { t: e.t, sound: e.sound, distance: e.distance, expectedDelayMs: Math.round(e.prop * 1000), measuredOnsetMs: Math.round(((first - a) / SR) * 1000), peakDb: r1(20 * Math.log10(peak || 1e-9)), momentaryMaxLufs: st.momentaryMaxLufs, rightMinusLeftDb: r1(10 * Math.log10((er + 1e-12) / (el + 1e-12))), highShare: r1((st.bands[3] + st.bands[4]) * 100) };
      });
    }
    // 続く音と細かい音が曲の上に出ているか（r02-audio）：効果音だけ・曲だけを同じ筋書きで書き出し、同じ窓の音量を比べる
    if (results.levels && results.levels_music) {
      const fx = decodeFile(path.join(OUT, 'wav', 'levels.wav'));
      const mu2 = decodeFile(path.join(OUT, 'wav', 'levels_music.wav'));
      const win = (s2, a, b) => [s2.l.subarray(Math.round(a * SR), Math.round(b * SR)), s2.r.subarray(Math.round(a * SR), Math.round(b * SR))];
      const cmp = (label, a, b, how = 'integrated') => {
        const f = how === 'integrated' ? integratedLufs(win(fx, a, b)) : maxLoudness(win(fx, a, b)).momentaryMax;
        const g = integratedLufs(win(mu2, a, b));
        return { label, window: [a, b], sfxLufs: r1(f), musicLufs: r1(g), overMusicLu: r1(f - g), measure: how };
      };
      results.levels.overMusic = [
        cmp('ブレスの持続（曲を 2.5dB 引いた状態）', 6, 10),
        cmp('燃える街の下地（1棟・約50m）', 14, 17),
        cmp('燃える街の下地（8棟・40〜120m）', 21, 25),
        cmp('空の風（全速 60m/s）', 29, 33),
        cmp('ひび（45m・5回、瞬時の最大）', 35, 39.5, 'momentary'),
      ];
    }
    // 一時停止で曲の時計が止まるか（r02-audio）：止めていた長さだけ曲の頭がずれ、戻った位置が止めた位置と同じか
    if (results.pause) {
      const pz = results.pause;
      const p0 = pz.music.pauses?.[0];
      if (p0) {
        const heldSec = p0.resumedAt - p0.at;
        pz.clock = { pausedAtSec: r1(p0.at), resumedAtSec: r1(p0.resumedAt ?? NaN), songPosAtPause: Math.round(p0.pos * 1000) / 1000, heldSec: Math.round(heldSec * 1000) / 1000, songStartShiftSec: Math.round((pz.music.songStart - pz.songStartBefore) * 1000) / 1000, positionAtEnd: Math.round(pz.music.position * 1000) / 1000, expectedPositionAtEnd: Math.round((pz.seconds - pz.songStartBefore - heldSec) * 1000) / 1000 };
      }
    }
    // r05-audio：曲の終わり。記録の最後の大太鼓の時刻と時間切れのずれと、書き出しで本当にそこに大太鼓が鳴ったか
    // （大太鼓の基音は 57Hz なので 120Hz の低域通過に通し、記録の時刻の前 80ms と後 80ms の大きさの差を見る。数 dB 上がれば、そこが大太鼓の頭）
    const fin = results.finale;
    if (fin) {
      const s = decodeFile(path.join(OUT, 'wav', 'finale.wav'));
      const ce = fin.music.cutToEnd;
      const at = fin.music.finalAt ?? ce?.finalAt ?? null;
      let jump = null;
      if (at !== null) {
        const lo = new Float32Array(s.l.length);
        for (let i = 0; i < lo.length; i++) lo[i] = 0.5 * (s.l[i] + s.r[i]);
        filt(lo, [['lp', 120, 0.7], ['lp', 120, 0.7]]);
        const lv = (a, b) => {
          let e = 0;
          const i0 = Math.max(0, Math.round(a * SR));
          const i1 = Math.min(lo.length, Math.round(b * SR));
          for (let k = i0; k < i1; k++) e += lo[k] * lo[k];
          return 10 * Math.log10(e / Math.max(1, i1 - i0) + 1e-12);
        };
        jump = r1(lv(at + 0.01, at + 0.09) - lv(at - 0.09, at - 0.01));
      }
      fin.endAlign = { sessionEndAt: ce?.sessionEndAt ?? null, finalAt: at, offsetSec: ce && at !== null ? Math.round((at - ce.sessionEndAt) * 1000) / 1000 : null, extensionBars: fin.music.extensionBars ?? 0, cut: ce?.cut ?? null, skippedSeconds: ce?.skippedSeconds ?? null, lowBandJumpAtFinalDb: jump };
    }
    // r06-audio：時間切れの瞬間（曲＋結果の音）。曲の最後の大太鼓の時刻と、結果の音の鳴らし方（記録）から、前後 0.5 秒の大太鼓を数える。
    // 書き出しの音から直接は数えない（終わりの小節の太鼓の刻みも低い帯に入り、結果の音を足すと全体の制限器が曲の大きさも動かし、
    // 銅鑼の倍音のうなりも低い帯を揺らすため）。結果の音の中の大太鼓の時刻は、作り（tools/audio/sfx/ui.mjs の result・resultGong）から RESULT_DRUMS に書いた
    const fm = results.finale_mix;
    if (fm) {
      const ce = fm.music.cutToEnd;
      const end = ce?.sessionEndAt ?? fm.music.result?.sessionEndAt ?? null;
      const at = fm.music.finalAt ?? ce?.finalAt ?? null;
      const entry = fm.entries.find((e) => e.ev === 'session.end');
      if (end !== null) fm.endAlign = { sessionEndAt: end, finalAt: at, offsetSec: at !== null ? Math.round((at - end) * 1000) / 1000 : null, result: fm.music.result ?? null, resultSound: entry?.sound ?? null, resultStartRelSec: entry ? Math.round((entry.start - end) * 1000) / 1000 : null, endDrums: endDrums(end, at, ce?.drum, entry) };
    }
    // r05-audio：低い帯の引きだけの効き目。引きあり（lowduck）と引きなし（lowduck_off）の書き出しの、63Hz と 400Hz の 1/3 オクターブの差（出来事の 0.3〜1.8 秒後）
    if (results.lowduck && results.lowduck_off) {
      const on = decodeFile(path.join(OUT, 'wav', 'lowduck.wav'));
      const off = decodeFile(path.join(OUT, 'wav', 'lowduck_off.wav'));
      const third = (s2, fc) => {
        const m = new Float32Array(s2.l.length);
        for (let i = 0; i < m.length; i++) m[i] = 0.5 * (s2.l[i] + s2.r[i]);
        return filt(m, [['bp', fc, 4.32], ['bp', fc, 4.32]]);
      };
      const lvl = (y, a, b) => {
        let e = 0;
        const i0 = Math.round(a * SR);
        const i1 = Math.round(b * SR);
        for (let i = i0; i < i1; i++) e += y[i] * y[i];
        return 10 * Math.log10(e / (i1 - i0) + 1e-20);
      };
      const bands = Object.fromEntries([63, 400].map((fc) => [fc, [third(on, fc), third(off, fc)]]));
      results.lowduck.lowBandDuck = [['重い着地', 10], ['近い崩落', 20], ['咆哮', 30]].map(([label, t]) => ({ label, at: t, db63: r1(lvl(bands[63][0], t + 0.3, t + 1.8) - lvl(bands[63][1], t + 0.3, t + 1.8)), db400: r1(lvl(bands[400][0], t + 0.3, t + 1.8) - lvl(bands[400][1], t + 0.3, t + 1.8)) }));
    }
    // r06-audio：遊びの記録の忙しい1分を、今の決まりと r05 の決まりで書き出した2つ。低い帯を引いていた割合と引き始めの回数（記録の low: の区間から）
    for (const k of ['lowduck_replay', 'lowduck_replay_r05']) {
      const r = results[k];
      if (r) r.lowDuck = lowDuckSpans(r.ducks ?? [], 1, r.seconds - 5);
    }
    // 引き：曲だけの書き出しで、引いた瞬間の前後の大きさ（400ms の窓）
    const mu = results.session_music;
    if (mu) {
      const s = decodeFile(path.join(OUT, 'wav', 'session_music.wav'));
      const mom = (t) => {
        const a = Math.max(0, Math.round(t * SR));
        return r1(maxLoudness([s.l.subarray(a, a + 0.4 * SR), s.r.subarray(a, a + 0.4 * SR)]).momentaryMax);
      };
      mu.duckDepths = mu.ducks.map((d) => ({ kind: d.kind, at: d.at, beforeLufs: mom(d.at - 0.6), duringLufs: mom(d.at + 0.35), dropDb: r1(mom(d.at + 0.35) - mom(d.at - 0.6)), afterLufs: mom(d.at + 4) }));
    }
    for (const r of Object.values(results)) {
      delete r.entries;
      delete r.music;
    }
    results.pageErrors = errors;
  } finally {
    await browser.close();
    await server.close();
  }
  await writeFile(path.join(OUT, 'scenarios.json'), JSON.stringify(results, null, 1));
  return results;
}

async function livePart(port, secs, speed) {
  // --no-build：すでにある DR_OUT_DIR のビルドで流す（前の版を先にビルドしておき、作業中の変更を混ぜずに測るため）
  if (!args['no-build']) buildApp();
  const server = await startPreview(port);
  const browser = await launchBrowser({ autoplay: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${server.url}/?playtest=basic&speed=${speed}&q=low${creature ? `&creature=${creature}` : ''}`);
    await page.waitForFunction(() => window.__state !== undefined || typeof window.__appError === 'string', null, { timeout: 120000 });
    assertHardwareGpu(await page.evaluate(() => window.__app?.gpu ?? 'unknown'));
    const t0 = Date.now();
    // 時間切れの瞬間の状態（結果の後も街は崩れ続けるので、遊びの数字はこの瞬間のもの。r06-audio）
    let endState = null;
    while (Date.now() - t0 < secs * 1000) {
      const s = await page.evaluate(() => window.__state);
      if (!endState && s.phase === 'result') endState = s;
      if (s.phase === 'result' && s.t > 181) break;
      await new Promise((r) => setTimeout(r, endState ? 1000 : 250));
    }
    await page.waitForTimeout(700);
    const log = await page.evaluate(() => window.__audioLog);
    const state = await page.evaluate(() => window.__state);
    const played = log.entries.filter((e) => !e.dropped);
    // 出来事ごとに、いちばん早く出た音で測る（1つの出来事で複数の音を鳴らすことがある）
    const byEvent = new Map();
    for (const e of played) {
      const k = `${e.ev}@${e.t}`;
      const cur = byEvent.get(k);
      if (!cur || e.skewMs < cur.skewMs) byEvent.set(k, e);
    }
    const events = [...byEvent.values()];
    const judged = events.filter((e) => e.prop === 0);
    const sk = judged.map((e) => e.skewMs).sort((a, b) => a - b);
    const q = (p) => sk[Math.min(sk.length - 1, Math.floor(p * sk.length))];
    const perType = {};
    for (const e of judged) (perType[e.ev] ??= []).push(e.skewMs);
    // 段階の居場所（r02-audio）：曲の頭から3分のうち、静・暴・頂に居た秒数の割合（切り替えの記録から）
    const occupancy = [0, 0, 0];
    {
      const t0 = log.music.songStart;
      const t1 = t0 + Math.min(180, state.t);
      let cur = 0;
      let at = t0;
      for (const c of log.music.changes) {
        const ct = Math.min(t1, Math.max(t0, c.at));
        occupancy[cur] += ct - at;
        cur = c.to;
        at = ct;
      }
      occupancy[cur] += Math.max(0, t1 - at);
    }
    const occTotal = occupancy.reduce((a, b) => a + b, 0) || 1;
    // r05-audio：音ごとの「鳴らそうとした数・鳴った数・鳴らなかった理由」（上限で落ちた割合＝limit ÷ try）
    const drops = {};
    for (const e of log.entries) {
      const d = (drops[e.sound] ??= { try: 0, played: 0, limit: 0, merged: 0, missing: 0 });
      d.try++;
      if (e.dropped) d[e.dropped] = (d[e.dropped] ?? 0) + 1;
      else d.played++;
    }
    for (const d of Object.values(drops)) d.limitPct = r1((d.limit / d.try) * 100);
    // r05-audio：曲の最後の大太鼓（71小節の頭）と時間切れ（session.end を受けた時刻）のずれ（秒、＋なら大太鼓が後）。
    // 曲の側が最後の大太鼓の時刻（finalAt）を記録していない版（r04 まで）は、曲の頭から70小節後と見なす
    const endEntry = log.entries.find((e) => e.ev === 'session.end');
    const bar = 2.5;
    const finalAt = log.music.finalAt ?? log.music.songStart + 70 * bar;
    // r06-audio：時間切れの時刻は、曲が記録した時刻（無ければ結果の音の鳴らし始めから、わざと待った秒数を引く）。結果の音を大太鼓に合わせて待つので、鳴らし始めは時間切れではない
    const ce = log.music.cutToEnd ?? null;
    const sessionEndCtx = ce?.sessionEndAt ?? log.music.result?.sessionEndAt ?? (endEntry ? endEntry.start - (endEntry.wait ?? 0) : null);
    const musicEnd =
      sessionEndCtx !== null
        ? { sessionEndCtx: Math.round(sessionEndCtx * 1000) / 1000, finalHitCtx: Math.round(finalAt * 1000) / 1000, offsetSec: Math.round((finalAt - sessionEndCtx) * 1000) / 1000, extensionBars: log.music.extensionBars ?? 0, cutToEnd: ce, result: log.music.result ?? null, resultSound: endEntry?.sound ?? null, resultStartRelSec: endEntry ? Math.round((endEntry.start - sessionEndCtx) * 1000) / 1000 : null, endDrums: endDrums(sessionEndCtx, finalAt, ce?.drum, endEntry) }
        : null;
    const playAnchor = (log.music.grid ?? []).find((g) => g.why === 'play');
    const lowDuck = sessionEndCtx !== null ? lowDuckSpans(log.ducks, playAnchor?.from ?? log.music.songStart, sessionEndCtx) : null;
    const summary = {
      creature: creature ?? 'kurenai',
      speed,
      gameSeconds: state.t,
      atEnd: endState ? { t: endState.t, yen: endState.score.yen, destruction: endState.score.destruction, collapsed: endState.buildings.collapsed, firstCollapseAt: state.firstCollapseAt ?? null } : null,
      musicEnd,
      lowDuck,
      drops,
      stageOccupancyPct: { calm: r1((occupancy[0] / occTotal) * 100), rampage: r1((occupancy[1] / occTotal) * 100), peak: r1((occupancy[2] / occTotal) * 100) },
      context: { state: log.state, sampleRate: log.sampleRate, baseLatencyMs: r1(log.baseLatency * 1000), outputLatencyMs: r1(log.outputLatency * 1000), limiter: log.limiter, limiterMaxGrDb: log.limiterMaxGrDb },
      events: events.length,
      judged: judged.length,
      skewMs: { p50: q(0.5), p95: q(0.95), max: sk[sk.length - 1], min: sk[0] },
      over50ms: judged.filter((e) => e.skewMs > 50).length,
      perType: Object.fromEntries(Object.entries(perType).map(([k, v]) => [k, { n: v.length, max: Math.max(...v), median: v.sort((a, b) => a - b)[Math.floor(v.length / 2)] }])),
      delayedByDistance: events.filter((e) => e.prop > 0).map((e) => ({ ev: e.ev, sound: e.sound, distance: e.distance, propMs: Math.round(e.prop * 1000), skewMs: e.skewMs })),
      dropped: log.entries.filter((e) => e.dropped).reduce((a, e) => ((a[e.dropped] = (a[e.dropped] ?? 0) + 1), a), {}),
      voices: log.voices,
      music: { stageChanges: log.music.changes.length, alignedToBar: log.music.changes.every((c) => barAligned(c, log.music.songStart, 2.5, log.music.grid)), notOnBar: log.music.changes.filter((c) => !barAligned(c, log.music.songStart, 2.5, log.music.grid)).length, lateChunks: log.music.lateChunks, grid: log.music.grid ?? null, changes: log.music.changes },
      ducks: log.ducks.length,
      soundCounts: log.counts,
      gameEventCounts: state.events,
      consoleErrors: errors,
    };
    await writeFile(path.join(OUT, `sync${creature ? `_${creature}` : ''}.json`), JSON.stringify({ summary, entries: log.entries, ducks: log.ducks }, null, 1));
    return summary;
  } finally {
    await browser.close();
    await server.stop();
  }
}

async function main() {
  for (const d of ['png/sfx', 'wav']) await mkdir(path.join(OUT, d), { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(AUDIO, 'manifest.json'), 'utf8'));
  const port = portFrom(args, 5334);
  // --skip で一部だけ測り直したときも、前の結果の他の部分は残す
  let prev = {};
  try {
    prev = JSON.parse(await readFile(path.join(OUT, 'report.json'), 'utf8'));
  } catch {
    // 初めて
  }
  const report = { ...prev, round, date: new Date().toISOString(), seed: manifest.seed };
  if (!skip.has('sfx')) report.sfx = await sfxPart(manifest);
  if (!skip.has('content')) {
    const c = await contentPart(manifest, AUDIO, OUT);
    report.content = { weight: c.weight, variety: Object.fromEntries(Object.entries(c.variety).map(([k, v]) => [k, { envCorrDb: v.envCorrDb, envCorrDbAuto: v.envCorrDbAuto, envCorrLinear: v.envCorrLinear, lengthSpreadPct: v.lengthSpreadPct }])), voices: Object.fromEntries(Object.entries(c.voices).map(([k, v]) => [k, { below120: v.below120, pitchHz: v.pitchHz, f1SwingPct: v.f1SwingPct, f2SwingPct: v.f2SwingPct, staticPeak1300Db: v.staticPeak1300Db }])), roster: c.roster, rosterDistances: c.rosterDistances };
  }
  if (!skip.has('bgm')) report.bgm = await bgmPart(manifest);
  if (!skip.has('offline')) {
    const sc = await offlinePart(port);
    report.scenarios = Object.fromEntries(Object.entries(sc).filter(([k]) => k !== 'pageErrors').map(([k, v]) => [k, { integratedLufs: v.integratedLufs, truePeakDbtp: v.truePeakDbtp, samplePeakDb: v.samplePeakDb, clipped: v.clippedSamples, limiterMaxGrDb: v.limiterMaxGrDb, stageChanges: v.stageChanges?.length, stageChangesNotOnBar: v.stageChanges?.filter((c) => !c.alignedToBar).length, windows: v.windows, duckDepths: v.duckDepths, overMusic: v.overMusic, clock: v.clock, monster: v.monster, endAlign: v.endAlign, lowBandDuck: v.lowBandDuck, lowDuck: v.lowDuck, missing: v.missing?.length ? v.missing : undefined }]));
    report.scenarioPageErrors = sc.pageErrors;
  }
  if (!skip.has('live')) report[creature ? `sync_${creature}` : 'sync'] = await livePart(port + 1, Number(args.secs ?? 190), Number(args.speed ?? 1));
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  if (report.bgm) for (const k of ['calm', 'rampage', 'peak']) if (report.bgm[k]) console.log(`BGM ${k}: ${report.bgm[k].integratedLufs} LUFS・真のピーク ${report.bgm[k].truePeakDbtp} dBTP・継ぎ目の余計な乱れ 最大 ${report.bgm[k].seamExcessDbMax}dB（輪の継ぎ目 ${report.bgm[k].loopSeamExcessDb}dB。普通の小節の頭と比べた差、0 前後なら無し）`);
  if (report.bgm?.rises) console.log(`BGM 同じ区間での上がり幅（静→頂）: ${report.bgm.rises.map((r) => `${r.name} +${r.calmToPeak}`).join('・')} LU`);
  if (report.content?.roster) console.log(`怪獣3体の咆哮と足音: ${report.content.roster.png}`);
  if (report.content?.rosterDistances) for (const [k, v] of Object.entries(report.content.rosterDistances)) console.log(`怪獣どうしの差 ${k}: 怪獣どうし ${JSON.stringify(v.between)}・変化どうし ${JSON.stringify(v.within)}`);
  if (report.sfx) console.log(`効果音 ${report.sfx.files} 個：真のピークの最大 ${report.sfx.worstTruePeakDbtp} dBTP・クリップ ${report.sfx.clipped} 標本`);
  if (report.scenarios?.stress) console.log(`同時の崩落10棟＋咆哮＋着地：標本のピーク ${report.scenarios.stress.samplePeakDb} dBFS・真のピーク ${report.scenarios.stress.truePeakDbtp} dBTP・制限器 ${report.scenarios.stress.limiterMaxGrDb} dB`);
  const sync = report[creature ? `sync_${creature}` : 'sync'];
  if (sync && !skip.has('live')) {
    console.log(`同期（${sync.creature}・${sync.judged} 件）：ずれ p50 ${sync.skewMs.p50}ms・p95 ${sync.skewMs.p95}ms・最大 ${sync.skewMs.max}ms・50ms 超え ${sync.over50ms} 件・エラー ${sync.consoleErrors.length}・段階の居場所 ${JSON.stringify(sync.stageOccupancyPct)}`);
    if (sync.musicEnd) console.log(`曲の最後の大太鼓と時間切れのずれ: ${sync.musicEnd.offsetSec}秒（足した小節 ${sync.musicEnd.extensionBars}）・結果の音 ${sync.musicEnd.resultSound}（時間切れから ${sync.musicEnd.resultStartRelSec}秒）・前後 0.5 秒の大太鼓 ${sync.musicEnd.endDrums?.within05} つ`);
    if (sync.lowDuck) console.log(`曲の低い帯の引き：3分の ${sync.lowDuck.sharePct}%（${sync.lowDuck.seconds}秒）・引き始め ${sync.lowDuck.onsets} 回・引いた出来事 ${JSON.stringify(sync.lowDuck.triggers)}・近い崩落 ${sync.lowDuck.nearCollapses}（20000m³ 超 ${sync.lowDuck.nearCollapsesOver20000}・55000m³ 超 ${sync.lowDuck.nearCollapsesOver55000}）`);
    if (sync.atEnd) console.log(`時間切れの瞬間の遊びの数字：被害総額 ${sync.atEnd.yen}・崩落 ${sync.atEnd.collapsed}・最初の崩落 ${sync.atEnd.firstCollapseAt}`);
    console.log(`段階の切り替え ${sync.music.stageChanges} 回・小節の頭に乗っていない ${sync.music.notOnBar} 回`);
    const worst = Object.entries(sync.drops ?? {}).filter(([, d]) => d.limit > 0).sort((a, b) => b[1].limitPct - a[1].limitPct).slice(0, 8);
    if (worst.length) console.log(`上限で落ちた割合: ${worst.map(([k, d]) => `${k} ${d.limitPct}%（${d.limit}/${d.try}）`).join('・')}`);
  }
  if (report.scenarios?.finale?.endAlign) {
    const f = report.scenarios.finale.endAlign;
    console.log(`曲の終わり（書き出し・遊びの時計 0.97 倍）：足した ${f.extensionBars} 小節・最後の大太鼓と時間切れのずれ ${f.offsetSec}秒（その時刻の前後で低い帯が ${f.lowBandJumpAtFinalDb}dB 上がる）・跳んだ ${f.cut}`);
  }
  if (report.scenarios?.finale_mix?.endAlign) {
    const f = report.scenarios.finale_mix.endAlign;
    console.log(`時間切れの瞬間（書き出し・曲＋結果の音）：結果の音 ${f.resultSound}（${f.result?.kind ?? '?'}、時間切れから ${f.resultStartRelSec}秒）・最後の大太鼓のずれ ${f.offsetSec}秒・前後 0.5 秒の大太鼓 ${f.endDrums?.within05} つ（${JSON.stringify(f.endDrums?.drums.map((d) => d.relSec))}）`);
  }
  if (report.scenarios?.lowduck_replay?.lowDuck && report.scenarios?.lowduck_replay_r05?.lowDuck) {
    const n = report.scenarios.lowduck_replay.lowDuck;
    const o = report.scenarios.lowduck_replay_r05.lowDuck;
    console.log(`忙しい1分の書き出し（曲だけ）：低い帯の引き r05 の決まり ${o.sharePct}%・${o.onsets}回 → 今の決まり ${n.sharePct}%・${n.onsets}回`);
  }
  if (report.scenarios?.lowduck?.lowBandDuck) console.log(`曲の低い帯の引きだけの効き目（63Hz／400Hz）：${report.scenarios.lowduck.lowBandDuck.map((x) => `${x.label} ${x.db63}／${x.db400}dB`).join('・')}`);
  if (report.scenarios?.pause?.clock) console.log(`一時停止：曲の頭のずれ ${report.scenarios.pause.clock.songStartShiftSec}秒（止めた長さ ${report.scenarios.pause.clock.heldSec}秒）・終わりの位置 ${report.scenarios.pause.clock.positionAtEnd}（期待 ${report.scenarios.pause.clock.expectedPositionAtEnd}）`);
  console.log(`保存先: ${rel(OUT)}/（report.json ほか）`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
