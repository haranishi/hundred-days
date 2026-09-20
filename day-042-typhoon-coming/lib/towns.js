/* 同梱した市区町村1805件（data/towns.json）の引き当て。
   入力した語も現在地の座標も、ここから外へは出さない。端末の中で7桁コードに変えるだけ。 */

export const MAX_CANDIDATES = 8;
/** これより遠い中心しか無ければ、日本の外だと判断する */
export const FAR_KM = 50;

/* 全角・半角をそろえ、カタカナはひらがなに寄せる。
   同梱データの読みはひらがなだけなので、「ﾁﾖﾀﾞ」「チヨダ」と打たれても当たるようにする */
const normalize = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase()
  .replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
const rad = (n) => (n * Math.PI) / 180;

/** 直線距離（km）。並べ替えにしか使わないので簡易式で足りる */
export function distanceKm(a, b) {
  const x = (b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = b.lat - a.lat;
  return Math.hypot(x, y) * 111.194;
}

/* 外接矩形の中心。現在地の当てはめはこの点で比べる。
   代表点（市役所の位置など）は端に寄っていることがあり、隣の市のほうが近く出る
   （東京駅は千代田区の矩形に入るが、代表点で測ると中央区のほうが近い） */
export const boxCenter = (town) => ({ lat: (town.sw[0] + town.ne[0]) / 2, lng: (town.sw[1] + town.ne[1]) / 2 });
const inBox = (town, at) =>
  at.lat >= town.sw[0] && at.lat <= town.ne[0] && at.lng >= town.sw[1] && at.lng <= town.ne[1];

/** 候補や見出しに出す名前。同じ名前の市区町村があるので都道府県で区別する */
export const townLabel = (town) => `${town.name}（${town.pref}）`;

export function createTowns(data) {
  const towns = data?.towns ?? [];
  const byCode = new Map(towns.map((town) => [town.code, town]));
  /* 地域（class15s）の並び順は、その地域に属する市区町村のいちばん若い順番で代表させる。
     気象庁のファイル順が北→南なので、これで上位一覧も北→南に並ぶ */
  const areas = new Map();
  for (const town of towns) {
    const known = areas.get(town.area);
    if (!known || town.order < known.order) {
      areas.set(town.area, { code: town.area, name: town.areaName, pref: town.pref, order: town.order });
    }
  }

  return {
    towns,
    count: towns.length,
    get: (code) => byCode.get(code) ?? null,
    area: (code) => areas.get(code) ?? null,
    areaOrder: (code) => areas.get(code)?.order ?? null,

    /**
     * 名前か読みで探す。名前そのものが一致したものを先頭に、次に前方一致、最後に部分一致。
     * 同じ段の中は同梱データの順（北→南）のまま。最大8件。
     */
    search(query) {
      const needle = normalize(query);
      if (!needle) return [];
      const exact = [];
      const head = [];
      const rest = [];
      for (const town of towns) {
        const name = normalize(town.name);
        const kana = normalize(town.kana);
        if (name === needle || kana === needle) exact.push(town);
        else if (name.startsWith(needle) || kana.startsWith(needle)) head.push(town);
        else if (name.includes(needle) || kana.includes(needle)) rest.push(town);
      }
      return [...exact, ...head, ...rest].slice(0, MAX_CANDIDATES);
    },

    /**
     * 現在地から市区町村を当てる。外接矩形に入るものを集め、複数なら中心がいちばん近いもの。
     * 1つも無ければいちばん近い中心を採る。ただし50kmより遠ければ日本の外とみなす。
     */
    fromPoint(at) {
      if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng) || !towns.length) return null;
      const hits = towns.filter((town) => inBox(town, at));
      const pool = hits.length ? hits : towns;
      let best = null;
      let bestKm = Infinity;
      for (const town of pool) {
        const km = distanceKm(at, boxCenter(town));
        if (km < bestKm) { bestKm = km; best = town; }
      }
      if (!hits.length && bestKm > FAR_KM) return null;
      return best;
    },
  };
}
