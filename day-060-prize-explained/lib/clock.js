export function readNow(search = '', fallback = Date.now()) {
  // URLSearchParams は未エスケープの + を空白にする。仕様の手入力URLも受け取る。
  const raw = new URLSearchParams(search).get('now')?.replace(/ /g, '+');
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?\+09:00$/.test(raw)) return fallback;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
export const timeText = (at) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }).format(at).replace(':', '時') + '分';
export const afterWeek = (now) => now >= Date.parse('2026-10-13T00:00:00+09:00');
