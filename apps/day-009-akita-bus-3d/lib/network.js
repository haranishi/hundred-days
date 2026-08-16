/* data/network.json（静的な路線網）を描画用の形へ組み替える。

   毎フレーム緯度経度から計算し直すと重いので、読み込み時に一度だけ平面(km)へ直して
   平坦な配列に詰める。描画時に必要なのは回転と透視だけになる。 */

import { boundsCenter, toPlane } from "./geo.js";

/* 中継APIの op コード ↔ network.json の operators[].name の対応表。
   ここ以外で op コードと事業者名を結びつけない。表記ゆれで静かに壊れるのを防ぐため、
   一致は完全一致のみとし、見つからなければ -1 を返して「対応なし」を明示する。 */
export const OPERATOR_TABLE = [
  { op: "chuo", name: "秋田中央交通", label: "秋田中央交通" },
  { op: "akitacity", name: "秋田市", label: "秋田市（ぐるる・マイタウン・バス）" },
];

export function operatorLabel(op) {
  return OPERATOR_TABLE.find((entry) => entry.op === op)?.label ?? String(op ?? "不明");
}

export function resolveOperatorIndex(operators, op) {
  const entry = OPERATOR_TABLE.find((item) => item.op === op);
  if (!entry || !Array.isArray(operators)) return -1;
  return operators.findIndex((operator) => operator?.name === entry.name);
}

/* shaped は「道なりの形状(shapes.txt)を公開しているか」。無い版のデータでも落とさず、
   欠けていたら true 扱いにする（誤って全路線を「近似」と表示するほうが害が大きい）。 */
function normalizeOperators(operators) {
  return (Array.isArray(operators) ? operators : []).map((operator) => ({
    name: String(operator?.name ?? "不明"),
    live: operator?.live === true,
    shaped: operator?.shaped !== false,
    lineCount: Number(operator?.lineCount) || 0,
    stopCount: Number(operator?.stopCount) || 0,
  }));
}

export function buildNetwork(data) {
  const origin = boundsCenter(data?.bbox);
  const operators = normalizeOperators(data?.operators);
  const rawLines = Array.isArray(data?.lines) ? data.lines : [];
  const rawStops = Array.isArray(data?.stops) ? data.stops : [];

  const flag = (index, key) => (operators[index]?.[key] ? 1 : 0);

  let pointCount = 0;
  for (const line of rawLines) pointCount += Array.isArray(line?.p) ? line.p.length : 0;

  const lineXY = new Float32Array(pointCount * 2);
  const starts = new Uint32Array(rawLines.length + 1);
  const lineLive = new Uint8Array(rawLines.length);
  const lineShaped = new Uint8Array(rawLines.length);

  let cursor = 0;
  rawLines.forEach((line, index) => {
    starts[index] = cursor;
    lineLive[index] = flag(line?.op, "live");
    lineShaped[index] = flag(line?.op, "shaped");
    for (const [lon, lat] of line?.p ?? []) {
      const plane = toPlane(lon, lat, origin);
      lineXY[cursor * 2] = plane.x;
      lineXY[cursor * 2 + 1] = plane.y;
      cursor += 1;
    }
  });
  starts[rawLines.length] = cursor;

  const stopXY = new Float32Array(rawStops.length * 2);
  const stopLive = new Uint8Array(rawStops.length);
  rawStops.forEach((stop, index) => {
    const plane = toPlane(stop?.c?.[0] ?? origin.lon, stop?.c?.[1] ?? origin.lat, origin);
    stopXY[index * 2] = plane.x;
    stopXY[index * 2 + 1] = plane.y;
    stopLive[index] = flag(stop?.op, "live");
  });

  return {
    origin,
    bbox: data?.bbox,
    generatedAt: String(data?.generatedAt ?? ""),
    operators,
    service: Array.isArray(data?.service) ? data.service : null,
    lines: { xy: lineXY, starts, live: lineLive, shaped: lineShaped, count: rawLines.length },
    stops: { xy: stopXY, live: stopLive, count: rawStops.length },
    totals: {
      operators: operators.length,
      live: operators.filter((operator) => operator.live).length,
      shaped: operators.filter((operator) => operator.shaped).length,
      lines: rawLines.length,
      points: pointCount,
      stops: rawStops.length,
    },
  };
}
