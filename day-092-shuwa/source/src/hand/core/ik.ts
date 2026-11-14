/**
 * 可動域つきの最小二乗（Levenberg–Marquardt）。変数は関節角度（ラジアン）、残差は長さ（手のひら単位）。
 * ヤコビ行列は数値微分。変数は多くても十数個なので、素直な密行列で解く。
 * 可動域は毎回の更新で丸める（射影）。丸めた先で止まることはあるが、その場合も呼び出し側で隙間を確かめて警告する。
 */

export interface LMResult {
  x: number[];
  cost: number;
  iterations: number;
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] ?? 0]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-14) return null;
    if (piv !== c) [M[c], M[piv]] = [M[piv]!, M[c]!];
    const rowC = M[c]!;
    for (let r = c + 1; r < n; r++) {
      const row = M[r]!;
      const f = row[c]! / rowC[c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) row[k] = row[k]! - f * rowC[k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!;
    let s = row[n]!;
    for (let k = r + 1; k < n; k++) s -= row[k]! * x[k]!;
    x[r] = s / row[r]!;
  }
  return x;
}

const sumSq = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

export function solveLM(
  x0: number[],
  lo: number[],
  hi: number[],
  residual: (x: number[]) => number[],
  opts: { maxIter?: number; tolCost?: number } = {},
): LMResult {
  const n = x0.length;
  const clampX = (x: number[]) => x.map((v, i) => Math.min(hi[i]!, Math.max(lo[i]!, v)));
  let x = clampX(x0);
  let r = residual(x);
  let cost = sumSq(r);
  let mu = 1e-3;
  const maxIter = opts.maxIter ?? 120;
  const tolCost = opts.tolCost ?? 1e-10;
  let it = 0;
  for (; it < maxIter && cost > tolCost; it++) {
    const m = r.length;
    // 数値微分（可動域の端では片側にずらす）
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-4;
      const xj = x[j]!;
      const forward = xj + h <= hi[j]!;
      const xs = x.slice();
      xs[j] = forward ? xj + h : xj - h;
      const rs = residual(xs);
      for (let i = 0; i < m; i++) J[i]![j] = ((rs[i]! - r[i]!) / h) * (forward ? 1 : -1);
    }
    const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const g = new Array<number>(n).fill(0);
    for (let i = 0; i < m; i++) {
      const Ji = J[i]!;
      const ri = r[i]!;
      for (let a = 0; a < n; a++) {
        const v = Ji[a]!;
        if (v === 0) continue;
        g[a] = g[a]! + v * ri;
        const Aa = A[a]!;
        for (let b = 0; b < n; b++) Aa[b] = Aa[b]! + v * Ji[b]!;
      }
    }
    let improved = false;
    let step = 0;
    for (let k = 0; k < 10; k++) {
      const M = A.map((row, a) => row.map((v, b) => (a === b ? v + mu * (v + 1e-6) : v)));
      const dx = solveLinear(M, g.map((v) => -v));
      if (!dx) {
        mu *= 10;
        continue;
      }
      const xn = clampX(x.map((v, i) => v + dx[i]!));
      const rn = residual(xn);
      const cn = sumSq(rn);
      if (cn < cost) {
        step = Math.max(...xn.map((v, i) => Math.abs(v - x[i]!)));
        x = xn;
        r = rn;
        cost = cn;
        mu = Math.max(mu * 0.3, 1e-9);
        improved = true;
        break;
      }
      mu *= 6;
    }
    if (!improved || step < 1e-8) break;
  }
  return { x, cost, iterations: it };
}
