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

/** その曜日・その時刻に走っているはずの便数。service が無い・壊れている場合は null。 */
export function expectedAt(service, day, hour) {
  if (!Array.isArray(service)) return null;
  let total = 0;
  let known = false;
  for (const entry of service) {
    const hourly = scheduleFor(entry, day)?.hourly;
    if (!Array.isArray(hourly) || hourly.length !== 24) continue;
    const value = Number(hourly[hour]);
    if (!Number.isFinite(value)) continue;
    known = true;
    total += value;
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
