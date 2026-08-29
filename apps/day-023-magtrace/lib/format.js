export function formatFetchedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatToday(value = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(value);
}

export function yearOverYear(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  if (previous === 0) return current === 0 ? "±0" : "新規";
  const difference = current - previous;
  return `${difference >= 0 ? "+" : ""}${difference}`;
}

export function isCached(fetchedAt, currentTime = Date.now()) {
  const fetched = new Date(fetchedAt).getTime();
  return Number.isFinite(fetched) && currentTime - fetched >= 60_000;
}
