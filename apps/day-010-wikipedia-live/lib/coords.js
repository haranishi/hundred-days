/* 「その記事に座標はあるか」をウィキペディアのAPIへ聞く部分。

   編集は毎秒6件以上流れてくるので、1件ずつ聞くと閲覧者1人で毎秒6回叩くことになる。
   ここでの仕事は、聞く回数を減らしながら地図が寂しくならない程度に引き当てること。

     ・言語版ごとにまとめて聞く（1回につき最大50件）
     ・送信は2.5秒に1回まで、その周期で送るのは最大2リクエストまで
     ・編集が多い上位の言語版だけを対象にする（日本語版は常に対象）
     ・一度聞いた記事名は覚えて二度は聞かない
     ・待ち行列が伸びたら古いものから捨てる（追いつこうとして問い合わせを増やさない）

   ネットワークそのものは呼び出し側から渡す（テストで差し替えるため）。 */

export const BATCH_MAX = 50;
export const INTERVAL_MS = 2500;
export const REQUESTS_PER_TICK = 2;
export const QUEUE_MAX = 120;
export const MEMORY_MAX = 3000;
export const TOP_WIKIS = 6;
export const ALWAYS = ['jawiki'];

export function apiUrl(host, titles) {
  const query = new URLSearchParams({
    action: 'query',
    prop: 'coordinates',
    titles: titles.join('|'),
    format: 'json',
    formatversion: '2',
    origin: '*'
  });
  return `https://${host}/w/api.php?${query}`;
}

/** APIの返事から「記事名 → 座標」を取り出す。座標が無い記事は含めない。 */
export function readCoordinates(payload) {
  const pages = payload && payload.query && Array.isArray(payload.query.pages) ? payload.query.pages : [];
  const found = new Map();
  for (const page of pages) {
    const spot = Array.isArray(page.coordinates) ? page.coordinates[0] : null;
    // 地球以外（月・火星の地名）は世界地図に置けないので捨てる
    if (!spot || (spot.globe && spot.globe !== 'earth')) continue;
    if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) continue;
    found.set(page.title, { lat: spot.lat, lon: spot.lon });
  }
  return found;
}

export function createLookup({ fetchJson, onFound, now = () => Date.now() }) {
  const queues = new Map(); // wiki → { host, titles: [] }
  const asked = new Set();
  const askedOrder = [];
  const seenWikis = new Map(); // wiki → 直近の件数（上位を選ぶため）
  const stats = { asked: 0, requests: 0, found: 0, dropped: 0, skipped: 0 };
  let lastRun = 0;

  const remember = (key) => {
    asked.add(key);
    askedOrder.push(key);
    if (askedOrder.length > MEMORY_MAX) asked.delete(askedOrder.shift());
  };

  /** 編集を1件受け取る。聞く価値があるものだけ待ち行列に積む。 */
  function push(event) {
    if (!event || !event.title || !event.host || !event.wiki) return false;
    seenWikis.set(event.wiki, (seenWikis.get(event.wiki) || 0) + 1);

    const key = `${event.wiki}:${event.title}`;
    if (asked.has(key)) {
      stats.skipped += 1;
      return false;
    }
    remember(key);

    let queue = queues.get(event.wiki);
    if (!queue) {
      queue = { host: event.host, titles: [] };
      queues.set(event.wiki, queue);
    }
    queue.titles.push(event.title);
    // 伸びすぎた行列は古いものから捨てる。追いつくために問い合わせを増やさない
    if (queue.titles.length > QUEUE_MAX) {
      stats.dropped += queue.titles.length - QUEUE_MAX;
      queue.titles.splice(0, queue.titles.length - QUEUE_MAX);
    }
    return true;
  }

  /** いま聞きにいく言語版を選ぶ。編集が多い順＋日本語版は常に。 */
  function pickWikis() {
    const ranked = [...seenWikis.entries()].sort((a, b) => b[1] - a[1]).map(([wiki]) => wiki);
    const allowed = new Set([...ALWAYS, ...ranked.slice(0, TOP_WIKIS)]);
    return [...queues.keys()].filter((wiki) => allowed.has(wiki) && queues.get(wiki).titles.length);
  }

  /** 周期が来ていれば問い合わせる。呼びすぎても間隔は守られる。 */
  async function tick() {
    const at = now();
    if (at - lastRun < INTERVAL_MS) return 0;
    lastRun = at;

    const wikis = pickWikis().slice(0, REQUESTS_PER_TICK);
    let sent = 0;

    for (const wiki of wikis) {
      const queue = queues.get(wiki);
      const titles = queue.titles.splice(0, BATCH_MAX);
      if (!titles.length) continue;
      sent += 1;
      stats.requests += 1;
      stats.asked += titles.length;

      try {
        const payload = await fetchJson(apiUrl(queue.host, titles));
        const found = readCoordinates(payload);
        stats.found += found.size;
        for (const [title, spot] of found) onFound({ wiki, host: queue.host, title, ...spot });
      } catch {
        // 一度の失敗は流す。次の周期でまた別の記事を聞く（同じ記事は追いかけない）
      }
    }

    // 選ばれなかった言語版の行列は、際限なく貯めない
    for (const [wiki, queue] of queues) {
      if (queue.titles.length > QUEUE_MAX) {
        stats.dropped += queue.titles.length - QUEUE_MAX;
        queue.titles.splice(0, queue.titles.length - QUEUE_MAX);
      }
      if (!queue.titles.length && wiki !== 'jawiki') queues.delete(wiki);
    }

    return sent;
  }

  return {
    push,
    tick,
    pickWikis,
    get stats() {
      return { ...stats, queued: [...queues.values()].reduce((n, q) => n + q.titles.length, 0) };
    }
  };
}
