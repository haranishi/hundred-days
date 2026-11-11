// 目印の置き場所を、山のデータから決める（three.js を読まない純粋な計算。試験できる）。
// 出発地点の門・駅の門・ジャンプ台の踏み切りの線と旗・崖の縁の竹ざお。古い山のデータ（駅や仕掛けが無い）でも動く。
const POLE = 0x3b3128; // 竹ざお・柱：雪の上で沈む濃い茶
const ORANGE = 0xe2702a; // 画面の強調色と同じ橙（出発地点・駅・崖）
const BLUE = 0x1f5fae; // ジャンプ台：実際の雪上の台と同じく、踏み切りを青で示す
const WHITE = 0xe9edf2;
const RAMP = 0x86addf; // ジャンプ台の踏み切りの面：薄い青（雪の上で、台の立ち上がりが面として見える）

/** 向き h（0 が北＝−Z、時計回り）の、進む向きと右向き */
export function basis(h) { return { fx: Math.sin(h), fz: -Math.cos(h), sx: Math.cos(h), sz: Math.sin(h) }; }

/** 目印の一覧を、山のデータから作る（描画から切り離してあるので、試験できる） */
export function markerPlan(world) {
  const meta = world.meta || {};
  const poles = []; // { x, z, height, radius, color }
  const flags = []; // { x, z, height, heading, color, size }
  const banners = []; // { x, z, height, heading, width, color }
  const lines = []; // { x, z, heading, width（横の幅）, depth（進む向きの幅）, color }：雪面に引く線
  const pair = (x, z, h, half, height, color, flagSize = 0.5, radius = 0.018) => {
    const b = basis(h);
    for (const side of [-1, 1]) {
      const px = x + b.sx * half * side, pz = z + b.sz * half * side;
      poles.push({ x: px, z: pz, height, radius, color: POLE });
      flags.push({ x: px, z: pz, height: height - 0.08, heading: h, color, size: flagSize });
    }
  };
  /** 横に並べた破線（縁の手前 back m に、幅 width ぶん） */
  const dashes = (x, z, h, width, color, back = 1.2, depth = 0.5) => {
    const b = basis(h), dash = 1.6, gap = 1.1, n = Math.max(1, Math.floor((width + gap) / (dash + gap))), total = n * dash + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const t = -total / 2 + dash / 2 + i * (dash + gap);
      lines.push({ x: x + b.sx * t - b.fx * back, z: z + b.sz * t - b.fz * back, heading: h, width: dash, depth, color });
    }
  };
  const mid = (v) => (Array.isArray(v) ? (Number(v[0]) + Number(v[1])) / 2 : Number(v));
  for (const d of world.drops || []) {
    if (!Number.isFinite(d.x) || !Number.isFinite(d.z)) continue;
    // 滑り出しのカメラのすぐ横に立つので、広く・低くする（幅 3.4 m・高さ 1.9 m では、柱が画面の左右を塞いだ）
    pair(d.x, d.z, d.heading || 0, 2.8, 1.45, ORANGE, 0.34);
  }
  for (const s of meta.stations || []) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    // 門は、山の上（来る向き）から見て正面になるように置く：雪面の下る向きを読む
    const out = {};
    world.sampleSurface(s.x, s.z, out);
    const h = Math.hypot(out.nx, out.nz) > 1e-4 ? Math.atan2(out.nx, -out.nz) : 0;
    const b = basis(h);
    for (const side of [-1, 1]) poles.push({ x: s.x + b.sx * 3.2 * side, z: s.z + b.sz * 3.2 * side, height: 4.4, radius: 0.07, color: POLE });
    banners.push({ x: s.x, z: s.z, height: 3.7, heading: h, width: 6.4, color: ORANGE });
    pair(s.x - b.fx * 9, s.z - b.fz * 9, h, 5.5, 2.2, ORANGE, 0.5);
  }
  for (const f of meta.features || []) {
    if (!Number.isFinite(f.x) || !Number.isFinite(f.z)) continue;
    const half = Math.max(4, (f.width || 14) / 2);
    // 2026-11-11：目印を、太く・高く・多くした。竹ざお（太さ 3.6 cm・高さ 2 m）と小さな旗だけでは、30 m 先から見えず、
    // 「縁の目印が旗 1 本しかなく、崖が崖に見えない」「段の縁が見分けにくい」になった（体験の採点 1 周目）
    const h = f.heading || 0, b = basis(h);
    if (f.kind === 'kicker') {
      // 縁：太い柱と大きな青い旗（遠くから、台の場所が分かる）。踏み切りの線は、太い青の帯
      pair(f.x, f.z, h, half + 0.8, 3.2, BLUE, 0.95, 0.045);
      lines.push({ x: f.x - b.fx * 0.75, z: f.z - b.fz * 0.75, heading: h, width: half * 2 * 0.86, depth: 0.9, color: BLUE });
      // 踏み切りの面（縁の手前 6.4 m）を、薄い青で塗る。助走の側からは、台が「平らな雪に青い線があるだけ」に見えた（体験の採点 2 周目）。
      // 面を塗ると、立ち上がった斜面が、手前の雪より大きな青い面として見える
      lines.push({ x: f.x - b.fx * 4.4, z: f.z - b.fz * 4.4, heading: h, width: half * 2 * 0.86, depth: 6.4, color: RAMP });
      // 助走の両わきに、5 m おきの短い線（坂の幅と、まっすぐ入る向きを見せる）
      const back = Math.max(10, (f.length || 30) * 0.5);
      for (let d = 5; d <= back; d += 5) for (const side of [-1, 1]) {
        lines.push({ x: f.x - b.fx * d + b.sx * side * half * 0.93, z: f.z - b.fz * d + b.sz * side * half * 0.93, heading: h, width: 0.4, depth: 2.2, color: BLUE });
      }
      // 助走の入口にも 1 組（どこから坂が始まるかを見せる）
      pair(f.x - b.fx * back, f.z - b.fz * back, h, half + 0.8, 1.9, WHITE, 0.45, 0.03);
      // 着地の目安：入る速さと滞空の中央から、縁の先の距離を出して、青い破線と小さな旗を置く（空中から、降りる所が見える）
      const reach = mid(f.speed) * mid(f.air);
      if (Number.isFinite(reach) && reach > 4) {
        dashes(f.x + b.fx * reach, f.z + b.fz * reach, h, half * 2 * 1.3, BLUE, 0, 0.6);
        pair(f.x + b.fx * reach, f.z + b.fz * reach, h, half * 1.3 + 1.5, 1.8, BLUE, 0.5, 0.03);
      }
    } else if (f.kind === 'cliff' || f.kind === 'lip') {
      // 縁の両端に、太い柱と橙の旗。縁の 6 m 手前に、橙の破線（どこで雪面が切れるかを、雪の上に見せる）。
      // 自然の段は、縁の手前から丸く落ちはじめる：縁のすぐ手前（1.2 m）に引いたら、丸みの向こうに隠れて、助走から見えなかった
      pair(f.x, f.z, h, half + 0.6, 2.8, ORANGE, 0.8, 0.04);
      dashes(f.x, f.z, h, half * 2, ORANGE, 6);
      // 崖は、10 m 手前にも 1 組（段より大きく落ちる合図）
      if (f.kind === 'cliff') pair(f.x - b.fx * 10, f.z - b.fz * 10, h, half + 0.6, 2.2, ORANGE, 0.6, 0.035);
    }
  }
  return { poles, flags, banners, lines };
}
