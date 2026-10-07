const CATS = ['med', 'phy', 'che', 'lit', 'pea', 'eco'];
const KINDS = ['paper', 'official', 'institution', 'registry', 'media', 'data', 'reference', 'company'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const tokyoDate = (now = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
const BRAND = /\u30ce\u30fc\u30d9\u30eb|Nobel/i;
const PRAISE = /天才|偉大|革命的|画期的|世紀の|奇跡|歴史的|驚異|称賛/;
const PRIVATE = /生年月日|生年|生まれ|没年|死去|亡くなっ|住所|家族|健康/;
const FUTURE = /かもしれ|可能性|期待|見込|予定|だろう|はず|とされ/;
export function sourceUrlError(value, kind) {
  let url;
  try { url = new URL(value); } catch { return 'httpsのURLが必要です'; }
  if (url.protocol !== 'https:' || url.username || url.password) return 'httpsのURLが必要です';
  let path;
  try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { return 'URLの形式が不正です'; }
  if (url.hostname === 'nobelprize.org' || url.hostname.endsWith('.nobelprize.org')) {
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|mp4|mp3|webm)(?:$|\/)|\/(uploads|wp-content)(?:\/|$)/i.test(path)
      || !/^\/(prizes|laureate)\//.test(path)) return '公式の出典はHTMLの紹介ページだけを指定してください';
  }
  if (kind === 'paper' && (url.hostname !== 'doi.org' || url.pathname === '/')) return '論文はdoi.orgのURLで指定してください';
  return null;
}
export function checkCommentary(data, { now = Date.now(), upperBound = true, bytes = new TextEncoder().encode(JSON.stringify(data) ?? '').length } = {}) {
  const errors = [];
  const fail = (path, reason) => errors.push(`${path}: ${reason}`);
  if (bytes > 60 * 1024) fail('$', 'ファイルは60KB以下にしてください');
  if (!object(data)) return [...errors, '$: オブジェクトが必要です'];
  if (data.schema !== 1) fail('schema', '1が必要です');
  if (data.year !== 2026) fail('year', '2026が必要です');
  const allowed = (value, keys, path) => {
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path ? path + '.' : ''}${key}`, '定義されていない項目です');
  };
  allowed(data, ['schema', 'year', 'entries'], '');
  if (!object(data.entries)) fail('entries', 'オブジェクトが必要です');
  // キーも含めて平文を確認する。出典の題名と発行元のみ名称を許す。
  function strings(value, path = '') {
    if (typeof value === 'string') {
      // 出典の題名・発行元・URLは引用元の表記なので、提供元の名前を含んでよい（URLは画面に出ず、リンク先として使うだけ）
      const exempt = /^entries\.[^.]+\.sources\.[^.]+\.(title|publisher|url)$/.test(path);
      let prose = value;
      if (/\.(url|jaSrc)$/.test(path)) { try { const url = new URL(value); prose = url.pathname + url.search + url.hash; } catch { /* URL形式は別途検査 */ } }
      if (!exempt && BRAND.test(prose)) fail(path, '提供元の名前を入れないでください');
      if (PRAISE.test(value)) fail(path, '評価・誇張の語を入れないでください');
      if (PRIVATE.test(value)) fail(path, '個人情報の語を入れないでください');
      if (/[<>]/.test(value)) fail(path, 'HTMLの山括弧を入れないでください');
      if (/公式|公認|提携/.test(value) && !exempt && !/\.(url|jaSrc)$/.test(path)) fail(path, '公式・公認・提携と書かないでください');
    } else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`));
    else if (object(value)) for (const [key, v] of Object.entries(value)) {
      if (BRAND.test(key) || /[<>]/.test(key)) fail(path ? `${path}.${key}` : key, '項目名に禁止された文字があります');
      strings(v, path ? `${path}.${key}` : key);
    }
  }
  strings(data);
  for (const [cat, entry] of Object.entries(object(data.entries) ? data.entries : {})) {
    const base = `entries.${cat}`;
    if (!CATS.includes(cat)) fail(base, '分野が不正です');
    if (!object(entry)) { fail(base, 'オブジェクトが必要です'); continue; }
    if (!['science', 'facts'].includes(entry.mode)) fail(`${base}.mode`, 'scienceまたはfactsが必要です');
    if (['lit', 'pea'].includes(cat) && entry.mode !== 'facts') fail(`${base}.mode`, 'この分野はfactsだけです');
    const facts = entry.mode === 'facts';
    allowed(entry, ['verifiedAt', 'mode', 'headline', 'what', 'people', 'sources', ...facts ? [] : ['changed', 'expected', 'gap']], base);
    const date = entry.verifiedAt;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
      || new Date(date).toISOString().slice(0, 10) !== date || date < '2026-10-05' || (upperBound && date > tokyoDate(now))) fail(`${base}.verifiedAt`, upperBound ? '2026-10-05以降・今日以前のISO日付が必要です' : '2026-10-05以降の実在するISO日付が必要です');
    const plain = (v, path) => { if (typeof v !== 'string' || !v.trim()) fail(path, '空でない文字列が必要です'); };
    plain(entry.headline, `${base}.headline`);
    if (typeof entry.headline === 'string' && [...entry.headline].length > 60) fail(`${base}.headline`, '60字以内にしてください');
    const used = new Set();
    function refs(v, path) {
      if (!Array.isArray(v) || !v.length) { fail(path, '出典が1つ以上必要です'); return; }
      v.forEach((id, i) => {
        if (typeof id !== 'string' || !object(entry.sources) || !Object.hasOwn(entry.sources, id)) fail(`${path}[${i}]`, '参照先の出典がありません');
        used.add(id);
      });
      if (new Set(v).size !== v.length) fail(path, '出典参照が重複しています');
    }
    for (const [key, min, max] of [['what', 2, 4], ...facts ? [] : [['changed', 0, 5], ['expected', 0, 3]]]) {
      const path = `${base}.${key}`, rows = entry[key];
      if (!Array.isArray(rows) || rows.length < min || rows.length > max) { fail(path, `${min}〜${max}件の配列が必要です`); }
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, i) => {
        const p = `${path}[${i}]`;
        if (!object(row)) { fail(p, 'オブジェクトが必要です'); return; }
        allowed(row, ['text', 'src'], p); plain(row.text, `${p}.text`); refs(row.src, `${p}.src`);
        if (key === 'changed' && FUTURE.test(row.text)) fail(`${p}.text`, '推量・予定の語を入れないでください');
      });
    }
    if (!facts) {
      const rows = entry.gap, path = `${base}.gap`;
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 2) fail(path, '1〜2件の配列が必要です');
      if (Array.isArray(rows)) rows.forEach((gap, i) => {
        const p = `${path}[${i}]`;
        if (!object(gap)) { fail(p, 'オブジェクトが必要です'); return; }
        allowed(gap, ['label', 'startYear', 'endYear', 'years', 'what', 'src'], p);
        if (rows.length === 2) plain(gap.label, `${p}.label`);
        else if (Object.hasOwn(gap, 'label') && typeof gap.label !== 'string') fail(`${p}.label`, '文字列が必要です');
        if (!Number.isInteger(gap.startYear) || gap.startYear < 1 || !Number.isInteger(gap.years) || gap.years < 0 || gap.years !== gap.endYear - gap.startYear) fail(`${p}.years`, '起点から受賞までの年数と一致させてください');
        if (gap.endYear !== data.year) fail(`${p}.endYear`, 'yearと一致させてください');
        plain(gap.what, `${p}.what`); refs(gap.src, `${p}.src`);
      });
    }
    if (!Array.isArray(entry.people) || !entry.people.length) fail(`${base}.people`, '受賞者の配列が必要です');
    const ids = new Set();
    for (const [i, person] of (Array.isArray(entry.people) ? entry.people : []).entries()) {
      const p = `${base}.people[${i}]`;
      if (!object(person)) { fail(p, 'オブジェクトが必要です'); continue; }
      allowed(person, ['id', 'ja', 'jaSrc'], p);
      if (typeof person.id !== 'string' || !/^\d+$/.test(person.id)) fail(`${p}.id`, '受賞者番号が必要です');
      if (ids.has(person.id)) fail(`${p}.id`, '受賞者番号が重複しています'); ids.add(person.id);
      if (Object.hasOwn(person, 'ja')) {
        plain(person.ja, `${p}.ja`);
        if (!/^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/.test(person.jaSrc)) fail(`${p}.jaSrc`, 'Wikidataの項目URLが必要です');
      } else if (Object.hasOwn(person, 'jaSrc')) fail(`${p}.jaSrc`, 'jaが必要です');
    }
    if (!object(entry.sources) || !Object.keys(entry.sources).length) fail(`${base}.sources`, '出典が必要です');
    const urls = new Set();
    for (const [id, source] of Object.entries(object(entry.sources) ? entry.sources : {})) {
      const p = `${base}.sources.${id}`;
      if (!used.has(id)) fail(p, '使われていない出典です');
      if (!object(source)) { fail(p, 'オブジェクトが必要です'); continue; }
      allowed(source, ['title', 'publisher', 'kind', 'lang', 'url'], p);
      plain(source.title, `${p}.title`); plain(source.publisher, `${p}.publisher`); plain(source.url, `${p}.url`);
      if (Object.hasOwn(source, 'lang') && !['en', 'ja'].includes(source.lang)) fail(`${p}.lang`, 'enまたはjaが必要です');
      if (!KINDS.includes(source.kind)) fail(`${p}.kind`, '種類が不正です');
      const issue = sourceUrlError(source.url, source.kind); if (issue) fail(`${p}.url`, issue);
      try {
        const canonical = new URL(source.url).href;
        if (urls.has(canonical)) fail(`${p}.url`, 'URLが重複しています'); urls.add(canonical);
      } catch { /* 形式のエラーは上で記録 */ }
    }
  }
  return errors;
}
