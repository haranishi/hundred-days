// 採点する位置と許容幅は魚の座標（cm）。時刻はポインターイベントのミリ秒で受ける。
import { clamp01, lerp, measurePolyline } from './easing.js';

export function createSession({ curvePoints, tolerance }) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('許容幅は正のcmで指定します。');
  const path = measurePolyline(curvePoints);
  return { curvePoints: curvePoints.map(p => [...p]), tolerance, path, samples: [] };
}

function project(path, p) {
  let nearest = Infinity, arc = 0;
  for (const { a, dir, size, start } of path.segments) {
    const dx = p[0] - a[0], dy = p[1] - a[1], dz = p[2] - a[2];
    const h = Math.min(size, Math.max(0, dx * dir[0] + dy * dir[1] + dz * dir[2]));
    const squared = (dx - h * dir[0]) ** 2 + (dy - h * dir[1]) ** 2 + (dz - h * dir[2]) ** 2;
    if (squared < nearest) {
      nearest = squared;
      arc = start + h;
    }
  }
  return { a: arc, d: Math.sqrt(nearest) };
}

export function addSample(session, point, tMs) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite) || !Number.isFinite(tMs)) {
    throw new TypeError('軌跡には有限な座標と時刻が必要です。');
  }
  const last = session.samples.at(-1);
  if (last && tMs < last.t) return;
  const sample = { p: [...point], t: tMs, ...project(session.path, point) };
  if (last && tMs === last.t) session.samples[session.samples.length - 1] = sample;
  else session.samples.push(sample);
}

// 3%の戻りを初めて超えた所で一往復を数える。再び3%進むまでは同じ戻りとみなす。
function countReversals(samples, length) {
  // 弧長の差を取るときの丸めで、ちょうど3%の戻りを取りこぼさない。
  const threshold = length * (0.03 - 2 * Number.EPSILON);
  let forward = true, extreme = samples[0].a, count = 0;
  for (const { a } of samples) {
    if (forward) {
      extreme = Math.max(extreme, a);
      if (extreme - a >= threshold) {
        forward = false;
        extreme = a;
        count++;
      }
    } else {
      extreme = Math.min(extreme, a);
      if (a - extreme >= threshold) {
        forward = true;
        extreme = a;
      }
    }
  }
  return count;
}

function strokeSmoothness(samples, reversals) {
  if (samples.length < 3) return 0.5;
  const tickMs = 30, start = samples[0].t;
  let ticks = 0, atTick = samples[0].a, mean = 0, m2 = 0;
  const include = (speed, repetitions) => {
    if (!repetitions) return;
    const count = ticks + repetitions;
    const delta = speed - mean;
    m2 += delta * delta * (ticks / count) * repetitions;
    mean += delta * (repetitions / count);
    ticks = count;
  };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const lastTick = Math.floor((b.t - start) / tickMs);
    const n = lastTick - ticks;
    if (n <= 0) continue;
    const slope = (b.a - a.a) / (b.t - a.t);
    const first = a.a + slope * ((ticks + 1) * tickMs - (a.t - start));
    include(Math.abs(first - atTick) / tickMs, 1);
    // 同じ直線補間の区間内はどの30ms幅でも同じ速さ。長い中断も入力点数に比例して処理する。
    include(Math.abs(slope), n - 1);
    atTick = a.a + slope * (lastTick * tickMs - (a.t - start));
  }
  if (ticks < 2) return 0.5;
  if (mean === 0) return 0;
  return clamp01(1 - 0.8 * Math.sqrt(m2 / ticks) / mean - 0.1 * reversals);
}

function feedback({ n, first, last, span, meanDist, maxDist, accuracy, smoothness, reversals, score, tolerance }) {
  if (n === 0) return '軌跡がまだありません。線の始まりに触れて、そのままなぞってみましょう。';
  if (n === 1) return '触れた点を一つ記録しました。次は指を離す前に線の先まで進みましょう。';
  if (first - last >= 0.15) return '矢印と逆に進んでいます。矢印の根元から先へなぞってみましょう。';
  if (span < 0.05) return '同じ場所の近くに軌跡が集まっています。線に沿って少し先まで進みましょう。';
  if (reversals >= 2) return '小刻みに往復すると断面が荒れます。刃の全体を使って、一筆で長く引きましょう。';
  if (first > 0.15 && last < 0.85) return '線の中ほどをなぞれました。次は始まりから終わりまで線をつないでみましょう。';
  if (first > 0.15) return '線の途中から始めています。矢印の根元に指を置いてから進みましょう。';
  if (last < 0.85) return '軌跡が線の途中で終わっています。指を離す位置を矢印の先まで延ばしてみましょう。';
  if (accuracy < 0.76) return '線から平均' + meanDist.toFixed(1) + 'cmずれました。少しゆっくり、線の中心を追ってみましょう。';
  if (maxDist > tolerance * 1.5) return '途中で線から大きく離れた所があります。曲がる手前で少しゆっくり進みましょう。';
  if (reversals) return '線を少し戻った所があります。次は矢印の先を見て、ひと息で引いてみましょう。';
  if (smoothness < 0.70) return '線を進む速さにむらがあります。始まりから終わりまで同じ調子で引いてみましょう。';
  if (score >= 95) return '線に沿って、端までなめらかに引けています。';
  return '始まりから終わりまで線を追えています。次は指の中心を線に重ねてみましょう。';
}

export function finish({ samples, path, tolerance }) {
  if (!samples.length) {
    // 未入力は0点。なめらかさには、速度を測れない軌跡と同じ値を返す。
    return { score: 0, accuracy: 0, smoothness: 0.5, coverage: 0, grade: 'D', reversals: 0, meanDist: 0, maxDist: 0,
      comment: feedback({ n: 0 }) };
  }
  const distances = samples.map(s => s.d).sort((a, b) => a - b);
  const meanDist = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const maxDist = distances.at(-1);
  const p = (distances.length - 1) * 0.9;
  const percentile90 = lerp(distances[Math.floor(p)], distances[Math.ceil(p)], p % 1);
  const accuracy = clamp01(1 - (0.6 * meanDist + 0.4 * percentile90) / (2 * tolerance));
  let min = samples[0].a, max = min;
  for (const { a } of samples) {
    min = Math.min(min, a);
    max = Math.max(max, a);
  }
  const first = samples[0].a / path.length, last = samples.at(-1).a / path.length;
  const span = (max - min) / path.length;
  // 両端の不足分を連続的に差し引く。全線を逆走した場合も始点・終点の条件にかかる。
  const coverage = clamp01(span * clamp01((1 - first) / 0.85) * clamp01(last / 0.85));
  const reversals = countReversals(samples, path.length);
  const smoothness = strokeSmoothness(samples, reversals);
  const score = Math.min(coverage < 0.7 ? 60 : 100, Math.round(100 * (0.65 * accuracy + 0.2 * smoothness + 0.15 * coverage)));
  const grade = score >= 92 ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : 'D';
  const comment = feedback({ n: samples.length, first, last, span, meanDist, maxDist, accuracy, smoothness, reversals, score, tolerance });
  return { score, accuracy, smoothness, coverage, grade, comment, reversals, meanDist, maxDist };
}
