/* 時刻表側の運行本数（network.json の service）から、いまが運行時間内かを判定する。

   実測位置が0台になる理由は2つあって、意味がまったく違う。
   ・時刻表上もバスが走っていない（深夜・早朝）＝正常
   ・走っているはずなのに位置が届いていない＝データ側の異常
   0台をひとまとめにすると、正常な深夜が故障に見える。ここで両者を分ける。 */

// service の各エントリは weekday / saturday / sunday の3種類だけを持つ
const DAY_KEYS = ["sunday", "weekday", "weekday", "weekday", "weekday", "weekday", "saturday"];

/* 土曜と日曜の本数はまったく同じ。秋田中央交通は calendar_dates.txt が毎週「土曜ダイヤを消して
   日祝ダイヤを追加」しており、秋田市も土日祝で1本のサービスになっているため。
   別物として見せる意味がないので、表示は「土日祝」でまとめる。 */
export function dayTypeLabel(day) {
  return day === 0 || day === 6 ? "土日祝" : "平日";
}

/** 日本時間の曜日・時・分。閲覧者の端末が他国時間でも秋田の運行時間で判定するため。 */
export function jstParts(date) {
  const jst = new Date(date.getTime() + 9 * 3_600_000);
  return { day: jst.getUTCDay(), hour: jst.getUTCHours(), minute: jst.getUTCMinutes() };
}

export function scheduleFor(entry, day) {
  return entry?.[DAY_KEYS[day] ?? "weekday"] ?? null;
}

/** 曜日をまたいで時刻をずらす。0時の1時間前は前日の23時で、曜日区分（平日／土日祝）も変わる。 */
function shiftHour(parts, offset) {
  const absolute = parts.hour + offset;
  const dayOffset = Math.floor(absolute / 24);
  return { day: ((parts.day + dayOffset) % 7 + 7) % 7, hour: ((absolute % 24) + 24) % 24 };
}

/** 1事業者ぶんの時刻表の、その曜日・その時刻の便数。読めなければ null。 */
export function hourlyCount(entry, day, hour) {
  const hourly = scheduleFor(entry, day)?.hourly;
  if (!Array.isArray(hourly) || hourly.length !== 24) return null;
  const value = Number(hourly[hour]);
  return Number.isFinite(value) ? value : null;
}

/** その曜日・その時刻に走っているはずの便数。service が無い・壊れている場合は null。 */
export function expectedAt(service, day, hour) {
  if (!Array.isArray(service)) return null;
  let total = 0;
  let known = false;
  for (const entry of service) {
    const count = hourlyCount(entry, day, hour);
    if (count === null) continue;
    known = true;
    total += count;
  }
  return known ? total : null;
}

/* その日の最初の運行時間帯なら初便の時刻（5:40）まで出す。それ以外は「7時」と時単位で丸める。

   hourly[h] は「h時ちょうどに走っている便数」なので、5:40発の便は hourly[5] に現れず hourly[6] に現れる。
   初便の時刻をそのまま出さないと「次に動き出すのは6時」と20分遅く案内してしまう。 */
function startLabel(service, day, hour) {
  for (let earlier = 0; earlier < hour; earlier += 1) {
    if ((expectedAt(service, day, earlier) ?? 0) > 0) return `${hour}時`;
  }
  let best = null;
  for (const entry of service ?? []) {
    const schedule = scheduleFor(entry, day);
    const first = typeof schedule?.first === "string" ? schedule.first : null;
    if (!first || !schedule?.hourly?.some((count) => count > 0)) continue;
    const [firstHour, firstMinute] = first.split(":").map(Number);
    if (!Number.isFinite(firstHour) || !Number.isFinite(firstMinute)) continue;
    const minutes = firstHour * 60 + firstMinute;
    if (best === null || minutes < best.minutes) {
      best = { minutes, text: `${firstHour}:${String(firstMinute).padStart(2, "0")}` };
    }
  }
  return best ? best.text : `${hour}時`;
}

/** 次に運行が始まる時刻。24時間先まで探して見つからなければ null。 */
export function nextServiceStart(service, parts) {
  for (let step = 1; step <= 24; step += 1) {
    const absolute = parts.hour + step;
    const hour = absolute % 24;
    const dayOffset = Math.floor(absolute / 24);
    const day = (parts.day + dayOffset) % 7;
    if ((expectedAt(service, day, hour) ?? 0) > 0) {
      return { hour, dayOffset, label: startLabel(service, day, hour) };
    }
  }
  return null;
}

/** いまの運行状況。known:false なら service が無い版のデータなので、画面では何も出さない。 */
export function serviceStatus(service, parts) {
  const expected = expectedAt(service, parts.day, parts.hour);
  if (expected === null) return { known: false, expected: null, next: null };
  return { known: true, expected, next: expected > 0 ? null : nextServiceStart(service, parts) };
}

/* 運行時間外なのに位置を送り続けている車両を、走行中から外すための判定。

   秋田市の車両1007を3回観測した（2026-08-16 21:24 / 21:36 / 08-17 00:44）。
   座標は3回ともビット単位で同一。前2回は送信時刻も11:54:58のまま止まっていたので
   中継API側の「10分以上古い位置は捨てる」（functions/api/day-009/vehicles.js）で落ちたが、
   00:44の回は座標が同じまま送信時刻だけ3秒前に化けていて、この判定を素通りする。
   時刻に頼れなくなった以上、時刻表側から「そもそも走っているはずのない時間か」を見る。

   前後1時間の猶予を置く。hourly[h] は「h時に走っている便数」の丸めた集計なので、
   21:53発の便が22時台まで走ることも、5:55発の便のために5時台から動き出すこともある。
   境界ぴったりで本当に走っている車両を消すほうが、幽霊を1台残すより害が大きい。 */
const OFF_SERVICE_GRACE_HOURS = 1;

/** その事業者がいま運行時間外か。時刻表が読めないときは false＝除外しない。 */
export function isOffService(entry, parts) {
  for (let offset = -OFF_SERVICE_GRACE_HOURS; offset <= OFF_SERVICE_GRACE_HOURS; offset += 1) {
    const at = shiftHour(parts, offset);
    const count = hourlyCount(entry, at.day, at.hour);
    if (count === null || count > 0) return false;
  }
  return true;
}

/** 運行時間外の事業者から届いた車両を走行中から外す。除外した台数は事業者ごとに数える。 */
export function partitionByService(vehicles, serviceByOp, parts) {
  const running = [];
  const offService = new Map();
  for (const vehicle of vehicles ?? []) {
    if (!isOffService(serviceByOp?.[vehicle?.op] ?? null, parts)) {
      running.push(vehicle);
      continue;
    }
    offService.set(vehicle.op, (offService.get(vehicle.op) ?? 0) + 1);
  }
  return { vehicles: running, offService };
}
