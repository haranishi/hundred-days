/* シルエットの形を作る純関数。同梱データを作る tools/build-data.mjs と tests から読む。
   ここが「地図」と「絵」の境界。入口は緯度経度だが、出口（normalizeShape・positionIn）は
   0〜1000 の整数しか返さない。同梱データに緯度経度と縮尺を残さない約束（data/SOURCES.md）は
   この一方通行で守っている。逆算できる情報（中心緯度・倍率）は frame に入るが、frame は
   ビルド中だけの値で、data/*.json には書き出さない。

   座標の形は GeoJSON の MultiPolygon と同じ入れ子にそろえた。
     parts = [ part, … ]／part = [ 外側リング, 穴リング, … ]／ring = [ [lon, lat], … ]
   出力の rings は「外側も穴も同じ並び」の平坦な整数配列 [x, y, x, y, …] で、
   各リングは閉じていない（最後の点が最初の点に戻らない）。描くときは Z で閉じる。 */

const CANVAS_SIZE = 1000;
/* 面積が最大の部分の何割まで小さい島を残すか。1%＝日本の市町村だと「地図で見える島」がおおむね残る */
const MIN_PART_AREA_RATIO = 0.01;
/* 最大の部分の外接矩形の対角線の何倍まで離れた島を残すか。1.5倍より遠いものは、
   小笠原諸島のように「同じ絵に入れると本体が点になる」ので落とす */
const MAX_PART_DISTANCE_RATIO = 1.5;
/* 「近い」と見なす距離。ここまでは面積1%でも残す */
const NEAR_PART_DISTANCE_RATIO = 1.0;
/* 穴として残す最小の等周比（4πA/P²）。1 が真円、0 に近いほど細長い */
const MIN_HOLE_ISOPERIMETRIC = 0.32;
/* 穴として残す最小の面積（外側リング比）。これ未満は 480px の枠で点になる */
const MIN_HOLE_AREA_RATIO = 0.0005;
/* 近くはないが 1.5 倍以内にある部分に求める面積。ここを 10% にすると、
   上島町（ほぼ同じ大きさの島2つ）や日高町（分断された2地区）のように「離れた部分こそが形」の町は
   残り、多度津町の佐柳島・佐世保市の宇久島のように本体を隅へ追いやるだけの小島は落ちる */
const FAR_PART_MIN_AREA_RATIO = 0.1;
const DEGREES_TO_RADIANS = Math.PI / 180;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** リングの符号付き面積の2倍（靴ひも公式）。向きは見ないので絶対値で使う */
function doubleSignedArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    total += x1 * y2 - x2 * y1;
  }
  return total;
}

/** 外側から穴を引いた面積。穴の方が大きい壊れたデータでも負にはしない */
export function partArea(part) {
  if (!part || !part.length) return 0;
  const outer = Math.abs(doubleSignedArea(part[0])) / 2;
  let holes = 0;
  for (let index = 1; index < part.length; index += 1) holes += Math.abs(doubleSignedArea(part[index])) / 2;
  return Math.max(0, outer - holes);
}

/** 点の集まりの外接矩形。空なら null */
export function boundsOf(parts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    for (const ring of part) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** 外接矩形の中心の緯度。経度を縮める倍率をここから決める */
export function centerLatitudeOf(parts) {
  const bounds = boundsOf(parts);
  return bounds ? (bounds.minY + bounds.maxY) / 2 : 0;
}

/** 緯度経度を平面へ。x は緯度に応じて経度を縮め、y は北が上になるよう符号を反転する */
export function projectParts(parts, centerLatitude) {
  const cosLatitude = Math.cos(centerLatitude * DEGREES_TO_RADIANS);
  return parts.map((part) => part.map((ring) => ring.map(([lon, lat]) => [lon * cosLatitude, -lat])));
}

/* 島の取捨。飛び地だらけの市町村（男鹿市・根室市など）をそのまま描くと、
   本体が画面の隅の点になって「形」が分からなくなる。最大の部分からの距離で2段に分け、
   遠いほど大きさを求める。
     近い（nearRatio まで）      … 面積が最大の areaRatio 以上なら残す
     遠い（distanceRatio まで）  … 面積が最大の farMinAreaRatio 以上のときだけ残す
     それより遠い                … 落とす
   都道府県の輪郭は distanceRatio を 1.0 にして呼ぶので、中間の帯は生じない。 */
export function keepMainParts(parts, options = {}) {
  const areaRatio = options.areaRatio ?? MIN_PART_AREA_RATIO;
  const distanceRatio = options.distanceRatio ?? MAX_PART_DISTANCE_RATIO;
  const nearRatio = Math.min(options.nearRatio ?? NEAR_PART_DISTANCE_RATIO, distanceRatio);
  const farMinAreaRatio = options.farMinAreaRatio ?? FAR_PART_MIN_AREA_RATIO;
  if (!parts || parts.length <= 1) return parts ? [...parts] : [];
  const centerLatitude = options.centerLatitude ?? centerLatitudeOf(parts);
  const projected = projectParts(parts, centerLatitude);
  const measured = parts.map((part, index) => {
    const bounds = boundsOf([projected[index]]);
    return {
      part,
      area: partArea(projected[index]),
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerY: (bounds.minY + bounds.maxY) / 2,
      diagonal: Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
    };
  });
  // 大きい順に並べる。同じ面積なら元の順で（同じ入力から同じ出力になるように）
  const ordered = measured
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => (b.area - a.area) || (a.index - b.index));
  const main = ordered[0];
  const near = main.diagonal * nearRatio;
  const limit = main.diagonal * distanceRatio;
  return ordered
    .filter((item, rank) => {
      if (rank === 0) return true;
      const distance = Math.hypot(item.centerX - main.centerX, item.centerY - main.centerY);
      if (distance > limit) return false;
      const required = distance <= near ? areaRatio : farMinAreaRatio;
      return item.area >= main.area * required;
    })
    .map((item) => item.part);
}

/* 旧市町村の境界に沿って残る「スリバー」の穴を落とす。融合しても稀に糸のような隙間が残り、
   evenodd で塗ると本体を横切る白い線に見える。実データ（37個の穴）を測ると、
   本物の飛び地（柏崎市の中の刈羽村＝等周比 0.36・面積比 4.5%）と、細長い隙間（木津川市 0.22・0.08%、
   廿日市市 0.24・0.08%）は等周比 0.30 と 0.36 の間で分かれた。面積比 0.05% 未満のものは、
   細長くなくても 480px では点にしかならないので同じく落とす。
   穴だけを見る（外側リングは触らない）ので、島の取捨（keepMainParts）とは別の関数にした。 */
export function dropSliverHoles(parts, options = {}) {
  const minIsoperimetric = options.minIsoperimetric ?? MIN_HOLE_ISOPERIMETRIC;
  const minAreaRatio = options.minAreaRatio ?? MIN_HOLE_AREA_RATIO;
  if (!parts || !parts.length) return [];
  const projected = projectParts(parts, centerLatitudeOf(parts));
  return parts.map((part, index) => {
    if (part.length < 2) return part;
    const outerArea = Math.abs(doubleSignedArea(projected[index][0])) / 2;
    return part.filter((ring, ringIndex) => {
      if (ringIndex === 0) return true;
      const measured = projected[index][ringIndex];
      const area = Math.abs(doubleSignedArea(measured)) / 2;
      if (outerArea > 0 && area / outerArea < minAreaRatio) return false;
      const length = ringLength(measured);
      return length > 0 && (4 * Math.PI * area) / (length * length) >= minIsoperimetric;
    });
  });
}

/** リングの周長。閉じていない並びとして扱い、最後の点から最初の点へ戻る辺も足す */
function ringLength(ring) {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

/* 緯度経度の形を 0〜1000 の正方形いっぱいに収める。長い辺を 1000 に合わせ、短い辺は中央へ寄せる。
   どの県も市町村も同じ大きさに見えるので、縮尺で答えが割れない（＝これが遊びの前提）。 */
export function normalizeShape(parts) {
  const centerLatitude = centerLatitudeOf(parts);
  const projected = projectParts(parts, centerLatitude);
  const bounds = boundsOf(projected);
  if (!bounds) return { rings: [], frame: null };
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const longSide = Math.max(width, height);
  const scale = longSide > 0 ? CANVAS_SIZE / longSide : 1;
  const frame = {
    centerLatitude,
    scale,
    minX: bounds.minX,
    minY: bounds.minY,
    offsetX: (CANVAS_SIZE - width * scale) / 2,
    offsetY: (CANVAS_SIZE - height * scale) / 2,
  };
  const rings = [];
  for (const part of projected) {
    const converted = part.map((ring) => flattenRing(ring, frame));
    // 外側が潰れた部分は穴ごと捨てる。穴だけが残ると evenodd で白い抜けになる
    if (!converted[0]) continue;
    for (const ring of converted) if (ring) rings.push(ring);
  }
  return { rings, frame };
}

/** 1リングを frame の座標へ移し、整数に丸めて重複点を落とす。点が足りなければ null */
function flattenRing(ring, frame) {
  const flat = [];
  let lastX = null;
  let lastY = null;
  for (const [x, y] of ring) {
    const nextX = clamp(Math.round(frame.offsetX + (x - frame.minX) * frame.scale), 0, CANVAS_SIZE);
    const nextY = clamp(Math.round(frame.offsetY + (y - frame.minY) * frame.scale), 0, CANVAS_SIZE);
    if (nextX === lastX && nextY === lastY) continue;
    flat.push(nextX, nextY);
    lastX = nextX;
    lastY = nextY;
  }
  // 閉じるための最後の1点は持たない（描く側が Z で閉じる）
  while (flat.length >= 4 && flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1]) flat.length -= 2;
  return flat.length >= 8 ? flat : null;
}

/* 県の枠のどこに町があるか。県と同じ投影・同じ枠で測った外接矩形の中心と長い辺を返す。
   ヒントの地図は、県の輪郭の中にこの [cx, cy, size] で町を置いて描く。

   far は「中心が枠の外に出た」印。県の輪郭からは遠い離島を落としてあるので、その島にある町
   （小笠原村など）はここに来る。pos は枠の縁へ寄せた値になり、位置としては正しくない。
   ヒントを出すかどうかを描く側が決められるよう、丸めて隠さずに立てておく。 */
export function positionIn(frame, projectedParts) {
  const bounds = boundsOf(projectedParts);
  if (!frame || !bounds) return null;
  const toX = (x) => frame.offsetX + (x - frame.minX) * frame.scale;
  const toY = (y) => frame.offsetY + (y - frame.minY) * frame.scale;
  const left = toX(bounds.minX);
  const right = toX(bounds.maxX);
  const top = toY(bounds.minY);
  const bottom = toY(bounds.maxY);
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return {
    pos: [
      clamp(Math.round(centerX), 0, CANVAS_SIZE),
      clamp(Math.round(centerY), 0, CANVAS_SIZE),
      clamp(Math.round(Math.max(right - left, bottom - top)), 1, CANVAS_SIZE),
    ],
    far: centerX < 0 || centerX > CANVAS_SIZE || centerY < 0 || centerY > CANVAS_SIZE,
  };
}
