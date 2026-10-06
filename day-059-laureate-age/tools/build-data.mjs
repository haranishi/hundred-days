// 同梱データ data/laureates.json を作る。実行は人の手で1回（ネットが要る）。
//   node day-059-laureate-age/tools/build-data.mjs
// 受賞者と賞は Nobel Prize API（CC0）から、日本語の名前は Wikidata のラベル（CC0）から取る。
// 画面が毎回 3.9MB の全件を取りに行かずに済むよう、必要な項目だけに削って同梱する。
// 生年月日と没年月日は配らない。画面と同じ計算（lib/age.js）で発表日の年齢にしてから書き出す。
// 今年の発表分は画面が開くたびに API から足す（lib/live.js）。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ageAt } from '../lib/age.js';

const API = 'https://api.nobelprize.org/2.1';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
// Wikimedia の User-Agent 方針：スクリプトは連絡先の分かる UA を名乗る
const UA = 'hundred-days-day059-build/1.0 (https://github.com/haranishi/hundred-days)';
const OUT = fileURLToPath(new URL('../data/laureates.json', import.meta.url));
const CATS = {
  Physics: 'phy',
  Chemistry: 'che',
  'Physiology or Medicine': 'med',
  Literature: 'lit',
  Peace: 'pea',
  'Economic Sciences': 'eco',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 混んでいると 429/503 が返る。Retry-After の秒数だけ待って、直列のまま取り直す。
// maxlag は付けない。編集する bot 向けの仕組みで、検索サービス（WDQS）の遅れでも止まる
// （2026-10-06 実測：6.4秒の遅れで maxlag=5 が5回続けて断られた）。こちらは読むだけで約20回
async function getJson(url, tries = 5) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (res.ok) return res.json();
    const busy = res.status === 429 || res.status === 503;
    if (!busy || attempt >= tries) throw new Error(`${res.status} ${url}`);
    await sleep((Number(res.headers.get('retry-after')) || 5) * 1000);
  }
}

// 日本語のラベルが無い人は、日本語版ウィキペディアの記事名（これも Wikidata の項目に入っている）で補う
async function jaLabels(ids) {
  const labels = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `${WIKIDATA}?action=wbgetentities&props=labels|sitelinks&languages=ja&sitefilter=jawiki&format=json&ids=${chunk.join('|')}`;
    const body = await getJson(url);
    if (body.error) throw new Error(`Wikidata: ${body.error.code}`);
    for (const [id, entity] of Object.entries(body.entities || {})) {
      const value = (entity.labels?.ja?.value || entity.sitelinks?.jawiki?.title || '').trim();
      if (value) labels.set(id, value);
    }
    await sleep(300);
  }
  return labels;
}

const { laureates } = await getJson(`${API}/laureates?limit=2000`);
const { nobelPrizes } = await getJson(`${API}/nobelPrizes?limit=2000`);
if (!Array.isArray(laureates) || laureates.length < 1000) throw new Error('受賞者の件数が少なすぎる');

const dateOf = new Map(nobelPrizes.map((p) => [`${p.awardYear}:${p.category.en}`, p.dateAwarded || null]));
const qids = [...new Set(laureates.map((l) => l.wikidata?.id).filter(Boolean))];
const ja = await jaLabels(qids);

const awards = [];
const orgs = [];
for (const l of laureates) {
  const isOrg = Boolean(l.orgName);
  const en = (isOrg ? l.orgName.en : l.knownName?.en || l.fullName?.en || '').trim();
  const name = { id: String(l.id), en, ja: ja.get(l.wikidata?.id) || null };
  for (const prize of l.nobelPrizes || []) {
    const cat = CATS[prize.category?.en];
    if (!cat) throw new Error(`知らない分野: ${prize.category?.en}`);
    const entry = {
      ...name,
      year: Number(prize.awardYear),
      cat,
      date: dateOf.get(`${prize.awardYear}:${prize.category.en}`) || prize.dateAwarded || null,
      status: prize.prizeStatus || 'received',
      motivation: prize.motivation?.en?.trim() || null,
    };
    if (isOrg) {
      orgs.push(entry);
      continue;
    }
    const measured = ageAt({ ...entry, born: l.birth?.date || null, died: l.death?.date || null });
    if (measured.age === null) throw new Error(`年齢を数えられない: ${en} ${entry.year}`);
    awards.push({ ...entry, ...measured });
  }
}

const byYear = (a, b) => b.year - a.year || a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id);
awards.sort(byYear);
orgs.sort(byYear);

const out = {
  generatedAt: new Date().toISOString(),
  source: {
    data: 'Nobel Prize API 2.1 (https://api.nobelprize.org/2.1/) — CC0',
    names: 'Wikidata labels (ja) — CC0',
    note: 'age is the age on the announcement date, computed by lib/age.js. Birth and death dates are not included.',
  },
  awards,
  orgs,
};
await writeFile(OUT, `${JSON.stringify(out)}\n`);
const missingJa = awards.filter((a) => !a.ja).length;
console.log(`awards ${awards.length} / orgs ${orgs.length} / ja なし ${missingJa} → ${OUT}`);
