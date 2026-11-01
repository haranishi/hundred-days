// OWNER: core
// 説明の画面の見取り図：ステージのデータ（塀・建物・門・水抜き穴・信長・開始地点）から一度だけ描く。上が北。
// r02-fix-play 追加：体験の採点 1 位「物見の報告の『西』『北東』が画面の向きと結びつかず、最初の 30 秒で行き先を決められない」。
// 入り口は「外周の土塀にある門」と「くぐれる塀（crawl）」をデータから拾う。中門（板塀の門）は入り口に数えない。
import type { StageDef, Vec2 } from '../stage/types';

const MINCHO = "'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', serif";
const KIN = '#c9a75b';
const SHU = '#c8402c';
const KINARI = '#efe6d2';

export interface MapEntrance {
  name: string;
  pos: Vec2;
}

/** 外から寺へ入れる所：外周の土塀にある門と、しゃがんでくぐれる塀。 */
export function stageEntrances(stage: StageDef): MapEntrance[] {
  const out: MapEntrance[] = [];
  const dobei = stage.walls.filter((w) => w.kind === 'dobei' && !w.crawl);
  for (const gt of stage.gates) {
    // 門の切れ目の両側の塀（門の中心に一番近い塀）が土塀なら、外周の門
    let best = Infinity;
    let onDobei = false;
    for (const w of stage.walls) {
      if (w.kind === 'town') continue;
      const d = Math.min(Math.hypot(w.a.x - gt.center.x, w.a.z - gt.center.z), Math.hypot(w.b.x - gt.center.x, w.b.z - gt.center.z));
      if (d < best) {
        best = d;
        onDobei = dobei.includes(w);
      }
    }
    if (onDobei) out.push({ name: gt.name, pos: gt.center });
  }
  for (const w of stage.walls) if (w.crawl) out.push({ name: '水抜き穴', pos: { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 } });
  return out;
}

/** 見取り図を canvas に描く。幅と高さは CSS の px（中で端末の画素の倍率を掛ける）。 */
export function drawStageMap(canvas: HTMLCanvasElement, stage: StageDef, width: number, height: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bd = stage.bounds;
  const pad = 6;
  const k = Math.min((width - pad * 2) / (bd.x1 - bd.x0), (height - pad * 2) / (bd.z1 - bd.z0));
  const ox = (width - (bd.x1 - bd.x0) * k) / 2;
  const oy = (height - (bd.z1 - bd.z0) * k) / 2;
  // 上が北（−Z）。地図の z が小さいほど上
  const X = (x: number): number => ox + (x - bd.x0) * k;
  const Y = (z: number): number => oy + (z - bd.z0) * k;

  g.clearRect(0, 0, width, height);
  g.fillStyle = 'rgba(8,10,16,0.82)';
  g.fillRect(0, 0, width, height);

  // 町屋の並び（外周）は薄く
  g.strokeStyle = 'rgba(239,230,210,0.14)';
  g.lineWidth = 1;
  g.strokeRect(X(bd.x0) + 0.5, Y(bd.z0) + 0.5, (bd.x1 - bd.x0) * k - 1, (bd.z1 - bd.z0) * k - 1);

  // 建物
  g.font = `10px ${MINCHO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const b of stage.buildings) {
    const f = b.footprint;
    g.fillStyle = b.open ? 'rgba(239,230,210,0.1)' : 'rgba(239,230,210,0.18)';
    g.fillRect(X(f.x0), Y(f.z0), (f.x1 - f.x0) * k, (f.z1 - f.z0) * k);
    if ((f.x1 - f.x0) * k >= 34 && (f.z1 - f.z0) * k >= 14) {
      g.fillStyle = 'rgba(239,230,210,0.55)';
      g.fillText(b.name, X((f.x0 + f.x1) / 2), Y((f.z0 + f.z1) / 2) + 0.5);
    }
  }

  // 塀：土塀は太く、板塀は細く
  for (const w of stage.walls) {
    if (w.kind === 'town' || w.crawl) continue;
    g.strokeStyle = w.kind === 'dobei' ? 'rgba(239,230,210,0.75)' : 'rgba(239,230,210,0.5)';
    g.lineWidth = w.kind === 'dobei' ? 2.2 : 1.2;
    g.beginPath();
    g.moveTo(X(w.a.x), Y(w.a.z));
    g.lineTo(X(w.b.x), Y(w.b.z));
    g.stroke();
  }

  const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign, size = 11): void => {
    g.font = `600 ${size}px ${MINCHO}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(8,10,16,0.95)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };

  // 入り口：金の菱形と名前。名前は寺の外側へ、地図の端からはみ出さない向きに置く
  const cx = (bd.x0 + bd.x1) / 2;
  const cz = (bd.z0 + bd.z1) / 2;
  for (const e of stageEntrances(stage)) {
    const x = X(e.pos.x);
    const y = Y(e.pos.z);
    g.fillStyle = KIN;
    g.beginPath();
    g.moveTo(x, y - 4.5);
    g.lineTo(x + 4.5, y);
    g.lineTo(x, y + 4.5);
    g.lineTo(x - 4.5, y);
    g.closePath();
    g.fill();
    const dx = e.pos.x - cx;
    const dz = e.pos.z - cz;
    if (Math.abs(dx) > Math.abs(dz)) {
      // 東西の塀：名前は内側に置く（外は通りの幅しかない）。北や南の塀に近い入り口は、塀の線に重ねないよう横に並べる
      const nearNS = Math.min(Math.abs(e.pos.z - bd.z0), Math.abs(e.pos.z - bd.z1)) < 14;
      label(e.name, dx > 0 ? x - 8 : x + 8, nearNS ? y : y - 10, KIN, dx > 0 ? 'right' : 'left');
    } else {
      label(e.name, x + 7, dz > 0 ? y + 9 : y - 9, KIN, 'left');
    }
  }

  // 開始地点
  const ps = stage.player.start;
  g.fillStyle = KINARI;
  g.beginPath();
  g.arc(X(ps.x), Y(ps.z), 3, 0, Math.PI * 2);
  g.fill();
  label('ここから', X(ps.x) - 6, Y(ps.z), KINARI, 'right', 10);

  // 信長
  const nb = stage.guards.find((x) => x.role === 'target');
  if (nb) {
    const x = X(nb.start.x);
    const y = Y(nb.start.z);
    g.fillStyle = SHU;
    g.beginPath();
    g.arc(x, y, 3.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = KIN;
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(x, y, 6.5, 0, Math.PI * 2);
    g.stroke();
    label('信長', x + 9, y, '#ffb39e', 'left');
  }

  // 北
  label('北↑', pad + 2, pad + 8, KIN, 'left', 11);
}
