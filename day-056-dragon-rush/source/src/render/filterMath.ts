// OWNER: render
// shaders/filterGlsl.ts と同じ式の TS 版（テスト用。three を import しない）。

export function pulseIntegral(x: number, w: number): number {
  const f = x - Math.floor(x);
  return Math.floor(x) * w + Math.min(f, w);
}

export function fpulse(x: number, w: number, fw: number): number {
  const width = Math.max(fw, 1e-4);
  return (pulseIntegral(x + 0.5 * width, w) - pulseIntegral(x - 0.5 * width, w)) / width;
}

export function fpulseC(x: number, w: number, fw: number): number {
  return fpulse(x - 0.5 + 0.5 * w, w, fw);
}
