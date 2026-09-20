/* 20秒に1回しか来ない位置を、その間つないで走らせるための計算。

   実測位置は離散的にしか届かない。そのまま描くとバスが20秒ごとに瞬間移動する。
   前回位置から新しい位置へ時間で割って動かし、向きも最短回りで回す。 */

/** 2点間の方位(度・北=0・時計回り)。同じ点なら null。 */
export function bearingBetween(fromLat, fromLon, toLat, toLon) {
  const east = (toLon - fromLon) * Math.cos((((fromLat + toLat) / 2) * Math.PI) / 180);
  const north = toLat - fromLat;
  if (Math.abs(east) < 1e-9 && Math.abs(north) < 1e-9) return null;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** 角度の補間。350度→10度は20度ぶんの右回りとして扱う。 */
export function lerpAngle(from, to, t) {
  const difference = ((to - from + 540) % 360) - 180;
  return ((from + difference * t) % 360 + 360) % 360;
}

/* どの向きを採用するか。

   秋田市のフィードは bearing を送ってこない。秋田中央交通は送ってくるが、停車中などに 0.0 が入る。
   0 を「真北を向いている」と信じると、実際には東へ走っているバスが北を向いたまま滑る。
   そこで 0 と欠測は同じ扱いにし、移動方向 → 直前の向き の順で埋める。 */
export function chooseHeading(reported, movement, previous) {
  if (Number.isFinite(reported) && reported !== 0) return ((reported % 360) + 360) % 360;
  if (Number.isFinite(movement)) return movement;
  if (Number.isFinite(previous)) return previous;
  return Number.isFinite(reported) ? ((reported % 360) + 360) % 360 : 0;
}

/** 補間中のいまの位置と向き。duration が 0 なら即座に到着地点。 */
export function sampleTrack(track, now) {
  const t = track.duration > 0 ? Math.min(1, Math.max(0, (now - track.startedAt) / track.duration)) : 1;
  return {
    lat: track.from.lat + (track.to.lat - track.from.lat) * t,
    lon: track.from.lon + (track.to.lon - track.from.lon) * t,
    // 向きは位置より早く合わせる。曲がってから走るほうが自然に見える
    heading: lerpAngle(track.from.heading, track.to.heading, Math.min(1, t * 2)),
    progress: t,
  };
}

export const trackKey = (vehicle) => `${vehicle.op}:${vehicle.id}`;

/* 受信した車両一覧を、補間つきの走行状態へ畳み込む。

   - 新しく現れた車両は、その場に出現させる（存在しなかった地点から飛んでこさせない）
   - 位置が変わった車両は「いま画面にいる場所」から新しい位置へ向かわせる
   - 消えた車両は落とす（返り値に入れない）
   instant は prefers-reduced-motion 用。補間せず即座に新しい位置へ置く。 */
export function updateTracks(previousTracks, vehicles, now, { duration = 20_000, instant = false } = {}) {
  const tracks = new Map();
  for (const vehicle of vehicles) {
    const key = trackKey(vehicle);
    const previous = previousTracks.get(key);
    const base = { key, op: vehicle.op, id: vehicle.id, speed: vehicle.speed, ts: vehicle.ts, receivedAt: now };

    if (!previous) {
      const heading = chooseHeading(vehicle.bearing, null, null);
      const point = { lat: vehicle.lat, lon: vehicle.lon, heading };
      tracks.set(key, { ...base, from: point, to: point, startedAt: now, duration: 0, moved: false });
      continue;
    }

    const current = sampleTrack(previous, now);
    const movement = bearingBetween(previous.to.lat, previous.to.lon, vehicle.lat, vehicle.lon);
    const heading = chooseHeading(vehicle.bearing, movement, previous.to.heading);
    const moved = movement !== null;
    tracks.set(key, {
      ...base,
      from: moved ? { ...current } : { lat: vehicle.lat, lon: vehicle.lon, heading: current.heading },
      to: { lat: vehicle.lat, lon: vehicle.lon, heading },
      startedAt: now,
      duration: moved && !instant ? duration : 0,
      moved,
    });
  }
  return tracks;
}
