/* 自前の3D投影。地図ライブラリもタイルも使わない。

   平面(km) → ヨー回転 → ピッチ回転 → 透視投影、という一本道。
   ワールド座標は x=東, y=北, z=高さ（すべてkm）。
   カメラは原点（秋田県の中心）を distance km 離れた位置から見下ろす。
   pitch は真上から見た状態が0度、地平線と同じ高さが90度。 */

export const NEAR_PLANE_KM = 1;

// ピッチの下限は「見下ろしすぎて路線が潰れない」角度、上限は「地平線の向こうが見えない」角度
export const PITCH_MIN = 14;
export const PITCH_MAX = 78;

// 画面の高さに対する焦点距離の比。大きいほど望遠＝遠近の歪みが小さい
export const FOCAL_RATIO = 1.9;

export function createViewport(width, height) {
  return { width, height, focal: Math.max(1, height) * FOCAL_RATIO };
}

export function createCamera(overrides = {}) {
  return clampCamera({
    yaw: -20,
    pitch: 58,
    distance: 200,
    minDistance: 40,
    maxDistance: 600,
    // 注視点（平面km）。0のときは県の中心を見る。秋田市へ寄るときだけ動かす
    targetX: 0,
    targetY: 0,
    // 画面上の寄せ量(px)。県の形は画面中央に対して偏っているので、
    // フィットの結果を平行移動で中央へ寄せる（縮尺は変えない）
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  });
}

export function clampCamera(camera) {
  return {
    ...camera,
    yaw: ((camera.yaw % 360) + 360) % 360,
    pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, camera.pitch)),
    distance: Math.min(camera.maxDistance, Math.max(camera.minDistance, camera.distance)),
  };
}

/** 幅×高さ(km)の平面が画面に収まるカメラ距離。ヨーで回した後の外接矩形で考える。 */
export function fitDistance(span, camera, viewport, margin = 0.92) {
  const yaw = (camera.yaw * Math.PI) / 180;
  const pitch = (camera.pitch * Math.PI) / 180;
  const rotatedWidth = Math.abs(span.width * Math.cos(yaw)) + Math.abs(span.height * Math.sin(yaw));
  const rotatedHeight = Math.abs(span.width * Math.sin(yaw)) + Math.abs(span.height * Math.cos(yaw));
  // 傾けるほど南北方向は縮んで見えるので、見かけの高さに cos(pitch) を掛ける
  const byWidth = (rotatedWidth * viewport.focal) / (viewport.width * margin);
  const byHeight = (rotatedHeight * Math.cos(pitch) * viewport.focal) / (viewport.height * margin);
  return Math.max(byWidth, byHeight, 1);
}

/** ワールド(km) → 画面(px)。手前クリップに掛かった点は visible:false を返す。 */
export function projectPoint(x, y, z, camera, viewport) {
  const yaw = (camera.yaw * Math.PI) / 180;
  const pitch = (camera.pitch * Math.PI) / 180;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const localX = x - (camera.targetX ?? 0);
  const localY = y - (camera.targetY ?? 0);
  const right = localX * cosYaw + localY * sinYaw;
  const forward = -localX * sinYaw + localY * cosYaw;
  const depth = camera.distance + forward * sinPitch - z * cosPitch;
  if (!(depth > NEAR_PLANE_KM)) return { x: 0, y: 0, depth, visible: false };

  const scale = viewport.focal / depth;
  return {
    x: viewport.width / 2 + (camera.offsetX ?? 0) + right * scale,
    y: viewport.height / 2 + (camera.offsetY ?? 0) - (forward * cosPitch + z * sinPitch) * scale,
    depth,
    scale,
    visible: true,
  };
}

/* 県全体を「画面いっぱい」に収めるための2つの道具。

   fitDistance は bbox（長方形）を正射影として扱う近似なので、実際の点群が長方形の
   角まで埋まっていない秋田県では、上下に大きな余白が残る。そこで代表点を投影して
   実測し、外接矩形が画面いっぱいになるまで距離を詰める。 */

/** 点群を投影したときの画面上の外接矩形。全点が手前クリップに掛かったら null。 */
export function projectBounds(points, camera, viewport) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let seen = 0;
  for (let index = 0; index < points.length / 2; index += 1) {
    const point = projectPoint(points[index * 2], points[index * 2 + 1], 0, camera, viewport);
    if (!point.visible) continue;
    seen += 1;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  if (seen === 0) return null;
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/* 数万点をそのまま投影すると画面サイズが変わるたびに重いので、代表点だけ残す。
   透視投影は平面の射影変換なので、画面上の外接矩形の端は必ず平面上の凸包の頂点に来る。
   方向を等分してその方向で最も外側の点を拾えば、凸包に十分近い数十点で足りる。 */
export function contentExtremes(xy, directions = 64) {
  const total = xy.length / 2;
  const picked = new Set();
  for (let step = 0; step < directions; step += 1) {
    const angle = (Math.PI * 2 * step) / directions;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = -Infinity;
    let bestIndex = -1;
    for (let index = 0; index < total; index += 1) {
      const value = xy[index * 2] * dx + xy[index * 2 + 1] * dy;
      if (value > best) {
        best = value;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) picked.add(bestIndex);
  }
  const out = new Float64Array(picked.size * 2);
  let cursor = 0;
  for (const index of picked) {
    out[cursor * 2] = xy[index * 2];
    out[cursor * 2 + 1] = xy[index * 2 + 1];
    cursor += 1;
  }
  return out;
}

/** 点群が画面いっぱいに収まる距離と寄せ量。投影の大きさは距離にほぼ反比例するので、
    外接矩形と目標の比を距離に掛けるだけで数回で収束する。 */
export function fitContent(points, camera, viewport, options = {}) {
  const { margin = 0.94, start = 200, steps = 16 } = options;
  const flat = { ...camera, offsetX: 0, offsetY: 0 };
  let distance = Math.max(1, start);
  if (points.length < 2) return { distance, offsetX: 0, offsetY: 0 };

  let box = null;
  for (let step = 0; step < steps; step += 1) {
    box = projectBounds(points, { ...flat, distance }, viewport);
    if (!box) return { distance, offsetX: 0, offsetY: 0 };
    const ratio = Math.max(box.width / (viewport.width * margin), box.height / (viewport.height * margin));
    if (Math.abs(ratio - 1) < 0.002) break;
    distance = Math.max(1, distance * ratio);
  }
  box = projectBounds(points, { ...flat, distance }, viewport) ?? box;
  return {
    distance,
    offsetX: viewport.width / 2 - (box.minX + box.maxX) / 2,
    offsetY: viewport.height / 2 - (box.minY + box.maxY) / 2,
  };
}

/** 方位(度・北=0・時計回り)を、平面上の前方向ベクトルに直す。 */
export function headingVector(heading) {
  const radians = (heading * Math.PI) / 180;
  return { x: Math.sin(radians), y: Math.cos(radians) };
}
