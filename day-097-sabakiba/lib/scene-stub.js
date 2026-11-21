// 3D表示（FishScene）の差し替え可能なスタブ実装。契約 interfaces-app.md と同じ形を提供する。
// 後で親が本物 lib/scene-fish.js に差し替える。Canvas2D の見取り図として描き、本物の3Dと混同しない目印を添える。
import { resolveText } from './contract.js';
import { SPECIES_META } from './species/meta.js';
import { getProcedure } from './procedures/index.js';
import { VIEW_LABELS } from './ui-format.js';

const SPECIES_COLORS = {
  aji: { dorsal: '#356887', flank: '#c5d2d9', belly: '#f2f0ea' },
  iwashi: { dorsal: '#2d577a', flank: '#cdd8df', belly: '#f6f5f0' },
  sanma: { dorsal: '#295f75', flank: '#cfd9df', belly: '#f7f6f2' },
  saba: { dorsal: '#226576', flank: '#c4d2d9', belly: '#f2f1eb' },
  kisu: { dorsal: '#b5a68e', flank: '#e5dfd1', belly: '#faf8f2' },
  tai: { dorsal: '#c96868', flank: '#ebd2cf', belly: '#faf3f0' },
  katsuo: { dorsal: '#234263', flank: '#c1ced7', belly: '#eff1f2' },
  hirame: { dorsal: '#86755b', flank: '#a89678', belly: '#c9bba0' },
};

// 手順ごとの見取り図用ガイド線（魚の中心を原点とした正規化座標 [-1..1] × [-0.5..0.5]）。
function guideCurveForStep(step, stepIndex) {
  const id = (step && step.id) || '';
  if (id.includes('scale')) {
    return [[0.58, -0.06], [0.22, -0.11], [-0.12, -0.10], [-0.42, -0.05]];
  }
  if (id.includes('head')) {
    return [[-0.42, -0.26], [-0.36, -0.06], [-0.34, 0.14], [-0.40, 0.28]];
  }
  if (id.includes('gut')) {
    return [[0.14, 0.25], [-0.04, 0.27], [-0.24, 0.25], [-0.42, 0.20]];
  }
  if (id.includes('wash')) {
    return [[-0.36, 0.16], [-0.14, 0.18], [0.08, 0.16]];
  }
  if (id.includes('fillet') || stepIndex >= 4) {
    return [[-0.36, -0.18], [-0.05, -0.22], [0.30, -0.16], [0.62, -0.04]];
  }
  return [[-0.44, 0.0], [-0.12, -0.04], [0.22, -0.02], [0.54, 0.0]];
}

function samplePolyline(pts, t) {
  if (!pts || pts.length === 0) return { x: 0, y: 0, ang: 0 };
  if (pts.length === 1) return { x: pts[0][0], y: pts[0][1], ang: 0 };
  const clamped = Math.min(1, Math.max(0, t));
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const len = Math.hypot(dx, dy);
    segs.push({ len, dx, dy, a: pts[i], b: pts[i + 1] });
    total += len;
  }
  if (total <= 1e-6) return { x: pts[0][0], y: pts[0][1], ang: 0 };
  let target = clamped * total;
  for (const s of segs) {
    if (target <= s.len || s === segs[segs.length - 1]) {
      const f = s.len > 1e-6 ? Math.min(1, Math.max(0, target / s.len)) : 0;
      return {
        x: s.a[0] + s.dx * f,
        y: s.a[1] + s.dy * f,
        ang: Math.atan2(s.dy, s.dx),
      };
    }
    target -= s.len;
  }
  const last = segs[segs.length - 1];
  return { x: last.b[0], y: last.b[1], ang: Math.atan2(last.dy, last.dx) };
}

export function createFishScene({ container, speciesId = 'aji', quality = 'auto', debug = false } = {}) {
  const effectiveQuality = quality === 'auto' ? 'standard' : quality;
  const maxDpr = effectiveQuality === 'high' ? 2 : effectiveQuality === 'light' ? 1 : 1.5;

  const meta = SPECIES_META[speciesId] || SPECIES_META.aji;
  const proc = getProcedure(speciesId);
  const listeners = new Map();

  let stepIndex = 0;
  let u = 0;
  let view = 'cook';
  let xray = false;
  let labels = false;
  let leftHanded = false;
  let practice = null;
  let disposed = false;
  let cameraOffset = { dx: 0, dy: 0 };
  let tracePoints = [];
  let tracing = false;
  let dragging = false;
  let dragStart = null;
  let lastTapMs = 0;
  let frameCount = 0;

  const emit = (ev, payload) => {
    const set = listeners.get(ev);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(payload);
      } catch {
        // コールバック例外で描画を止めない
      }
    }
  };

  if (!container) {
    const failed = Promise.reject(new Error('表示領域が見つからないため、3D表示を初期化できませんでした。'));
    return {
      ready: failed,
      setStep() {}, setProgress() {}, setView() {}, setXray() {}, setLabels() {}, setLeftHanded() {},
      setPractice() {}, on() { return () => {}; }, resetCamera() {},
      snapshot: () => Promise.resolve(null),
      stats: () => ({ stub: true, triangles: 0, quality: effectiveQuality, gl: 'off' }),
      dispose() {},
    };
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', `${meta.name}のさばき方 見取り図（3Dスタブ）`);
  container.prepend(canvas);
  const ctx = canvas.getContext('2d');

  let cssW = 360;
  let cssH = 280;

  function syncSize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    cssW = Math.max(240, Math.round(rect.width || 360));
    cssH = Math.max(180, Math.round(rect.height || 280));
    const dpr = Math.min(maxDpr, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function currentStep() {
    if (!proc || !Array.isArray(proc.steps) || proc.steps.length === 0) return null;
    return proc.steps[Math.min(proc.steps.length - 1, Math.max(0, stepIndex))];
  }

  // 魚の描画中心・縮尺を返す（ポインタ座標⇔cm座標の変換でも共通利用）
  function fishFrame() {
    const cx = cssW * 0.5 + cameraOffset.dx;
    const cy = cssH * 0.54 + cameraOffset.dy;
    const scaleX = Math.min(cssW * 0.34, cssH * 0.56);
    const scaleY = view === 'top' ? scaleX * 0.42 : view === 'side' ? scaleX * 0.62 : scaleX * 0.54;
    return { cx, cy, scaleX, scaleY };
  }

  function normToCanvas(nx, ny) {
    const { cx, cy, scaleX, scaleY } = fishFrame();
    const flip = leftHanded ? -1 : 1;
    return [cx + nx * scaleX * flip, cy + ny * scaleY];
  }

  function canvasToCm(px, py) {
    const { cx, cy, scaleX, scaleY } = fishFrame();
    const flip = leftHanded ? -1 : 1;
    const lenCm = (meta.sizeCm && meta.sizeCm.typical) || 21;
    const nx = ((px - cx) / Math.max(1, scaleX)) * flip;
    const ny = (py - cy) / Math.max(1, scaleY);
    return [nx * (lenCm * 0.5), -ny * (lenCm * 0.25), 0];
  }

  function guideCurveCm() {
    const pts = guideCurveForStep(currentStep(), stepIndex);
    const lenCm = (meta.sizeCm && meta.sizeCm.typical) || 21;
    return pts.map(([nx, ny]) => [nx * (lenCm * 0.5), -ny * (lenCm * 0.25), 0]);
  }

  function drawBoard() {
    // 明るい台所の天板
    ctx.fillStyle = '#ece6da';
    ctx.fillRect(0, 0, cssW, cssH);

    // 白木のまな板
    const padX = Math.max(16, cssW * 0.06);
    const topY = Math.max(54, cssH * 0.16);
    const boardW = cssW - padX * 2;
    const boardH = Math.max(110, cssH - topY - Math.max(38, cssH * 0.12));
    const r = 12;

    // まな板の影（控えめ）
    ctx.fillStyle = 'rgba(28, 43, 51, 0.08)';
    roundRect(ctx, padX + 2, topY + 5, boardW, boardH, r);
    ctx.fill();

    // まな板の本体（ヒノキ色）
    const grad = ctx.createLinearGradient(padX, topY, padX, topY + boardH);
    grad.addColorStop(0, '#f3e7cf');
    grad.addColorStop(1, '#e8d7b6');
    ctx.fillStyle = grad;
    roundRect(ctx, padX, topY, boardW, boardH, r);
    ctx.fill();
    ctx.strokeStyle = '#d3c19d';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 手続き的な木目（乱数なし・決定的）
    ctx.save();
    roundRect(ctx, padX, topY, boardW, boardH, r);
    ctx.clip();
    ctx.strokeStyle = 'rgba(166, 134, 86, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 7; i++) {
      const y = topY + (boardH * i) / 8;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.bezierCurveTo(
        padX + boardW * 0.33, y + Math.sin(i * 1.4) * 4,
        padX + boardW * 0.66, y - Math.cos(i * 1.1) * 4,
        padX + boardW, y
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFish() {
    const { cx, cy, scaleX, scaleY } = fishFrame();
    const flip = leftHanded ? -1 : 1;
    const palette = SPECIES_COLORS[speciesId] || SPECIES_COLORS.aji;
    const st = currentStep();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flip, 1);

    // 魚の接地影
    ctx.fillStyle = 'rgba(28, 43, 51, 0.11)';
    ctx.beginPath();
    ctx.ellipse(0, scaleY * 0.42, scaleX * 0.72, scaleY * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 背ビレ・尻ビレ
    ctx.globalAlpha = xray ? 0.32 : 0.9;
    ctx.fillStyle = '#c4b898';
    ctx.strokeStyle = '#4c5c66';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-scaleX * 0.12, -scaleY * 0.34);
    ctx.lineTo(scaleX * 0.14, -scaleY * 0.56);
    ctx.lineTo(scaleX * 0.42, -scaleY * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(scaleX * 0.14, scaleY * 0.32);
    ctx.lineTo(scaleX * 0.38, scaleY * 0.46);
    ctx.lineTo(scaleX * 0.50, scaleY * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 胴体と尾ビレの輪郭
    const bodyGrad = ctx.createLinearGradient(0, -scaleY * 0.42, 0, scaleY * 0.42);
    bodyGrad.addColorStop(0, palette.dorsal);
    bodyGrad.addColorStop(0.48, palette.flank);
    bodyGrad.addColorStop(1, palette.belly);

    ctx.globalAlpha = xray ? 0.36 : 0.96;
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#243640';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-scaleX * 0.78, 0);
    ctx.bezierCurveTo(-scaleX * 0.55, -scaleY * 0.48, scaleX * 0.22, -scaleY * 0.46, scaleX * 0.64, -scaleY * 0.12);
    ctx.lineTo(scaleX * 0.92, -scaleY * 0.36);
    ctx.lineTo(scaleX * 0.82, 0);
    ctx.lineTo(scaleX * 0.92, scaleY * 0.36);
    ctx.lineTo(scaleX * 0.64, scaleY * 0.12);
    ctx.bezierCurveTo(scaleX * 0.22, scaleY * 0.46, -scaleX * 0.55, scaleY * 0.48, -scaleX * 0.78, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 鰓蓋と目
    ctx.globalAlpha = xray ? 0.45 : 0.95;
    ctx.beginPath();
    ctx.moveTo(-scaleX * 0.42, -scaleY * 0.24);
    ctx.quadraticCurveTo(-scaleX * 0.34, 0, -scaleX * 0.42, scaleY * 0.24);
    ctx.strokeStyle = '#3d4f59';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#f8f5ec';
    ctx.beginPath();
    ctx.arc(-scaleX * 0.58, -scaleY * 0.08, Math.max(4, scaleY * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1c2b33';
    ctx.beginPath();
    ctx.arc(-scaleX * 0.59, -scaleY * 0.08, Math.max(2, scaleY * 0.042), 0, Math.PI * 2);
    ctx.fill();

    // 透視オン時：中骨・腹骨・内臓を象牙色と淡桃色で浮かび上がらせる
    if (xray) {
      ctx.globalAlpha = 0.95;
      // 内臓の輪郭
      ctx.fillStyle = 'rgba(205, 118, 128, 0.32)';
      ctx.strokeStyle = 'rgba(176, 86, 98, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(-scaleX * 0.16, scaleY * 0.14, scaleX * 0.24, scaleY * 0.13, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 背骨（象牙色）
      ctx.strokeStyle = '#f6efe0';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-scaleX * 0.44, -scaleY * 0.02);
      ctx.lineTo(scaleX * 0.68, 0);
      ctx.stroke();
      ctx.strokeStyle = '#9c8e73';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 肋骨・小骨
      ctx.strokeStyle = '#efe6d0';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 9; i++) {
        const bx = -scaleX * 0.32 + i * scaleX * 0.105;
        ctx.beginPath();
        ctx.moveTo(bx, -scaleY * 0.02);
        ctx.lineTo(bx + scaleX * 0.03, -scaleY * (0.24 - i * 0.015));
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + scaleX * 0.04, scaleY * (0.24 - i * 0.015));
        ctx.stroke();
      }
    }

    ctx.restore();

    // 切る線（朱色＋点線＋矢印記号）と包丁の模型
    const pts = guideCurveForStep(st, stepIndex).map(([nx, ny]) => normToCanvas(nx, ny));
    drawCutGuide(pts, st);

    // もう一方の手の位置（青＋手の印）
    drawHandMarker(st);

    // 部位ラベル（オンのとき）
    if (labels) {
      drawPartLabels(st);
    }
  }

  function drawCutGuide(pts, st) {
    if (pts.length < 2) return;
    ctx.save();

    // 練習モード時は太く光るガイド線にする
    if (practice) {
      ctx.strokeStyle = 'rgba(229, 66, 47, 0.28)';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }

    // 朱色の流れる点線
    ctx.strokeStyle = '#e5422f';
    ctx.lineWidth = practice ? 3.5 : 2.8;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -u * 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);

    // 終点の矢印（色だけで意味を伝えない）
    const end = samplePolyline(pts, 1);
    ctx.fillStyle = '#e5422f';
    ctx.save();
    ctx.translate(end.x, end.y);
    ctx.rotate(end.ang);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5.5);
    ctx.lineTo(-5, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 練習モード時は始点丸とユーザー軌跡を描画
    if (practice) {
      const start = pts[0];
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e5422f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(start[0], start[1], 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (tracePoints.length >= 2) {
        ctx.strokeStyle = '#1c2b33';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        tracePoints.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      }
    } else {
      // ガイド時は進み具合 u に沿って包丁シルエットを滑らせる
      const pos = samplePolyline(pts, u);
      drawKnifeMarker(pos.x, pos.y, pos.ang);
    }

    ctx.restore();
  }

  function drawKnifeMarker(x, y, ang) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang - 0.35);
    // 刃先が接触点 (0, 0) に来るステンレス刃＋木柄
    ctx.fillStyle = '#dce4e8';
    ctx.strokeStyle = '#2f414b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, -9);
    ctx.lineTo(36, -1);
    ctx.lineTo(6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#a87d4c';
    ctx.strokeStyle = '#5c4124';
    ctx.beginPath();
    ctx.roundRect(33, -7, 22, 8, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawHandMarker(st) {
    const [hx, hy] = normToCanvas(-0.52, -0.06);
    ctx.save();
    // 青い丸＋手のひらシルエット（色だけで伝えない）
    ctx.fillStyle = 'rgba(43, 123, 214, 0.16)';
    ctx.strokeStyle = '#2b7bd6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 簡易の手のひらマーク
    ctx.fillStyle = '#2b7bd6';
    ctx.beginPath();
    ctx.roundRect(hx - 4.5, hy - 2.5, 9, 8.5, 2.8);
    ctx.fill();
    for (let i = -3; i <= 3; i += 3) {
      ctx.beginPath();
      ctx.roundRect(hx + i - 1, hy - 7.5, 2, 5.5, 1);
      ctx.fill();
    }

    const handText = st && st.hands && st.hands[0] ? resolveText(st.hands[0].text, leftHanded) : '押さえる手';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const tw = ctx.measureText(handText).width;
    const lx = Math.max(12, Math.min(cssW - tw - 22, hx - tw * 0.5 - 6));
    const ly = Math.max(54, hy - 40);
    ctx.fillStyle = 'rgba(253, 251, 247, 0.96)';
    ctx.strokeStyle = '#2b7bd6';
    ctx.lineWidth = 1.2;
    roundRect(ctx, lx, ly, tw + 12, 20, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d5da8';
    ctx.fillText(handText, lx + 6, ly + 14);
    ctx.restore();
  }

  function drawPartLabels() {
    const items = [
      { target: [-0.42, 0.16], box: [-0.64, 0.50], text: '鰓蓋（えらぶた）' },
      { target: [0.06, -0.34], box: [0.06, -0.72], text: '背ビレ' },
      { target: [0.02, 0.24], box: [0.34, 0.50], text: '腹骨（はらぼね）' },
      { target: [0.60, -0.04], box: [0.66, -0.44], text: '尾柄（びへい）' },
    ];
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    for (const item of items) {
      const [tx, ty] = normToCanvas(item.target[0], item.target[1]);
      const [x, y] = normToCanvas(item.box[0], item.box[1]);
      const tw = ctx.measureText(item.text).width;
      const bx = Math.max(10, Math.min(cssW - tw - 18, x - tw * 0.5 - 5));
      const by = Math.max(54, Math.min(cssH - 46, y - 10));

      // 部位とラベルをつなぐ細い案内線
      ctx.strokeStyle = 'rgba(28, 43, 51, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(bx + (tw + 10) * 0.5, by + 10);
      ctx.stroke();

      ctx.fillStyle = 'rgba(28, 43, 51, 0.90)';
      roundRect(ctx, bx, by, tw + 10, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#fdfbf7';
      ctx.fillText(item.text, bx + 5, by + 14);
    }
    ctx.restore();
  }

  function drawOverlayMeta() {
    const st = currentStep();
    ctx.save();

    // 左下：スタブ見取り図であることの明示（本物の3Dと混同しない目印）
    const viewName = VIEW_LABELS[view] || '台所の視点';
    const flags = [viewName];
    if (xray) flags.push('透視');
    if (leftHanded) flags.push('左利き');
    if (practice) flags.push('なぞり練習');
    const tagText = `2D見取り図スタブ ｜ ${meta.nameFull} ｜ ${flags.join('・')}`;

    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const maxTagW = cssW - 74;
    const shown = truncateText(ctx, tagText, maxTagW - 14);
    const tw = ctx.measureText(shown).width;
    const x = 12;
    const y = cssH - 32;

    ctx.fillStyle = 'rgba(253, 251, 247, 0.90)';
    ctx.strokeStyle = 'rgba(28, 43, 51, 0.16)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, tw + 14, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#33454f';
    ctx.fillText(shown, x + 7, y + 15);

    // ステップ名と進み具合の小さなインジケータ（右上に被らない左上寄りではなくまな板の上端中央に控えめに）
    if (st) {
      const pct = Math.round(u * 100);
      const stepLabel = `${stepIndex + 1}. ${resolveText(st.title, leftHanded)}（${pct}%）`;
      const sw = ctx.measureText(stepLabel).width;
      const sx = Math.max(12, Math.min(cssW - sw - 26, (cssW - sw - 14) * 0.5));
      const sy = Math.max(58, cssH * 0.17) + 6;
      ctx.fillStyle = 'rgba(253, 251, 247, 0.84)';
      roundRect(ctx, sx, sy, sw + 14, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#1c2b33';
      ctx.fillText(stepLabel, sx + 7, sy + 14);
    }

    ctx.restore();
  }

  function render() {
    if (disposed || !ctx) return;
    syncSize();
    drawBoard();
    drawFish();
    drawOverlayMeta();
    frameCount += 1;
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onPointerDown(e) {
    if (disposed) return;
    const now = performance.now();
    const [px, py] = pointerPos(e);

    if (practice) {
      tracing = true;
      tracePoints = [[px, py]];
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch {}
      }
      emit('practice-sample', {
        phase: 'start',
        cutId: practice.cutId,
        point: canvasToCm(px, py),
        tMs: now,
        curvePoints: guideCurveCm(),
      });
      render();
      return;
    }

    if (now - lastTapMs < 320) {
      lastTapMs = 0;
      cameraOffset = { dx: 0, dy: 0 };
      render();
      return;
    }
    lastTapMs = now;
    dragging = true;
    dragStart = { x: px, y: py, ox: cameraOffset.dx, oy: cameraOffset.dy };
  }

  function onPointerMove(e) {
    if (disposed) return;
    const [px, py] = pointerPos(e);
    if (practice && tracing) {
      tracePoints.push([px, py]);
      emit('practice-sample', {
        phase: 'move',
        cutId: practice.cutId,
        point: canvasToCm(px, py),
        tMs: performance.now(),
        curvePoints: guideCurveCm(),
      });
      render();
      return;
    }
    if (dragging && dragStart) {
      cameraOffset.dx = Math.max(-40, Math.min(40, dragStart.ox + (px - dragStart.x) * 0.4));
      cameraOffset.dy = Math.max(-24, Math.min(24, dragStart.oy + (py - dragStart.y) * 0.4));
      emit('camera-user', { dx: cameraOffset.dx, dy: cameraOffset.dy });
      render();
    }
  }

  function onPointerUp(e) {
    if (disposed) return;
    if (practice && tracing) {
      tracing = false;
      const [px, py] = pointerPos(e);
      tracePoints.push([px, py]);
      emit('practice-sample', {
        phase: 'end',
        cutId: practice.cutId,
        point: canvasToCm(px, py),
        tMs: performance.now(),
        curvePoints: guideCurveCm(),
      });
      render();
    }
    dragging = false;
    dragStart = null;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => render());
    ro.observe(container);
  }

  let readyTimer = null;
  const ready = new Promise((resolve) => {
    readyTimer = setTimeout(() => {
      if (disposed) return;
      render();
      resolve({ triangles: 0, quality: effectiveQuality, gl: 'webgl2', stub: true });
    }, debug ? 16 : 40);
  });

  return {
    ready,
    setStep(i) {
      stepIndex = Math.max(0, Math.trunc(Number(i) || 0));
      tracePoints = [];
      render();
    },
    setProgress(nextU) {
      u = Math.min(1, Math.max(0, Number(nextU) || 0));
      render();
    },
    setView(nextView) {
      if (nextView === 'cook' || nextView === 'side' || nextView === 'top') {
        view = nextView;
        cameraOffset = { dx: 0, dy: 0 };
        render();
      }
    },
    setXray(bool) {
      xray = Boolean(bool);
      render();
    },
    setLabels(bool) {
      labels = Boolean(bool);
      render();
    },
    setLeftHanded(bool) {
      leftHanded = Boolean(bool);
      render();
    },
    setPractice(cfg) {
      practice = cfg ? { cutId: cfg.cutId || 'cut' } : null;
      tracePoints = [];
      tracing = false;
      render();
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    resetCamera() {
      cameraOffset = { dx: 0, dy: 0 };
      render();
    },
    snapshot() {
      return new Promise((resolve) => {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        } else {
          resolve(null);
        }
      });
    },
    stats() {
      return {
        stub: true,
        speciesId,
        step: stepIndex,
        u,
        view,
        xray,
        labels,
        leftHanded,
        practice: Boolean(practice),
        triangles: 0,
        quality: effectiveQuality,
        frames: frameCount,
      };
    },
    dispose() {
      disposed = true;
      if (readyTimer) clearTimeout(readyTimer);
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      listeners.clear();
      canvas.remove();
    },
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function truncateText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 4 && ctx.measureText(out + '…').width > maxW) {
    out = out.slice(0, -1);
  }
  return out + '…';
}
