// 完了の花火。canvas の粒（朱・金茶・藍）が2.5秒だけ開いて消える。止める関数を返す
const COLORS = ['#B33A2B', '#C8963E', '#22406B'];

export function hanabi(canvas, { duration = 2500 } = {}) {
  const c = canvas.getContext?.('2d');
  if (!c) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 360;
  const H = canvas.clientHeight || 360;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  c.scale(dpr, dpr);
  const parts = [];
  const bursts = [0, 320, 680, 1050].map((t, i) => ({
    t,
    x: W * (0.18 + Math.random() * 0.64),
    y: H * (0.1 + Math.random() * 0.28),
    color: COLORS[i % COLORS.length],
    done: false,
  }));
  const start = performance.now();
  let raf = 0;
  let stopped = false;

  function spawn(b) {
    const n = 40;
    const size = Math.min(W, 520) / 360;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.25;
      const sp = (1.3 + Math.random() * 2.1) * size;
      parts.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        color: Math.random() < 0.75 ? b.color : COLORS[1],
        r: 1.5 + Math.random() * 1.5,
      });
    }
  }

  function end() {
    c.clearRect(0, 0, W, H);
    canvas.dataset.done = '1';
  }

  function frame(now) {
    if (stopped) return;
    const t = now - start;
    for (const b of bursts) if (!b.done && t >= b.t) {
      b.done = true;
      spawn(b);
    }
    c.clearRect(0, 0, W, H);
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.035;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= 0.015;
      c.globalAlpha = Math.max(0, p.life);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    if (t < duration) raf = requestAnimationFrame(frame);
    else end();
  }

  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    end();
  };
}
