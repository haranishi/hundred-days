// 地図の外の山並み。滑れる山（一辺 6 km）の外側へ、遠くまで続く地形の「背景」を 1 枚の面で足す。
// 無いと、尾根や山頂から見たとき、地図の端で山が切れて、四角い板が霞に浮いて見える。
// 形は地図の端の高さから始まり、外へ行くほど、雑音で作った尾根と谷の山並みへ移る。当たり判定は無い（端の手前で止まる決まり）。
import * as THREE from 'three/webgpu';
import { positionWorld, normalWorld, cameraPosition, smoothstep, mix, vec3, float, length, max, abs, mx_fractal_noise_float, mx_noise_float } from 'three/tsl';

// 端からの距離（m）。内側へ 1 列潜らせ、外へは 1.07 倍ずつ広げる（近くは細かく、遠くは粗く）。
// 1.22 倍のときは、端から 3 km で列の間隔が 660 m になり、峰が丸い丘にしか見えなかった（2026-11-11 の見比べ）
// （さらに 1.035 倍・周り 1,080 分割へ細かくした：尾根と沢の形を、面そのもので出す。計算の凹凸で陰影だけ足す方法は、遠くで四角い段々の模様になった）
const RINGS = [-18, 0];
for (let d = 25; d < 36000; d *= 1.035) RINGS.push(Math.round(d));
const STEPS = 1080; // 周りの分割（端で 18〜25 m）
const BLEND = 1700; // 端の高さから、背景の山並みへ移りきる距離（m）

function hash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
/**
 * 尾根の立った山並み（0〜1）。同じ場所なら、いつも同じ値。
 * minWave：これより細かい起伏は足さない。面の頂点の間隔より細かい起伏を入れると、頂点のあいだで引き伸ばされて、放射状の筋になる（最初の版で出た）
 */
export function ranges(x, z, minWave = 0, seed = 7) {
  let sum = 0, amp = 0.5, wave = 4200, weight = 1;
  for (let o = 0; o < 6 && wave >= minWave; o++) {
    const n = 1 - Math.abs(noise(x / wave + o * 17.3, z / wave - o * 9.1, seed + o * 101) * 2 - 1); // 尾根で 1
    const r = n * n * weight;
    sum += r * amp; weight = Math.min(1, r * 1.6 + 0.25); amp *= 0.5; wave /= 2.05;
  }
  return sum;
}
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * 地図の外の高さ（m）。d は地図の端からの距離。base・top は地図のいちばん低い・高い高さ。
 * 端の近くは低め、遠くは高い峰にする：近くまで高い峰を置くと、地図が壁に囲まれた鉢に見える（最初の版で出た）。
 * 低くしすぎると、山頂から見たとき、周りが平らな野原になる（谷と湖のマップで出た。周りも山の国のはず）
 */
export function backdropHeight(x, z, d, base, top, minWave = 0) {
  // 4 km ほどで、周りの山並みの高さに届かせる（9 km かけると、谷の中から見て、峰が地平線に低く並ぶだけになった）
  // 2026-11-11：地図の外は、低い森の平地にしない。谷の底でも、森の上の端より高い雪の山の国にする
  // （低い所を森の色で塗っていたときは、遠くの山の下に、横一列の灰緑の霧の壁が見えた：見た目の採点 1・2 周目）
  // 南（谷の出口）だけは、低い谷が続く：湖のすぐ南に山の壁を立てると、盆地が鉢に見えた
  const south = smooth(0.25, 0.8, z / (Math.hypot(x, z) || 1));
  const floor = base + (top - base) * (0.38 - 0.35 * south);
  const gain = (0.6 + 0.4 * smooth(500, 3600, d)) * (1 - 0.45 * south * (1 - smooth(5000, 11000, d)));
  return floor + (top - floor) * (0.05 + 1.1 * ranges(x, z, minWave)) * gain;
}

/**
 * @param {{scene:object, world:object, textures:object}} deps
 */
export function createBackdrop({ scene, world, textures }) {
  const half = world.half, [base, top] = world.meta.heightRange;
  const rows = RINGS.length, count = STEPS * rows;
  const position = new Float32Array(count * 3);
  const edge = (t) => Math.min(half, Math.max(-half, t));
  // 端の高さ（周りの 1 周ぶん）と、その累計（ならした値を、どの幅でもすぐ出せるように）
  const edgeHeights = new Float64Array(STEPS), prefix = new Float64Array(STEPS * 2 + 1);
  for (let s = 0; s < STEPS; s++) {
    const a = (s / STEPS) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), reach = half / Math.max(Math.abs(dx), Math.abs(dz));
    edgeHeights[s] = world.heightAt(edge(dx * reach), edge(dz * reach));
  }
  for (let i = 0; i < STEPS * 2; i++) prefix[i + 1] = prefix[i] + edgeHeights[i % STEPS];
  // 端から離れるほど、端の高さを周りの向きにならして使う。ならさないと、端の細かな凹凸（沢の出口など）が、外へまっすぐ引き伸ばされて放射状の溝になる
  const smoothEdge = (s, d) => {
    const radius = Math.min(STEPS / 4, Math.round(d / 110));
    if (radius < 1) return edgeHeights[s];
    const from = s - radius + STEPS, to = s + radius + STEPS;
    return (prefix[to + 1 - (to + 1 > STEPS * 2 ? STEPS : 0)] - prefix[from - (to + 1 > STEPS * 2 ? STEPS : 0)]) / (radius * 2 + 1);
  };
  for (let s = 0; s < STEPS; s++) {
    const a = (s / STEPS) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    // 中心から角度 a へ伸ばした線が、正方形の端に当たる点
    const reach = half / Math.max(Math.abs(dx), Math.abs(dz));
    const bx = edge(dx * reach), bz = edge(dz * reach);
    for (let r = 0; r < rows; r++) {
      const d = RINGS[r], x = bx + dx * d, z = bz + dz * d, i = (r * STEPS + s) * 3;
      let y;
      if (d <= 0) y = world.heightAt(edge(x), edge(z)) - 2.5; // 地図の内側へ少し潜らせて、端のすき間を隠す
      else {
        // この列の頂点の間隔（外向きと、周りの向きの大きいほう）。これの 2.2 倍より細かい起伏は入れない
        const spacing = Math.max(RINGS[Math.min(rows - 1, r + 1)] - d, d - RINGS[r - 1], (reach + d) * (Math.PI * 2 / STEPS));
        const w = smooth(0, BLEND, d);
        y = smoothEdge(s, d) * (1 - w) + backdropHeight(x, z, d, base, top, spacing * 2.2) * w;
      }
      position[i] = x; position[i + 1] = y; position[i + 2] = z;
    }
  }
  const index = [];
  for (let r = 0; r < rows - 1; r++) for (let s = 0; s < STEPS; s++) {
    const a = r * STEPS + s, b = r * STEPS + (s + 1) % STEPS, c = a + STEPS, d = b + STEPS;
    index.push(a, b, c, b, d, c); // 上から見て反時計回り（面の表が上を向く）
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // 色は画素ごとに決める：雪・急な面の岩・森の高さより下の緩い面の暗い森。
  // 頂点に色を持たせる作りは、遠くの大きな三角形で引き伸ばされて、四角いまだらと筋になった（最初の版で出た）。
  // 森は、低い谷の底だけ（周りも雪の山の国。森の上の端を高くすると、地図の外が暗い緑の海に見えた）
  const treeLine = base + (top - base) * 0.34;
  const wxz = positionWorld.xz;
  // 模様は計算で作る雑音にする。地形の細かな雑音の絵（一辺 512 の繰り返し）を大きく引き伸ばすと、絵の中の格子が壁紙のように見えた
  // 森は「森の上の端より下の、急すぎない面」をひと続きに覆う。雑音のしきい値でまだらに切ると、牛の模様に見えた（2026-11-11 の見比べ）。
  // 雑音は、上の端の高さをゆらすのと、濃さのむらにだけ使う
  const forestNoise = mx_fractal_noise_float(vec3(wxz.x.div(900.0), float(3.7), wxz.y.div(900.0)), 3, 2.1, 0.55);
  const n3 = mx_noise_float(vec3(wxz.x.div(70.0), float(1.3), wxz.y.div(70.0))).mul(0.5).add(0.5);
  const line = float(treeLine).add(forestNoise.mul(130));
  // 森は、はっきり切る：森か、雪の開けた所か、のどちらか。ゆるく混ぜると、霞ごしに、灰色がかった緑のもや（霧の壁・暗い雲）に見えた
  // （見た目の採点 1・2 周目と、2026-11-11 の 9 視点の見比べ）。輪郭は、中くらいの雑音（250 m）で入り組ませる
  const P = positionWorld;
  const edgeNoise = mx_noise_float(vec3(wxz.x.div(250.0), float(9.1), wxz.y.div(250.0)));
  const outside = max(abs(wxz.x), abs(wxz.y)).sub(half); // 地図の縁からの距離（m）
  const forest = float(1).sub(smoothstep(line.sub(60), line, P.y.add(edgeNoise.mul(45))))
    .mul(smoothstep(0.66, 0.74, normalWorld.y.add(edgeNoise.mul(0.03))))
    // 雪の開けた所は、少しだけ（大きなむらの、いちばん低い 1 割ほど）。半分を開けたら、丸い暗い島が点々と浮いて、牛の模様に見えた
    .mul(smoothstep(-0.42, -0.32, forestNoise.add(edgeNoise.mul(0.16))))
    // 2026-11-11（見た目の採点 3 周目の後）：森は、地図の縁から 160〜420 m までで終える（広いと、湖の向こうに、暗い帯が残った）。その外は、雪の山並みにする。
    // 3 周続けて「遠くが灰緑の平地」と言われた。森を濃く・はっきり描き直しても同じだった＝参考画像の遠景は、森ではなく、雪の山並みの重なりと雲海
    .mul(float(1).sub(smoothstep(160, 420, outside.add(edgeNoise.mul(150)))));
  // 遠くの峰の岩：面そのものは、なだらか（頂点が粗い）。急な面だけを岩にすると、遠くの山が、白いぼやけた塊に見えた。
  // 傾きに、縦に長い筋の雑音を足して、やや急な面に、岩の肋（あばら）を出す。色だけで足す（陰影の凹凸は、遠くで四角い段々になった）
  const rib = float(1).sub(mx_noise_float(vec3(P.x.div(230.0), P.y.div(520.0), P.z.div(230.0)).add(vec3(2.3, 5.1, 7.7))).abs().mul(2));
  const ribBig = mx_fractal_noise_float(vec3(P.x.div(640.0), P.y.div(900.0), P.z.div(640.0)), 3, 2.1, 0.5);
  const steep = float(1).sub(normalWorld.y);
  const rock = smoothstep(0.17, 0.25, steep.add(rib.mul(0.07)).add(ribBig.mul(0.06)).add(n3.sub(0.5).mul(0.03))).mul(0.86).mul(float(1).sub(forest));
  const rockColor = mix(vec3(0.17, 0.165, 0.17), vec3(0.34, 0.31, 0.275), smoothstep(-0.4, 0.5, ribBig).mul(0.7).add(n3.mul(0.3)));
  // 森の色：暗い緑に、木立ちのむら（70 m）をわずかに。地図の中の遠くの森（terrain.js の forestDeep）と同じ暗さ
  // 森の中のむら（400 m）：木の密な所は暗く、まばらな所は、木のあいだの雪が見えて明るい。一様な暗い緑だと、地図の外が、暗い緑の海に見えた
  const sparse = smoothstep(-0.05, 0.55, mx_noise_float(vec3(wxz.x.div(420.0), float(5.9), wxz.y.div(420.0))).add(edgeNoise.mul(0.3)));
  const forestColor = mix(mix(vec3(0.026, 0.052, 0.04), vec3(0.085, 0.125, 0.105), n3.mul(0.7).add(forestNoise.mul(0.15).add(0.1))), vec3(0.4, 0.46, 0.47), sparse.mul(0.5));
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const surface = mix(mix(vec3(0.9, 0.925, 0.965), rockColor, rock), forestColor, forest);
  // 遠いほど、空の色（青みの白）へ寄せる：重なった山並みの、奥ほど淡く見える
  const far = smoothstep(2500, 16000, length(P.sub(cameraPosition)));
  // 雲海：遠くの低い所（谷の底）を、明るい雲の色で埋める。峰だけが、雲の上に並ぶ（参考画像の遠景）
  const cloudTop = float(base + (top - base) * 0.2).add(mx_noise_float(vec3(wxz.x.div(1700.0), float(2.6), wxz.y.div(1700.0))).mul(110));
  const cloud = float(1).sub(smoothstep(cloudTop.sub(120), cloudTop.add(40), P.y)).mul(smoothstep(1500, 4200, outside));
  material.colorNode = mix(mix(surface, vec3(0.7, 0.8, 0.93), far.mul(0.5)), vec3(0.93, 0.95, 0.985), cloud.mul(0.92));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'backdrop';
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);
  return { mesh, dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); } };
}
