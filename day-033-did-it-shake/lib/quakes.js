/* 同じ地震の発表をまとめてから、答えと背景の数字を作る。DOMには触れない。 */
import { dateOf, clockOf, dayOf, relativeTime } from './time.js';
import { resolveTown, DESIGNATED_CITIES } from './towns.js';
export const RECENT_MINUTES = 15;
export const INTENSITIES = ['1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
export const intensityLabel = (value) => String(value).replace('-', '弱').replace('+', '強');
export const maxIntensity = (values) => values.filter((value) => INTENSITIES.includes(value))
  .sort((a, b) => INTENSITIES.indexOf(b) - INTENSITIES.indexOf(a))[0] ?? null;
const newest = (rows) => [...rows].sort((a, b) => Date.parse(b.rdt) - Date.parse(a.rdt))[0];
export function groupEvents(list, now) {
  const groups = new Map();
  for (const row of list) {
    if (!(Date.parse(row.rdt) <= now)) continue;
    if (!groups.has(row.eid)) groups.set(row.eid, []);
    groups.get(row.eid).push(row);
  }
  const events = [];
  for (const rows of groups.values()) {
    if (rows.some((row) => row.ift === '取消')) continue;
    const detail = newest(rows.filter((row) => row.ttl === '震源・震度情報'));
    const intensity = detail ?? newest(rows.filter((row) => row.ttl === '震度速報'));
    if (!intensity || !INTENSITIES.includes(intensity.maxi)) continue;
    const hypo = newest(rows.filter((row) => ['震源・震度情報', '震源に関する情報'].includes(row.ttl) && row.mag));
    const at = Date.parse(intensity.at);
    if (!Number.isFinite(at) || at > now) continue;
    events.push({ eid: intensity.eid, at, rdt: Math.max(Date.parse(intensity.rdt), hypo ? Date.parse(hypo.rdt) : 0),
      maxi: intensity.maxi, int: intensity.int, provisional: !detail,
      anm: hypo?.anm || intensity.anm || '震源地は確認中', mag: hypo?.mag || intensity.mag || null });
  }
  return events.sort((a, b) => b.at - a.at || b.rdt - a.rdt);
}
export function townIntensity(event, place, places = [place]) {
  if (!place || event.provisional) return null;
  return maxIntensity(event.int.flatMap((pref) => pref.city ?? [])
    // 地点一覧を省いた呼び出しでも、通常の市を政令市へ寄せない。区はコードの3桁目が1。
    .filter((city) => city.code.slice(0, 5) === place.c ||
      (city.code[2] === '1' && DESIGNATED_CITIES.includes(place.c) && resolveTown(city.code, places) === place.c))
    .map((city) => city.maxi));
}
export const sourceParts = (event) => [event.anm, event.mag ? ` M${event.mag}・` : '・', `最大震度${intensityLabel(event.maxi)}`].filter(Boolean);
export const sourceText = (event) => sourceParts(event).join('');
export function answer({ events, now, place = null, places = place ? [place] : [] }) {
  const recent = events.filter((event) => event.at <= now && now - event.at <= RECENT_MINUTES * 60000);
  const event = recent[0];
  if (!event) {
    const subParts = ['発表は揺れてから', '1〜5分かかります。', '少し待って、', 'もう一度押してください'];
    const noteParts = events[0] ? ['最後の地震：', `${relativeTime(events[0].at, now)} `, ...sourceParts(events[0])] : [];
    return { kind: 'none', heading: '15分以内の発表はありません', headingParts: ['15分以内の', '発表はありません'], intensity: null,
      sub: subParts.join(''), subParts, note: noteParts.join(''), noteParts, event: null };
  }
  const ago = relativeTime(event.at, now);
  const intensity = townIntensity(event, place, places);
  const pref = place && event.int.find((item) => item.code === place.c.slice(0, 2));
  let kind, headingParts, subParts;
  const maxLabel = intensityLabel(event.maxi);
  if (!place) {
    kind = 'recent'; headingParts = [`${ago}、`, '地震がありました'];
    subParts = event.provisional ? [`震度${maxLabel}以上の`, '揺れを観測（第一報）'] : sourceParts(event);
  } else if (intensity) {
    kind = 'shook'; headingParts = ['揺れました'];
    subParts = [`${ago}（${clockOf(event.at)}）に発生。`, '震源 ', ...sourceParts(event)];
  } else if (event.provisional && pref) {
    kind = 'shook-pref'; headingParts = ['揺れました', '（第一報）'];
    subParts = [`${ago}・`, `あなたの県（${place.p}）で`, `震度${intensityLabel(pref.maxi)}以上を観測。`, '市区町村ごとの発表を', '待っています'];
  } else {
    kind = 'elsewhere'; headingParts = ['あなたの街では、', '観測されていません'];
    subParts = event.provisional ? [`${ago}・`, `震度${maxLabel}以上の`, '揺れを観測（第一報）']
      : [`${ago}に`, `${event.anm}で地震`, `（最大震度${maxLabel}${event.mag ? `・M${event.mag}` : ''}）`];
  }
  // *Parts は折り返してよい位置の区切り（画面側が <wbr> にする）。文字列はその連結
  const noteParts = recent.length > 1 ? [`ほかに${recent.length - 1}件`] : [];
  return { kind, heading: headingParts.join(''), headingParts, sub: subParts.join(''), subParts, note: noteParts.join(''), noteParts, intensity, event };
}
export const todayCount = (events, now) => events.filter((event) => dateOf(event.at) === dateOf(now)).length;
export function strip(events, now) {
  const end = Math.floor(now / 3600000) * 3600000;
  return Array.from({ length: 24 }, (_, index) => {
    const hourStart = end - (23 - index) * 3600000;
    const inside = events.filter((event) => event.at >= hourStart && event.at < hourStart + 3600000 && event.at <= now);
    return { hourStart, count: inside.length, maxi: maxIntensity(inside.map((event) => event.maxi)) };
  });
}
export function lastAtYourTown(events, place, places = place ? [place] : [], { skipEid = null } = {}) {
  const oldestAt = events.length ? Math.min(...events.map((event) => event.at)) : null;
  for (const event of events) {
    if (event.eid === skipEid) continue; // 答えに出ている地震そのものは「最後に揺れた」に数えない
    const intensity = townIntensity(event, place, places);
    if (intensity) return { event, intensity, oldestAt, before: Boolean(skipEid) };
  }
  return { event: null, intensity: null, oldestAt, before: Boolean(skipEid) };
}
export const recentList = (events) => [...events].sort((a, b) => b.at - a.at).slice(0, 10);
export function townText(last) {
  const lead = last.before ? 'その前にあなたの街で揺れたのは' : 'あなたの街で最後に揺れたのは';
  if (last.event) return `${lead} ${dayOf(last.event.at)} ${clockOf(last.event.at)}（震度${intensityLabel(last.intensity)}・${last.event.anm}${last.event.mag ? ` M${last.event.mag}` : ''}）`;
  if (last.oldestAt === null) return '一覧の中に震度1以上の発表はありません';
  return last.before ? `${dayOf(last.oldestAt)}以降では、この地震が最初の観測です` : `${dayOf(last.oldestAt)}以降、震度1以上は観測されていません`;
}
export const postText = ({ count, result }) => `『揺れた？』きょう日本で震度1以上の地震は${count}回。${result.heading}${result.intensity ? `。あなたの街は震度${intensityLabel(result.intensity)}` : ''}`;
