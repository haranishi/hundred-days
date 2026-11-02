// 検査（関門）：書き出した動画を測り、どれか1つでも外れたら失敗（終了コード 1）にする。
//   node audit.mjs                                  ../../demo.mp4 を、字幕なしの基準 output/promo-clean.mp4 と比べて調べる
//   node audit.mjs output/promo-b.mp4               B案
//   node audit.mjs output/broken-sub-shift.mp4      わざと壊した版（落ちるはず）
// 調べること：長さ 36.0±0.05 秒／1080×1920／30fps／H.264 yuv420p（bt709）／音声あり（AAC）／積分ラウドネス −17±1 LUFS／真のピーク −1 dBTP 以下／
// 1コマ目と数コマ後で絵が変わる／黒・真っ白のコマが無い（各秒とコマの平均輝度）／字幕が上下左右 10% の内側（配置の記録と、動画の画素の両方）／
// 字幕の入れ替わりの時刻（動画から測る）が絵コンテと 0.1 秒以内／20MB 以下／1コマ目から音が鳴る／直流なし／切り替えと太鼓の拍（測って記録）。
// あわせて output/contact-sheet.jpg（1秒ごとのコマを並べた1枚）と output/audit-<名前>.json を書く。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BEAT, CLIPS, DURATION, ENDCARD, FADE, FIRST_NO_FADE_IN, FPS, HEIGHT, SUBTITLES, WIDTH, cutTimes } from './edit.mjs';
import { DAY, OUT } from './lib/harness.mjs';
import { ebur, parseEbur } from './audio.mjs';

const file = path.resolve(process.argv[2] ?? path.join(DAY, 'demo.mp4'));
const cleanFile = path.join(OUT, 'promo-clean.mp4');
const name = path.basename(file, '.mp4');
const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? '合格' : '不合格'}  ${id}：${detail}`);
};

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe に失敗: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** 灰色の小さなコマ（360×640）を全部読む。 */
const SW = 360;
const SH = 640;
function grayFrames(f) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', `scale=${SW}:${SH}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg（灰色のコマ）に失敗: ${r.stderr}`);
  const n = r.stdout.length / (SW * SH);
  return { n, frame: (k) => r.stdout.subarray(k * SW * SH, (k + 1) * SW * SH) };
}

/** 音声を 48kHz・モノの浮動小数で読む。 */
function audioSamples(f) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) return null;
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

const mean = (buf) => {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  return s / buf.length;
};

function main() {
  if (!existsSync(file)) throw new Error(`${file} が無い`);
  const info = probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(info.format.duration);
  const vdur = Number(v?.duration);
  check('長さ', Math.abs(dur - DURATION) <= 0.05 && Math.abs(vdur - DURATION) <= 0.05, `全体 ${dur.toFixed(3)} 秒・映像 ${vdur.toFixed(3)} 秒（${DURATION}±0.05）`);
  check('解像度', v.width === WIDTH && v.height === HEIGHT, `${v.width}×${v.height}`);
  check('フレームレート', v.r_frame_rate === `${FPS}/1` && v.avg_frame_rate === `${FPS}/1`, `${v.r_frame_rate}（平均 ${v.avg_frame_rate}）・${v.nb_frames} コマ`);
  check('映像の形式', v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.color_space === 'bt709', `${v.codec_name}・${v.pix_fmt}・色 ${v.color_space}/${v.color_primaries}/${v.color_transfer}・${v.color_range}`);
  check('音声あり', a && a.codec_name === 'aac' && Number(a.channels) === 2, a ? `${a.codec_name}・${a.channels}ch・${a.sample_rate}Hz・${Math.round(Number(a.bit_rate) / 1000)}kbps` : '音声の流れが無い');
  const size = statSync(file).size;
  check('大きさ', size <= 20 * 1024 * 1024, `${(size / 1024 / 1024).toFixed(2)} MB（20MB 以下）`);

  // 音：ラウドネス・真のピーク・1コマ目の音・直流・拍
  let loud = null;
  const audio = { };
  if (a) {
    loud = parseEbur(ebur(file));
    check('ラウドネス', loud.I >= -18 && loud.I <= -16, `積分 ${loud.I} LUFS（−17±1）・LRA ${loud.lra} LU`);
    check('真のピーク', loud.tp <= -1, `${loud.tp} dBTP（−1 以下）`);
    const smp = audioSamples(file);
    const f1 = Math.round(48000 / FPS);
    let e = 0;
    for (let i = 0; i < f1; i++) e += smp[i] * smp[i];
    audio.firstFrameDbfs = Number((10 * Math.log10(e / f1 + 1e-20)).toFixed(1));
    check('1コマ目から音', audio.firstFrameDbfs > -40, `最初の 1/30 秒の音の大きさ ${audio.firstFrameDbfs} dBFS（−40 より大きい）`);
    audio.dc = mean(smp);
    check('直流なし', Math.abs(audio.dc) < 1e-3, `平均 ${audio.dc.toExponential(2)}`);
    // 拍：切り替えの秒の前後 0.15 秒で、音の立ち上がり（5ms ごとの音の大きさ（dB）が、直前 20ms の平均から最も跳ね上がる所）を探す
    const hop = 240;
    const en = [];
    for (let i = 0; i + hop <= smp.length; i += hop) {
      let s = 0;
      for (let k = 0; k < hop; k++) s += smp[i + k] * smp[i + k];
      en.push(10 * Math.log10(s / hop + 1e-12));
    }
    const onsetNear = (t) => {
      let best = -Infinity;
      let bt = null;
      const c = Math.round((t * 48000) / hop);
      for (let j = Math.max(4, c - 30); j <= Math.min(en.length - 1, c + 30); j++) {
        const d = en[j] - (en[j - 1] + en[j - 2] + en[j - 3] + en[j - 4]) / 4;
        if (d > best) {
          best = d;
          bt = (j * hop) / 48000;
        }
      }
      return bt;
    };
    const tl = existsSync(path.join(OUT, 'timeline.json')) ? JSON.parse(readFileSync(path.join(OUT, 'timeline.json'), 'utf8')) : null;
    const targets = [...cutTimes().map((t) => ({ what: '切り替え', t })), ...(tl ? [{ what: '当て身の E', t: tl.events.takedownPress }, { what: '討ち取りの E', t: tl.events.killPress }] : []), { what: '終わりの画面', t: ENDCARD.in }];
    audio.beats = targets.map((x) => {
      const on = onsetNear(x.t);
      return { ...x, onBeat: Number((x.t / BEAT).toFixed(2)), onset: on === null ? null : Number(on.toFixed(3)), offsetMs: on === null ? null : Math.round((on - x.t) * 1000) };
    });
    // 許す幅は ±50ms（1.5 コマ）。AAC は打音の直前に前エコーが出るので、立ち上がりが数十 ms 早く測れることがある
    const bad = audio.beats.filter((b) => Math.abs(b.onBeat - Math.round(b.onBeat)) > 0.05 || b.offsetMs === null || Math.abs(b.offsetMs) > 50);
    check('拍と切り替え', bad.length === 0, audio.beats.map((b) => `${b.what} ${b.t.toFixed(3)}s=拍${b.onBeat}・音の立ち上がり ${b.offsetMs >= 0 ? '+' : ''}${b.offsetMs}ms`).join('／'));
  }

  // 映像：1コマ目と数コマ後・黒と白・字幕
  const g = grayFrames(file);
  const diffFrames = (x, y) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
    return s / x.length;
  };
  const d5 = diffFrames(g.frame(0), g.frame(5));
  const d15 = diffFrames(g.frame(0), g.frame(15));
  check('1コマ目が動いている', d5 > 0.8 && d15 > 1.5, `0 と 5 コマ目の差 ${d5.toFixed(2)}・0 と 15 コマ目の差 ${d15.toFixed(2)}（灰色 0〜255 の平均の差）`);
  const perFrame = [];
  for (let k = 0; k < g.n; k++) perFrame.push(mean(g.frame(k)));
  const perSec = [];
  for (let s = 0; s < Math.ceil(g.n / FPS); s++) perSec.push(Number(mean(perFrame.slice(s * FPS, (s + 1) * FPS)).toFixed(1)));
  const minF = Math.min(...perFrame);
  const maxF = Math.max(...perFrame);
  check('黒・白のコマが無い', minF > 20 && maxF < 225 && perSec.every((x) => x > 22 && x < 220), `コマの平均輝度 ${minF.toFixed(1)}〜${maxF.toFixed(1)}・各秒 [${perSec.join(', ')}]（リミテッドの 16=黒・235=白）`);

  // 字幕の配置：記録（subtitles.mjs の layout.json）
  const layout = JSON.parse(readFileSync(path.join(OUT, 'subs', 'layout.json'), 'utf8'));
  check('字幕の配置（記録）', layout.items.every((it) => it.insideSafe) && layout.font.available, layout.items.map((it) => `${it.id} x${Math.round(it.text.x0)}–${Math.round(it.text.x1)} y${Math.round(it.text.y0)}–${Math.round(it.text.y1)}`).join('／') + `（10% の内側は x108–972・y192–1728）`);

  // 字幕：字幕なしの基準と比べ、明るくなった画素（字幕の文字だけが明るくする）の範囲と、出ている時刻を測る
  if (!existsSync(cleanFile)) throw new Error('字幕なしの基準 output/promo-clean.mp4 が無い（node render.mjs）');
  const c = grayFrames(cleanFile);
  if (c.n !== g.n) throw new Error(`コマ数が基準と違う（${g.n}・${c.n}）`);
  const sx = WIDTH / SW;
  const sy = HEIGHT / SH;
  const bbox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const presence = [];
  // 字幕の出る帯（すべての字幕と終わりの画面の箱を合わせた範囲）の、差の平均
  const band = layout.items.reduce((u, it) => ({ x0: Math.min(u.x0, it.box.x0), y0: Math.min(u.y0, it.box.y0), x1: Math.max(u.x1, it.box.x1), y1: Math.max(u.y1, it.box.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const bx0 = Math.floor(band.x0 / sx);
  const bx1 = Math.ceil(band.x1 / sx);
  const by0 = Math.floor(band.y0 / sy);
  const by1 = Math.ceil(band.y1 / sy);
  for (let k = 0; k < g.n; k++) {
    const A = g.frame(k);
    const B = c.frame(k);
    let s = 0;
    let cnt = 0;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = y * SW + x;
        const d = A[i] - B[i];
        if (d > 60) {
          if (x < bbox.x0) bbox.x0 = x;
          if (x > bbox.x1) bbox.x1 = x;
          if (y < bbox.y0) bbox.y0 = y;
          if (y > bbox.y1) bbox.y1 = y;
        }
        // 出ているかの量：明るくなった分だけを数える（文字は明るく、下地は暗くする。圧縮の揺れ ±10 は数えない）
        if (x >= bx0 && x < bx1 && y >= by0 && y < by1) {
          if (d > 10) s += d - 10;
          cnt++;
        }
      }
    }
    presence.push(s / cnt);
  }
  const px = { x0: bbox.x0 * sx, y0: bbox.y0 * sy, x1: (bbox.x1 + 1) * sx, y1: (bbox.y1 + 1) * sy };
  const inside = px.x0 >= WIDTH * 0.1 && px.x1 <= WIDTH * 0.9 && px.y0 >= HEIGHT * 0.1 && px.y1 <= HEIGHT * 0.9;
  check('字幕の配置（動画の画素）', inside, `字幕で明るくなった画素の範囲 x ${Math.round(px.x0)}–${Math.round(px.x1)}・y ${Math.round(px.y0)}–${Math.round(px.y1)}`);

  // 出ている区間：差が小さな値を超える塊ごとに、その塊の最大の半分を横切る時刻（コマの間は直線で補う）
  const noise = 0.15;
  writeFileSync(path.join(OUT, `presence-${name}.json`), JSON.stringify(presence.map((p) => Number(p.toFixed(3)))));
  const segs = [];
  let k = 0;
  while (k < presence.length) {
    if (presence[k] <= noise) {
      k++;
      continue;
    }
    let e = k;
    while (e + 1 < presence.length && presence[e + 1] > noise) e++;
    // 塊の中で値が大きく変わる所（字幕の入れ替わりがフェードでつながる場合）は、半分の高さの谷で分ける
    segs.push([k, e]);
    k = e + 1;
  }
  const measured = [];
  for (const [s0, s1] of segs) {
    let mx = 0;
    for (let i = s0; i <= s1; i++) mx = Math.max(mx, presence[i]);
    const half = mx / 2;
    let rise = s0 === 0 && presence[0] >= half ? 0 : null;
    for (let i = Math.max(1, s0); i <= s1 + 1 && rise === null; i++) {
      if (presence[i] >= half && presence[i - 1] < half) rise = (i - 1 + (half - presence[i - 1]) / (presence[i] - presence[i - 1])) / FPS;
    }
    let fall = null;
    for (let i = s1 + 1; i >= Math.max(1, s0); i--) {
      if (i < presence.length && presence[i] < half && presence[i - 1] >= half) {
        fall = (i - 1 + (presence[i - 1] - half) / (presence[i - 1] - presence[i])) / FPS;
        break;
      }
    }
    if (fall === null && s1 === presence.length - 1) fall = DURATION;
    measured.push({ rise: Number(rise?.toFixed(3)), fall: Number(fall?.toFixed(3)), peak: Number(mx.toFixed(1)) });
  }
  const expected = [
    ...SUBTITLES.map((s, i) => ({ id: s.id, rise: i === 0 && FIRST_NO_FADE_IN ? 0 : s.in + FADE / 2, fall: s.out - FADE / 2 })),
    { id: ENDCARD.id, rise: ENDCARD.in + FADE / 2, fall: DURATION },
  ];
  const pairs = expected.map((e, i) => {
    const m = measured[i];
    const dr = m ? Math.abs(m.rise - e.rise) : Infinity;
    const df = m ? Math.abs(m.fall - e.fall) : Infinity;
    return { ...e, mRise: m?.rise, mFall: m?.fall, ok: dr <= 0.1 && df <= 0.1 };
  });
  const okTiming = measured.length === expected.length && pairs.every((p) => p.ok);
  check(
    '字幕の時刻（動画から測る）',
    okTiming,
    `塊 ${measured.length}（予定 ${expected.length}）：` + pairs.map((p) => `${p.id} 入り ${p.mRise ?? '-'}（予定 ${p.rise.toFixed(3)}）・出 ${p.mFall ?? '-'}（予定 ${p.fall.toFixed(3)}）`).join('／'),
  );

  // コンタクトシート（本編のときだけ書く）
  if (name === 'demo' || name === 'promo') {
    const sheet = path.join(OUT, 'contact-sheet.jpg');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'fps=1,scale=240:427,tile=9x4:padding=4:color=white', '-frames:v', '1', '-q:v', '3', sheet]);
  }

  const failed = results.filter((r) => !r.ok);
  const report = { file: path.relative(DAY, file), when: new Date().toISOString(), ok: failed.length === 0, results, loudness: loud, audio, perSecondLuma: perSec, subtitleMeasured: measured, clips: CLIPS.length };
  writeFileSync(path.join(OUT, `audit-${name}.json`), JSON.stringify(report, null, 2));
  console.log(failed.length === 0 ? `関門：すべて合格（${results.length} 項目）` : `関門：不合格 ${failed.length} 項目（${failed.map((f) => f.id).join('・')}）`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
