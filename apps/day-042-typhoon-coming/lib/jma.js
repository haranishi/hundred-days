/* 気象庁 bosai サイトの台風JSONを取って、形を確かめる。
   これは公式に案内されたWebAPIではなくサイト内部のデータなので、形が予告なく変わる前提で読む。
   壊れていたら空の答えを作らず ShapeError を投げ、画面は「取得できませんでした」で止める。

   外へ出るのはこのファイルが組み立てるURLだけ。宛先は www.jma.go.jp のみ。 */

export const BASE = 'https://www.jma.go.jp/bosai/typhoon/data/';
export const TARGET_TC = `${BASE}targetTc.json`;
export const TIMEOUT_MS = 20000;
/** 3時間ごとの系列は5日ぶんの40本、積算は1〜5日の5本で固定（375地域すべてで揃う） */
export const STEPS = 40;
export const THROUGH_STEPS = 5;

export class ShapeError extends Error {
  constructor(what) { super(`発表の形が変わったようです（${what}）`); this.name = 'ShapeError'; }
}

export const dataUrl = (tropicalCyclone, name) => `${BASE}${tropicalCyclone}/${name}.json`;

/** 数値で来たり文字列で来たりする項目を数値に揃える。該当なしの "-" は null */
export function num(value) {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "-" を落とした表示用の文字列。該当なしの項目を「-」と出さないため */
export const text = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed !== '-' ? trimmed : '';
};

/* 時刻は日本時間（+09:00）で届く前提で画面を作っている（lib/time.js）。
   Z や他のオフセットに変わったら、9時間ずれた文を黙って出す前に形の変化として止める */
const isIso = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\+09:00$/.test(value);

/** targetTc.json。空配列は「いま台風なし」。404 は失敗であって台風なしではない */
export function parseTargets(value) {
  if (!Array.isArray(value)) throw new ShapeError('targetTc');
  return value.map((row) => {
    if (!row || typeof row.tropicalCyclone !== 'string' || !/^[A-Z0-9]+$/.test(row.tropicalCyclone)
      || typeof row.typhoonNumber !== 'string' || !isIso(row.issue)) throw new ShapeError('targetTc');
    return {
      tropicalCyclone: row.tropicalCyclone,
      typhoonNumber: row.typhoonNumber,
      /* 「2625」の下2桁が台風第25号。年の下2桁は画面に出さない */
      number: Number(row.typhoonNumber.slice(-2)),
      category: text(row.category),
      issue: row.issue,
    };
  });
}

function parseProbability(value, steps, what) {
  if (!value || typeof value !== 'object' || !isIso(value.targetDatetime)
    || !Array.isArray(value.validtime) || value.validtime.length !== steps
    || !value.validtime.every(isIso)) throw new ShapeError(what);
  const probability = value.probability;
  if (!probability || typeof probability !== 'object') throw new ShapeError(what);
  const areas = Object.keys(probability);
  /* 地域は375件で固定。多少増減しても読めるが、桁や系列長が変わったら読み違えるので止める */
  if (areas.length < 300) throw new ShapeError(what);
  for (const area of areas) {
    const series = probability[area];
    if (!/^\d{6}$/.test(area) || !Array.isArray(series) || series.length !== steps
      || !series.every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) throw new ShapeError(what);
  }
  return { targetDatetime: value.targetDatetime, validtime: value.validtime, probability };
}

export const parseTimeseries = (value) => parseProbability(value, STEPS, 'probabilityTimeseries');
export const parseThrough = (value) => parseProbability(value, THROUGH_STEPS, 'probabilityThrough');

const rangesOf = (list) => (Array.isArray(list) ? list : []).map((entry) => ({
  /* 全方向同じなら {jp:'全域'}、非対称なら "北東" のような文字列が入る */
  area: typeof entry?.area === 'string' ? entry.area : text(entry?.area?.jp),
  km: num(entry?.range?.km),
})).filter((entry) => entry.area && entry.km !== null);

/** specifications.json。1件目が title、2件目が実況、以降が12/24/45/69/93時間後の予報 */
export function parseSpecifications(value) {
  if (!Array.isArray(value) || value.length < 2 || value[0]?.part !== 'title') throw new ShapeError('specifications');
  const head = value[0];
  if (!isIso(head?.issue?.JST) || typeof head.typhoonNumber !== 'string') throw new ShapeError('specifications');
  const body = value.slice(1).map((row) => ({
    part: text(row?.part?.jp),
    advancedHours: num(row?.advancedHours) ?? 0,
    validtime: row?.validtime?.JST ?? '',
    category: text(row?.category?.jp),
    scale: text(row?.scale),
    intensity: text(row?.intensity),
    position: Array.isArray(row?.position?.deg) ? { lat: num(row.position.deg[0]), lng: num(row.position.deg[1]) } : null,
    accuracy: text(row?.accuracy ?? row?.position?.accuracy),
    location: text(row?.location),
    course: text(row?.course),
    speedKmh: num(row?.speed?.['km/h']),
    pressure: num(row?.pressure),
    windMs: num(row?.maximumWind?.sustained?.['m/s']),
    gustMs: num(row?.maximumWind?.gust?.['m/s']),
    stormWarning: rangesOf(row?.stormWarning),
    galeWarning: rangesOf(row?.galeWarning),
    circleKm: num(row?.probabilityCircleRadius?.km),
  }));
  const analysis = body.find((row) => row.part === '実況');
  if (!analysis || !analysis.position) throw new ShapeError('specifications');
  return {
    issue: head.issue.JST,
    typhoonNumber: head.typhoonNumber,
    number: Number(head.typhoonNumber.slice(-2)),
    name: text(head?.name?.jp),
    category: text(head?.category?.jp),
    analysis,
    forecasts: body.filter((row) => row.advancedHours > 0),
  };
}

const point = (pair) => (Array.isArray(pair) && pair.length === 2 && Number.isFinite(Number(pair[0]))
  && Number.isFinite(Number(pair[1])) ? { lat: Number(pair[0]), lng: Number(pair[1]) } : null);
const line = (pair) => {
  const from = point(pair?.[0]);
  const to = point(pair?.[1]);
  return from && to ? [from, to] : null;
};

/** forecast.json。地図に描く幾何だけを取り出す。半径はメートル、角度は度 */
export function parseForecast(value) {
  if (!Array.isArray(value) || value.length < 2 || value[0]?.part !== 'title') throw new ShapeError('forecast');
  const steps = value.slice(1).map((row) => {
    const warning = row?.stormWarningArea ?? {};
    return {
      part: text(row?.part?.jp),
      advancedHours: num(row?.advancedHours) ?? 0,
      validtime: row?.validtime?.JST ?? '',
      center: point(row?.center),
      track: {
        preTyphoon: (row?.track?.preTyphoon ?? []).map(point).filter(Boolean),
        typhoon: (row?.track?.typhoon ?? []).map(point).filter(Boolean),
      },
      circle: row?.probabilityCircle?.radius
        ? { center: point(row?.center), radius: num(row.probabilityCircle.radius) }
        : null,
      galeArea: row?.galeWarningArea
        ? { center: point(row.galeWarningArea.center), radius: num(row.galeWarningArea.radius) }
        : null,
      arcs: (warning.arc ?? []).map((arc) => {
        const at = point(arc?.[0]);
        const radius = num(arc?.[1]);
        const angles = Array.isArray(arc?.[2]) ? arc[2].map(Number) : null;
        return at && radius !== null && angles && angles.every(Number.isFinite)
          ? { center: at, radius, from: angles[0], to: angles[1] } : null;
      }).filter(Boolean),
      lines: (warning.line ?? []).map(line).filter(Boolean),
    };
  });
  if (!steps.some((step) => step.center)) throw new ShapeError('forecast');
  return { issue: value[0]?.issue?.JST ?? '', steps };
}

async function getJson(url, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`気象庁の発表を取れませんでした (${response.status})`);
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ShapeError(url);
  }
}

/** 台風1つぶんの4本を並列で取る。1本でも欠けたら失敗にする（部分的な答えを作らない） */
export async function fetchTyphoon(target, options = {}) {
  const [specifications, timeseries, through, forecast] = await Promise.all([
    getJson(dataUrl(target.tropicalCyclone, 'specifications'), options),
    getJson(dataUrl(target.tropicalCyclone, 'probabilityTimeseries'), options),
    getJson(dataUrl(target.tropicalCyclone, 'probabilityThrough'), options),
    getJson(dataUrl(target.tropicalCyclone, 'forecast'), options),
  ]);
  return {
    target,
    specifications: parseSpecifications(specifications),
    timeseries: parseTimeseries(timeseries),
    through: parseThrough(through),
    forecast: parseForecast(forecast),
  };
}

/**
 * 発表中の台風を全部まとめて取る。eventId は保存もハードコードもせず、毎回 targetTc から取る。
 * 返すのは { fetchedAt, typhoons }。typhoons が空なら「いま台風はありません」。
 */
export async function fetchAll({ fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, now = Date.now } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const options = { fetchImpl, signal: controller.signal };
    const targets = parseTargets(await getJson(TARGET_TC, options));
    const typhoons = await Promise.all(targets.map((target) => fetchTyphoon(target, options)));
    return { fetchedAt: now(), typhoons };
  } finally {
    clearTimeout(timer);
  }
}
