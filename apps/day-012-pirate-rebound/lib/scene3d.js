/* 自前の3D。ライブラリもWebGLも使わず、Canvas 2Dに面を塗るだけで奥行きを出す。

   座標は x=右 / y=上 / z=奥（すべてメートルのつもり）。
   カメラは原点付近に置いて +z を見る。回転はヨー（横回り）だけあれば足りる。

   遠くの物は霧で霞ませる。見た目のためだけでなく、
   「遠い砲弾は目で追えない＝耳で判断する」という設計そのものを支えている。 */

export const NEAR = 0.35;

/** 画面の大きさから、焦点距離と水平線の位置を決める。水平線は少し上（海を広く見せる）。 */
export function createViewport(width, height) {
  return {
    width,
    height,
    focal: Math.max(1, height) * 1.15,
    horizon: height * 0.42
  };
}

export function createCamera(overrides = {}) {
  return { x: 0, y: 1.6, z: 0, ...overrides };
}

/** 世界の1点 → 画面の点。カメラより手前（NEARの内側）は描かない。 */
export function project(point, camera, viewport) {
  const depth = point.z - camera.z;
  if (!(depth > NEAR)) return { visible: false, x: 0, y: 0, scale: 0, depth };
  const scale = viewport.focal / depth;
  return {
    visible: true,
    x: viewport.width / 2 + (point.x - camera.x) * scale,
    y: viewport.horizon - (point.y - camera.y) * scale,
    scale,
    depth
  };
}

/** 霧の濃さ(0〜1)。1に近いほど空の色に溶ける。 */
export function fogAmount(depth, start = 18, end = 95) {
  if (!(depth > start)) return 0;
  return Math.min(1, (depth - start) / (end - start));
}

/** モデルの頂点を、拡大 → ヨー回転 → 平行移動の順に世界へ置く。 */
export function placeModel(model, { position = [0, 0, 0], scale = 1, yaw = 0 } = {}) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const vertices = model.vertices.map(([x, y, z]) => {
    const sx = x * scale;
    const sy = y * scale;
    const sz = z * scale;
    return [
      sx * cos + sz * sin + position[0],
      sy + position[1],
      -sx * sin + sz * cos + position[2]
    ];
  });
  return { vertices, faces: model.faces };
}

/** 面の中心の奥行き。塗る順（奥から手前）を決めるのに使う。 */
export function faceDepth(vertices, face) {
  let sum = 0;
  for (const index of face.v) sum += vertices[index][2];
  return sum / face.v.length;
}

/** 面の法線と光の向きから明るさ(0.25〜1.15)を出す。光は左上手前から。 */
export function faceLight(vertices, face, light = [-0.45, 0.8, -0.4]) {
  const [a, b, c] = face.v.map((index) => vertices[index]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0]
  ];
  const length = Math.hypot(...normal) || 1;
  const dot = (normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]) / length;
  return 0.55 + Math.abs(dot) * 0.6;
}

/** [r,g,b] を明るさと霧で混ぜて、塗れる色にする。 */
export function toFill(rgb, brightness, fog, skyRgb) {
  const mixed = rgb.map((channel, index) => {
    const lit = Math.max(0, Math.min(255, channel * brightness));
    return Math.round(lit + (skyRgb[index] - lit) * fog);
  });
  return `rgb(${mixed[0]} ${mixed[1]} ${mixed[2]})`;
}
