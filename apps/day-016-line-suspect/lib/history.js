/* 測定履歴の保管（localStorageのみ。サーバーへは何も送らない）

   壊れたJSONが入っていたときに黙って捨てないのが方針。消すかどうかは利用者に決めさせる
   ＝ Day11-20 に求められる「不正入力の状態」をここで作っている。 */

export const KEY = 'day016.history.v1';
export const LIMIT = 200;
export const VERSION = 1;

/** IPアドレス・地名・座標は保存しない。残すのはこの11項目だけ */
export const FIELDS = ['t', 'dl', 'ul', 'li', 'ld', 'lu', 'jit', 'grade', 'v6', 'eco'];

const num = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export function toRecord(measurement) {
  return {
    t: measurement.t,
    dl: num(measurement.dl),
    ul: num(measurement.ul),
    li: num(measurement.li),
    ld: num(measurement.ld),
    lu: num(measurement.lu),
    jit: num(measurement.jit),
    grade: measurement.grade || '—',
    v6: Boolean(measurement.v6),
    eco: Boolean(measurement.eco)
  };
}

/**
 * 読み出す。壊れていたら例外にせず { broken: true } を返す＝呼び出し側が画面に出せる。
 * @returns {{items: object[], broken: boolean}}
 */
export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return { items: [], broken: true }; // プライベートモード等でアクセス自体が例外になる場合
  }
  if (!raw) return { items: [], broken: false };
  try {
    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION || !Array.isArray(data.items)) return { items: [], broken: true };
    const items = data.items.filter((it) => it && Number.isFinite(it.t) && Number.isFinite(it.dl));
    // 中身が全部落ちるなら、形は合っていても読めていないのと同じ
    if (data.items.length && !items.length) return { items: [], broken: true };
    return { items, broken: false };
  } catch {
    return { items: [], broken: true };
  }
}

/** 追記して保存し、保存後の配列を返す。古いものから落として LIMIT 件に収める */
export function append(storage, items, measurement) {
  const next = [...items, toRecord(measurement)].slice(-LIMIT);
  try {
    storage.setItem(KEY, JSON.stringify({ v: VERSION, items: next }));
  } catch {
    // 容量超過や書き込み禁止。画面の表示は続けたいので落とさない
  }
  return next;
}

export function clear(storage) {
  try {
    storage.removeItem(KEY);
  } catch {
    /* 読めない環境では消せなくてもよい */
  }
  return [];
}

const iso = (t) => new Date(t).toISOString();

/** 表計算にそのまま貼れる形。相談時の材料として持ち出せることが目的 */
export function toCsv(items) {
  const head = 'timestamp,down_mbps,up_mbps,latency_idle_ms,latency_down_ms,latency_up_ms,jitter_ms,grade,ipv6,eco';
  const rows = (items || []).map((it) =>
    [iso(it.t), it.dl, it.ul, it.li, it.ld, it.lu, it.jit, it.grade, it.v6 ? 1 : 0, it.eco ? 1 : 0]
      .map((v) => (v === null || v === undefined ? '' : v))
      .join(',')
  );
  return [head, ...rows].join('\n');
}
