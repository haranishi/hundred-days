/* GET /api/day-009/vehicles
   秋田県内でGTFS-RTのVehiclePositionを公開している2事業者から実測位置を取り、JSONにして返す。

   ここをサーバー側に置く理由は3つ。
   1. 上流がCORSヘッダを返さないので、ブラウザから直接は読めない
   2. 提供元が高頻度アクセスを断っているため、利用者が何人いても上流到達を20秒に1回に抑える必要がある
   3. 上流はProtocol Buffersで、位置以外の情報（trip_id・停留所順・車両ラベル等）も入っている

   Pages Functions はリポジトリのルート直下 functions/ から /api/day-009/vehicles だけに割り当てられる。
   ほかのパス（既存8アプリの静的ファイル）は素通しなので影響しない。 */

// 上流。GTFS-RTの実測位置を公開しているのはこの2事業者だけ（秋田県内18事業者中）。
const SOURCES = [
  { op: "chuo", url: "https://ajt-mobusta-gtfs.mcapps.jp/realtime/52/vehicle_position.bin" },
  { op: "akitacity", url: "https://akita.bustei.net/VehiclePosition.pb" },
];

const UPSTREAM_CACHE_TTL_SECONDS = 20; // 提供元への配慮。これを短くしないこと
const UPSTREAM_TIMEOUT_MS = 8_000;
const STALE_LIMIT_SECONDS = 600;
const BOUNDS = { latMin: 38.8, latMax: 40.6, lonMin: 139.4, lonMax: 141.1 };

// ---------------------------------------------------------------- protobuf

/* 必要なフィールドだけ読む最小デコーダ。外部ライブラリは使わない。
   実測で確認したフィールド番号（2026-08-16）:
     FeedMessage        1=header, 2=entity(繰り返し)
     FeedHeader         3=timestamp
     FeedEntity         1=id(string), 4=vehicle
     VehiclePosition    2=position, 5=timestamp, 8=vehicle(VehicleDescriptor)
     Position           1=latitude, 2=longitude, 3=bearing, 5=speed（いずれもfloat32・リトルエンディアン）
     VehicleDescriptor  1=id(string)
   事業者によってフィールドの出現順が違う（秋田市は8→2の順で来る）ので、順序に依存せず読む。 */

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

export function readVarint(bytes, pos) {
  let value = 0;
  let shift = 0;
  let index = pos;
  while (index < bytes.length) {
    const byte = bytes[index];
    index += 1;
    // ビット演算だと32bitで溢れるのでべき乗で組む（timestampは10桁）
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: index };
    shift += 7;
    if (shift > 63) break;
  }
  throw new Error("varintが壊れています");
}

// [start, end) を1メッセージとして走査し、フィールドごとに visit を呼ぶ。
// visit(field, wire, a, b): varint は a=値、32/64bit は a=先頭位置、
// length-delimited は [a, b) が中身の範囲。
export function forEachField(bytes, start, end, visit) {
  let pos = start;
  while (pos < end) {
    const key = readVarint(bytes, pos);
    const field = Math.floor(key.value / 8);
    const wire = key.value % 8;
    pos = key.next;
    if (wire === WIRE_VARINT) {
      const varint = readVarint(bytes, pos);
      visit(field, wire, varint.value);
      pos = varint.next;
    } else if (wire === WIRE_LEN) {
      const length = readVarint(bytes, pos);
      const from = length.next;
      const to = from + length.value;
      if (to > end) throw new Error("length-delimitedが範囲外です");
      visit(field, wire, from, to);
      pos = to;
    } else if (wire === WIRE_I32) {
      visit(field, wire, pos);
      pos += 4;
    } else if (wire === WIRE_I64) {
      visit(field, wire, pos);
      pos += 8;
    } else {
      throw new Error(`未対応のwire type: ${wire}`);
    }
  }
}

const decodeText = (bytes, from, to) => new TextDecoder().decode(bytes.subarray(from, to));

function decodePosition(view, bytes, start, end, out) {
  forEachField(bytes, start, end, (field, wire, offset) => {
    if (wire !== WIRE_I32) return; // odometer(field 4)は64bitだが使わない
    if (field === 1) out.lat = view.getFloat32(offset, true);
    else if (field === 2) out.lon = view.getFloat32(offset, true);
    else if (field === 3) out.bearing = view.getFloat32(offset, true);
    else if (field === 5) out.speed = view.getFloat32(offset, true);
  });
}

function decodeVehiclePosition(view, bytes, start, end) {
  const out = { id: "", lat: null, lon: null, bearing: null, speed: null, ts: null };
  forEachField(bytes, start, end, (field, wire, a, b) => {
    if (field === 2 && wire === WIRE_LEN) decodePosition(view, bytes, a, b, out);
    else if (field === 5 && wire === WIRE_VARINT) out.ts = a;
    else if (field === 8 && wire === WIRE_LEN) {
      forEachField(bytes, a, b, (inner, innerWire, from, to) => {
        if (inner === 1 && innerWire === WIRE_LEN) out.id = decodeText(bytes, from, to);
      });
    }
  });
  return out;
}

/** GTFS-RTのFeedMessageから、フィード生成時刻と車両の生データを取り出す。 */
export function decodeFeed(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const feed = { feedTs: null, vehicles: [] };
  forEachField(bytes, 0, bytes.length, (field, wire, a, b) => {
    if (field === 1 && wire === WIRE_LEN) {
      forEachField(bytes, a, b, (headerField, headerWire, value) => {
        if (headerField === 3 && headerWire === WIRE_VARINT) feed.feedTs = value;
      });
      return;
    }
    if (field !== 2 || wire !== WIRE_LEN) return;
    let entityId = "";
    let vehicle = null;
    forEachField(bytes, a, b, (entityField, entityWire, from, to) => {
      if (entityField === 1 && entityWire === WIRE_LEN) entityId = decodeText(bytes, from, to);
      else if (entityField === 4 && entityWire === WIRE_LEN) vehicle = decodeVehiclePosition(view, bytes, from, to);
    });
    if (vehicle) feed.vehicles.push({ ...vehicle, id: vehicle.id || entityId });
  });
  return feed;
}

// ---------------------------------------------------------------- 正規化

export function isInsideAkita(lat, lon) {
  return (
    Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= BOUNDS.latMin && lat <= BOUNDS.latMax
    && lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax
  );
}

const round5 = (value) => Math.round(value * 1e5) / 1e5;
const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

/* 上流の生データを、画面が必要とする項目だけに絞る。

   位置が古い車両は捨てる。秋田市のフィードはフィード自体を数十秒ごとに作り直しているのに、
   中の車両の位置送信時刻が9時間以上前で止まったまま同じ座標を返し続けることがある
   （2026-08-16 21:36 実測）。そのまま描くと動かないバスが夜通し「走行中」に見えるため、
   10分以上古い位置は走行中として扱わない。
   timestampが無い車両は「古い」と断定できないので残す。 */
export function normalizeVehicles(rawVehicles, op, nowSeconds, staleLimitSeconds = STALE_LIMIT_SECONDS) {
  const vehicles = [];
  let staleDropped = 0;
  for (const raw of rawVehicles) {
    if (!isInsideAkita(raw.lat, raw.lon)) continue;
    const ts = Number.isFinite(raw.ts) && raw.ts > 0 ? raw.ts : null;
    if (ts !== null && nowSeconds - ts > staleLimitSeconds) {
      staleDropped += 1;
      continue;
    }
    vehicles.push({
      id: String(raw.id || "").slice(0, 64) || `${op}-${vehicles.length + 1}`,
      op,
      lat: round5(raw.lat),
      lon: round5(raw.lon),
      bearing: finiteOrNull(raw.bearing),
      speed: finiteOrNull(raw.speed),
      ts,
    });
  }
  return { vehicles, staleDropped };
}

// ---------------------------------------------------------------- 取得

async function fetchUpstream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/octet-stream" },
      // Cloudflare側で20秒キャッシュしてから上流へ行く。利用者が増えても上流への到達回数は増えない
      cf: { cacheTtl: UPSTREAM_CACHE_TTL_SECONDS, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

async function loadSource(source, nowSeconds) {
  try {
    const buffer = await fetchUpstream(source.url);
    const feed = decodeFeed(buffer);
    const { vehicles, staleDropped } = normalizeVehicles(feed.vehicles, source.op, nowSeconds);
    return { op: source.op, ok: true, error: null, feedTs: feed.feedTs, staleDropped, count: vehicles.length, vehicles };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? `応答がありません（${UPSTREAM_TIMEOUT_MS / 1000}秒でタイムアウト）`
      : String(error?.message || error);
    return { op: source.op, ok: false, error: message, feedTs: null, staleDropped: 0, count: 0, vehicles: [] };
  }
}

export async function onRequestGet() {
  const now = Date.now();
  const results = await Promise.all(SOURCES.map((source) => loadSource(source, Math.floor(now / 1000))));
  const sources = results.map(({ vehicles, ...rest }) => rest);
  const body = {
    updatedAt: new Date(now).toISOString(),
    vehicles: results.flatMap((result) => result.vehicles),
    sources,
  };

  // 片方でも取れていれば返す。両方落ちたときだけエラーにする
  const failed = results.every((result) => !result.ok);
  if (failed) body.error = "2事業者のどちらからも位置を取得できませんでした";

  return new Response(JSON.stringify(body), {
    status: failed ? 502 : 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": failed ? "no-store" : "public, max-age=10, s-maxage=20",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
