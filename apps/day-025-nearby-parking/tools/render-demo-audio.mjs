/* demo.mp4 の頭を切り落とし、音を付けて demo-with-audio.mp4 を作る。

   ⚠️ 前提の明示：**このアプリ自体は音を鳴らさない。** ここで付けるのは宣材用のスコア
   （BGMと場面転換のアクセント）であって、アプリの効果音ではない。
   このリポジトリの決め事「デモの音はアプリと同じ音データから同じ波形で作り直す」
   （day-012 / day-024 の render-demo-audio.mjs）は、動画で鳴った操作音を期待して
   リンクを踏んだ人が無音のアプリに着地する事故を防ぐためのもの。BGMは操作に反応する音では
   ないのでその事故は起きない。このアプリに操作音を足すときは、同じ音源から作り直すこと。

   音源ファイルは持たず、その場で波形を合成する（権利関係を持ち込まないため）。

   使い方:  node scripts/record-demo.mjs --day 25 のあとに
            node apps/day-025-nearby-parking/tools/render-demo-audio.mjs */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const VIDEO = join(appDir, "demo.mp4");
const OUT = join(appDir, "demo-with-audio.mp4");
const CUES = join(tmpdir(), "day-025-demo-cues.json");
const RATE = 44100;

if (!existsSync(VIDEO)) { console.error(`${VIDEO} がありません。先に record-demo.mjs を走らせてください`); process.exit(1); }
if (!existsSync(CUES)) { console.error(`${CUES} がありません。先に record-demo.mjs を走らせてください`); process.exit(1); }

const rawDuration = Number(execFileSync("ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", VIDEO]).toString().trim());
const cues = JSON.parse(readFileSync(CUES, "utf8")).cues;
const at = (label) => {
  const found = cues.find((c) => c.label === label);
  if (!found) throw new Error(`キュー ${label} がありません`);
  return found.t;
};

/* 頭の切り落とし。録画は振り付けより少し前から始まっているので、
   末尾の end キューとの差で助走の長さを出す。
   1コマ目がXのサムネになるため、タイトルや空の画面から始めないのが決まり。 */
const leadIn = rawDuration - at("end");
const cutAt = leadIn + at("results");
if (!Number.isFinite(cutAt) || cutAt <= 0 || cutAt >= rawDuration) {
  throw new Error(`頭を切る位置が求まりません（cutAt=${cutAt} duration=${rawDuration}）`);
}
const duration = rawDuration - cutAt;
const shifted = (label) => at(label) - at("results"); // 切ったあとの時間軸へ

// ---------------------------------------------------------------- 合成

const buf = new Float32Array(Math.ceil((duration + 1.5) * RATE));

function tone(freq, start, dur, gain, { type = "sine", attack = 0.012, decay = 1 } = {}) {
  const i0 = Math.max(0, Math.floor(start * RATE));
  const n = Math.floor(dur * RATE);
  for (let i = 0; i < n && i0 + i < buf.length; i += 1) {
    const t = i / RATE;
    const phase = 2 * Math.PI * freq * t;
    let wave = Math.sin(phase);
    if (type === "tri") wave = (2 / Math.PI) * Math.asin(Math.sin(phase));
    if (type === "soft") wave = Math.sin(phase) * 0.75 + Math.sin(phase * 2) * 0.25;
    const env = t < attack
      ? t / attack
      : Math.exp(-(t - attack) * decay) * (1 - Math.min(1, (t / dur) ** 6));
    buf[i0 + i] += wave * env * gain;
  }
}

// ---- BGM: 92BPM・I–vi–IV–V。ペンタトニックの範囲だけで動かして外さない
const beat = 60 / 92;
const N = { E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99 };
const PROGRESSION = [
  { bass: N.C4 / 2, pad: [N.C4, N.E4, N.G4], arp: [N.C4, N.E4, N.G4, N.C5] },
  { bass: N.A3 / 2, pad: [N.A3, N.C4, N.E4], arp: [N.A3, N.C4, N.E4, N.A4] },
  { bass: N.F3 / 2, pad: [N.F3, N.A3, N.C4], arp: [N.F3, N.A3, N.C4, N.F4] },
  { bass: N.G3 / 2, pad: [N.G3, N.B3, N.D4], arp: [N.G3, N.B3, N.D4, N.G4] },
];
const BARS = beat * 8;

for (let i = 0, t = 0; t < duration; i += 1, t += BARS) {
  const chord = PROGRESSION[i % PROGRESSION.length];
  // 1コマ目から鳴っている状態にする決まりなので、頭の音だけ立ち上がりを短くする
  const attack = i === 0 ? 0.05 : 0.25;
  tone(chord.bass, t, BARS, 0.085, { attack, decay: 0.35 });
  for (const f of chord.pad) tone(f, t, BARS, 0.030, { type: "soft", attack: i === 0 ? 0.08 : 0.5, decay: 0.30 });
  const pattern = [...chord.arp, ...chord.arp.slice(0, 3).reverse()];
  for (let k = 0; k < 16; k += 1) {
    const start = t + k * beat * 0.5;
    if (start >= duration) break;
    tone(pattern[k % pattern.length], start, beat * 0.9, 0.026, { type: "tri", attack: 0.006, decay: 7 });
  }
}

// ---- 場面のアクセント
[N.G4, N.C5, N.E5].forEach((f, i) => tone(f, 0.05 + i * 0.09, 0.9, 0.10, { type: "soft", decay: 4 }));
tone(N.D5, shifted("filtered"), 0.35, 0.06, { type: "tri", decay: 12 });
tone(N.E5, shifted("selected"), 0.7, 0.075, { type: "soft", decay: 5 });
const outro = shifted("outro");
[N.C5, N.E5, N.G5].forEach((f, i) => tone(f, outro + i * 0.06, 2.4, 0.075, { type: "soft", attack: 0.05, decay: 1.6 }));
tone(N.C4 / 2, outro, 2.6, 0.09, { attack: 0.06, decay: 1.2 });

// ---- 末尾のフェードと保険のリミッタ（頭はフェードしない＝1コマ目から鳴らす）
const end = Math.floor(duration * RATE);
const fadeOut = 2.0 * RATE;
for (let i = 0; i < buf.length; i += 1) {
  if (i > end - fadeOut) buf[i] *= Math.max(0, (end - i) / fadeOut);
  if (buf[i] > 0.95) buf[i] = 0.95;
  if (buf[i] < -0.95) buf[i] = -0.95;
}

// ---------------------------------------------------------------- 書き出し

const samples = end;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVE", 8);
wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i += 1) wav.writeInt16LE(Math.round(buf[i] * 32767), 44 + i * 2);
const wavPath = join(tmpdir(), "day-025-demo.wav");
writeFileSync(wavPath, wav);

/* 合成しただけだと -30LUFS 前後で、SNSのタイムラインでは実質聞こえない。
   配信向けの -16LUFS / トゥルーピーク -1.5dBTP に合わせる。 */
execFileSync("ffmpeg", ["-y",
  "-ss", cutAt.toFixed(3), "-i", VIDEO,
  "-i", wavPath,
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", "44100",
  "-shortest", "-movflags", "+faststart", OUT], { stdio: ["ignore", "ignore", "pipe"] });

console.log(`demo-with-audio.mp4 を作りました（頭${cutAt.toFixed(1)}秒を切って${duration.toFixed(1)}秒）`);
console.log(`  アクセント: 絞り込み${shifted("filtered").toFixed(1)}s / 選択${shifted("selected").toFixed(1)}s / 締め${outro.toFixed(1)}s`);
