const categoryCodes = { Physics: 'phy', Chemistry: 'che', 'Physiology or Medicine': 'med', Literature: 'lit', Peace: 'pea', 'Economic Sciences': 'eco' };
export const liveSlot = 'day060.live.v1';
export const ageSlot = 'day060.age.v1';
export function getStorage(scope = globalThis) { try { return scope.localStorage; } catch { return null; } }
export function savedAge(storage) { try { return storage?.getItem(ageSlot) || ''; } catch { return ''; } }
export function saveAge(storage, value) { try { value ? storage?.setItem(ageSlot, value) : storage?.removeItem(ageSlot); } catch { /* 画面は動く */ } }
export function cacheLifetime(now) {
  return now >= Date.parse('2026-10-05T00:00:00+09:00') && now < Date.parse('2026-10-13T00:00:00+09:00') ? 30 * 60000 : 24 * 3600000;
}
export function normalizeResponses(prizeResponse, laureateResponse) {
  if (!Array.isArray(prizeResponse?.nobelPrizes) || !Array.isArray(laureateResponse?.laureates)) throw new Error('応答の形式');
  // 応答中の links はたどらない。接続先は固定した2本だけ。
  if (Number(prizeResponse.meta?.count) > prizeResponse.nobelPrizes.length || Number(laureateResponse.meta?.count) > laureateResponse.laureates.length) throw new Error('応答が途中');
  const peopleById = new Map(laureateResponse.laureates.map((person) => [String(person.id), person]));
  const awards = [], orgs = [], prizes = [];
  for (const prize of prizeResponse.nobelPrizes) {
    const cat = categoryCodes[prize.category?.en];
    if (!cat || Number(prize.awardYear) !== 2026) throw new Error('分野または年');
    const people = [];
    for (const entry of prize.laureates || []) {
      const id = String(entry.id);
      if (!/^\d+$/.test(id)) throw new Error('受賞者番号');
      const detail = peopleById.get(id);
      const personalPrize = detail?.nobelPrizes?.find((p) => Number(p.awardYear) === 2026 && categoryCodes[p.category?.en] === cat);
      const isOrg = Boolean(entry.orgName || detail?.orgName);
      const row = { id, en: entry.knownName?.en || entry.orgName?.en || entry.fullName?.en || detail?.knownName?.en || '名前はデータ待ち', ja: null,
        year: 2026, cat, date: prize.dateAwarded || personalPrize?.dateAwarded || null,
        status: personalPrize?.prizeStatus || 'received', motivation: entry.motivation?.en || personalPrize?.motivation?.en || null,
        born: detail?.birth?.date || null, died: detail?.death?.date || null, isOrg };
      people.push(row);
      // 生年月日が届くまで、同梱分の既知の年齢を上書きしない。
      if (isOrg) orgs.push(row); else if (row.born) awards.push(row);
    }
    prizes.push({ cat, year: 2026, date: prize.dateAwarded || null, people });
  }
  return { awards, orgs, prizes };
}
export function loadCache(storage) {
  try {
    const value = JSON.parse(storage?.getItem(liveSlot) || 'null');
    if (value?.v !== 1 || !Number.isFinite(value.fetchedAt)) return null;
    return { ...normalizeResponses(value.prizeResponse, value.laureateResponse), fetchedAt: value.fetchedAt };
  } catch { return null; }
}
export async function fetchCurrent({ storage = null, now = Date.now(), fetcher = fetch, force = false } = {}) {
  const cache = loadCache(storage);
  const elapsed = cache ? now - cache.fetchedAt : Infinity;
  if (!force && elapsed >= 0 && elapsed < cacheLifetime(now)) return { ...cache, state: 'stale', saved: true };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let responses;
    try {
      responses = await Promise.all(['nobelPrizes', 'laureates'].map(async (resource) => {
        const response = await fetcher(`https://api.nobelprize.org/2.1/${resource}?nobelPrizeYear=2026&limit=100`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
        if (!response.ok) throw new Error('今年の取得失敗');
        return response.json();
      }));
    } finally { clearTimeout(timer); controller.abort(); }
    const [prizeResponse, laureateResponse] = responses;
    const data = normalizeResponses(prizeResponse, laureateResponse);
    try { storage?.setItem(liveSlot, JSON.stringify({ v: 1, fetchedAt: now, prizeResponse, laureateResponse })); } catch { /* 保存禁止でも動く */ }
    return { ...data, fetchedAt: now, state: 'ready', saved: false };
  } catch {
    return cache ? { ...cache, state: 'stale', saved: true, failed: true } : { awards: [], prizes: [], state: 'error', failed: true };
  }
}
