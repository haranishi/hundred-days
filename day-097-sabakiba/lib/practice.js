// 練習の採点（スタブ。WP-2 が本物に差し替える。形は契約どおり）。
export function createSession({ curvePoints, tolerance }) { return { curvePoints, tolerance, samples: [] }; }
export function addSample(session, point, tMs) { session.samples.push({ p: point, t: tMs }); }
export function finish(session) {
  const n = session.samples.length;
  const score = n < 3 ? 0 : 78;
  return { score, accuracy: 0.8, smoothness: 0.7, coverage: n < 3 ? 0 : 1, grade: score >= 80 ? 'A' : score >= 65 ? 'B' : 'D', reversals: 0, meanDist: 0.3, maxDist: 0.8,
    comment: n < 3 ? '線をなぞってみましょう。' : '（見本）よくなぞれました。刃の全体を使って、一筆で引くとさらに良くなります。' };
}
