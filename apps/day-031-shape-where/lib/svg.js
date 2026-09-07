/* 同梱データの輪郭（rings）を SVG の path に直す。
   rings は [x, y, x, y, …] を並べた配列で、外側の輪郭も穴も同じ入れ物に入っている。
   どちらが穴かは持たせず fill-rule="evenodd" で塗り分ける（データを軽くするための割り切り）。 */

const FRAME = 1000;

const round = (value) => Math.round(value * 100) / 100;

/** 1本のリングを "M x y L x y … Z" にする。4点未満のリングは絵にならないので捨てる */
function ringToPath(ring) {
  if (!Array.isArray(ring) || ring.length < 8 || ring.length % 2 !== 0) return '';
  const parts = [];
  for (let i = 0; i < ring.length; i += 2) {
    const x = round(ring[i]);
    const y = round(ring[i + 1]);
    parts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** 全リングを1本の d につなぐ。描くものが無ければ空文字（呼ぶ側は空を入れない判断ができる） */
export function ringsToPath(rings) {
  if (!Array.isArray(rings)) return '';
  return rings.map(ringToPath).filter(Boolean).join(' ');
}

/** 町の形を県の枠（0〜1000）の中へ置く。pos = [cx, cy, size] の size が長い辺になる */
export function placeRings(rings, pos) {
  if (!Array.isArray(rings) || !Array.isArray(pos) || pos.length < 3) return [];
  const [cx, cy, size] = pos.map(Number);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(size) || size <= 0) return [];
  const scale = size / FRAME;
  const half = FRAME / 2;
  return rings.map((ring) => {
    const out = new Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      out[i] = round(cx + (ring[i] - half) * scale);
      out[i + 1] = round(cy + (ring[i + 1] - half) * scale);
    }
    return out;
  });
}

/** 町の形を県の枠に置いたうえで path にする（ヒントと正解表示の小さい地図で使う） */
export function placedPath(rings, pos) {
  return ringsToPath(placeRings(rings, pos));
}
