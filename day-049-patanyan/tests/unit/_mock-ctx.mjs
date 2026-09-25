// ブラウザの CanvasRenderingContext2D の代わり。描画関数が例外を出さず、NaN や負の半径を渡さないことだけを見る
export function mockCtx() {
  const calls = { count: 0, text: [], nonFinite: 0, fills: 0 };
  const grad = { addColorStop() {} };
  const check = (args) => {
    for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) calls.nonFinite += 1;
  };
  const target = {
    canvas: { width: 1080, height: 1350 },
    createLinearGradient: (...a) => (check(a), grad),
    createRadialGradient: (...a) => (check(a), grad),
    measureText: (t) => ({ width: String(t).length * 10 }),
    fillText: (t, ...a) => (check(a), calls.text.push(String(t))),
    strokeText: (t, ...a) => (check(a), calls.text.push(String(t))),
    fill: () => {
      calls.fills += 1;
    },
    ellipse: (x, y, rx, ry, ...rest) => {
      check([x, y, rx, ry, ...rest]);
      if (rx < 0 || ry < 0) throw new RangeError('negative radius');
    },
    arc: (x, y, r, ...rest) => {
      check([x, y, r, ...rest]);
      if (r < 0) throw new RangeError('negative radius');
    },
    arcTo: (...a) => {
      check(a);
      if (a[4] < 0) throw new RangeError('negative radius');
    },
    setLineDash() {},
    getLineDash: () => [],
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === '__calls') return calls;
      if (k in t) return t[k];
      return (...args) => {
        calls.count += 1;
        check(args);
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}
