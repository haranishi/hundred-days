/** 依存なしの上面図。3D 描画の代わりに器を確かめる。 */
export function createDebugView() {
  let canvas, ctx, width = 1, height = 1, ratio = 1, tier = 'low';
  return {
    get info() { return { backend: 'debug-2d', tier, version: '0.0.1' }; },
    async init({ canvasHost, tier: initial }) {
      tier = initial; canvas = canvasHost.ownerDocument.createElement('canvas'); canvas.setAttribute('aria-label', '仮の雪原の上面図');
      canvasHost.append(canvas); ctx = canvas.getContext('2d'); if (!ctx) throw new Error('確認用の画面を作れませんでした');
    },
    resize(w, h, pixelRatio) { width = w; height = h; ratio = Math.min(pixelRatio, 2); canvas.width = w * ratio; canvas.height = h * ratio; },
    render({ state, prev, alpha, jumped }) {
      if (!ctx) return;
      const x = jumped ? state.pos.x : prev.pos.x + (state.pos.x - prev.pos.x) * alpha;
      const z = jumped ? state.pos.z : prev.pos.z + (state.pos.z - prev.pos.z) * alpha;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#304b60'); gradient.addColorStop(1, '#849ba8');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#aec0cb'; ctx.lineWidth = 1;
      for (let i = -1; i < width / 70 + 2; i++) {
        const gx = i * 70 - ((x * 5) % 70); ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke();
      }
      for (let i = -1; i < height / 70 + 2; i++) {
        const gy = i * 70 - ((z * 5) % 70); ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke();
      }
      ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate(-state.heading);
      ctx.fillStyle = '#ff9a3d'; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(12, 16); ctx.lineTo(-12, 16); ctx.closePath(); ctx.fill(); ctx.restore();
      const modes = { rest: '停止', carve: '滑走', skid: '制動', air: '空中', crash: '転倒' };
      ctx.font = '14px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(`確認用の仮の滑走・${modes[state.mode]}・${Math.round(state.speed * 3.6)} km/h`, width / 2, height * .35);
    },
    setTier(value) { tier = value; },
    dispose() { canvas?.remove(); ctx = null; },
  };
}
