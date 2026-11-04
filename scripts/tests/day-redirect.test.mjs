// 外部Dayの共通の転送（infra/day-redirect）：rairakku.com/day<番号>/ と、紹介ページの無いDayの正の住所 → day<番号>.rairakku.com。
// 対応表（EXTERNAL_DAYS）・wrangler.toml の経路と、実際の外部Day（meta.json の status: external）がずれたら落ちる＝「次のDayも同じ住所の決まりで出す」を見張る。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker, { EXTERNAL_DAYS, redirectTarget } from '../../infra/day-redirect/worker.mjs';

const ROOT = new URL('../../', import.meta.url);
const target = path => redirectTarget(new URL(`https://rairakku.com${path}`));

test('外部Dayの番号だけ、day<番号>.rairakku.com へ転送する（パスと問い合わせを引き継ぐ）', () => {
  assert.equal(target('/day83'), 'https://day83.rairakku.com/');
  assert.equal(target('/day83/'), 'https://day83.rairakku.com/');
  assert.equal(target('/day83/drive/?a=1&b=2'), 'https://day83.rairakku.com/drive/?a=1&b=2');
  assert.equal(target('/day81/x.js'), 'https://day81.rairakku.com/x.js');
  assert.equal(target('/day083/'), 'https://day83.rairakku.com/', 'ゼロ埋めの番号も同じDayへ');
});

test('紹介ページを持たない外部Dayは、100日の正の住所（/100days/<フォルダ名>/）からもアプリへ転送する', () => {
  assert.equal(target('/100days/day-083-car360'), 'https://day83.rairakku.com/');
  assert.equal(target('/100days/day-083-car360/'), 'https://day83.rairakku.com/');
  assert.equal(target('/100days/day-083-car360?x=1'), 'https://day83.rairakku.com/?x=1');
  assert.equal(target('/100days/day-083-car360/?x=1'), 'https://day83.rairakku.com/?x=1', '問い合わせは引き継ぐ');
});

test('100日の正の住所の下の素材（カードの画像など）は転送しない（転送すると一覧のカードの画像が壊れる）', () => {
  for (const path of ['/100days/day-083-car360/screenshot.webp', '/100days/day-083-car360/meta.json', '/100days/day-083-car360/drive/', '/100days/day-083-car360//']) {
    assert.equal(target(path), null, path);
  }
});

test('紹介ページを持つ外部Day（Day81）・ほかのDay・似た名前は、100日の正の住所を転送しない', () => {
  for (const path of ['/100days/day-081-pagecrate/', '/100days/day-082-kageuchi/', '/100days/', '/100days', '/100days/day-083-car360x/', '/100days/day-083/', '/100days/Day-083-car360/', '/x/100days/day-083-car360/']) {
    assert.equal(target(path), null, path);
  }
});

test('表に無い番号・似た名前・別の深さは転送しない（元のサイトへ素通し）', () => {
  for (const path of ['/', '/day', '/day0', '/day8/', '/day82/', '/day84/', '/day830/', '/day83abc', '/days83/', '/Day83/', '/xday83/']) {
    assert.equal(target(path), null, path);
  }
});

test('fetch：GET・HEAD は302で転送し、他の方法・表に無いものは元のサイトへ渡す', async () => {
  const passed = [];
  const original = globalThis.fetch;
  globalThis.fetch = async request => { passed.push(`${request.method} ${new URL(request.url).pathname}`); return new Response('origin'); };
  try {
    for (const method of ['GET', 'HEAD']) {
      for (const [from, to] of [['/day83/?x=1', 'https://day83.rairakku.com/?x=1'], ['/100days/day-083-car360/?x=1', 'https://day83.rairakku.com/?x=1']]) {
        const response = await worker.fetch(new Request(`https://rairakku.com${from}`, { method }));
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), to);
      }
    }
    assert.equal(await (await worker.fetch(new Request('https://rairakku.com/day83/', { method: 'POST', body: 'x' }))).text(), 'origin');
    assert.equal(await (await worker.fetch(new Request('https://rairakku.com/day84/'))).text(), 'origin');
    assert.equal(await (await worker.fetch(new Request('https://rairakku.com/100days/day-083-car360/screenshot.webp'))).text(), 'origin', 'カードの画像は元のサイトへ');
    assert.deepEqual(passed, ['POST /day83/', 'GET /day84/', 'GET /100days/day-083-car360/screenshot.webp']);
  } finally { globalThis.fetch = original; }
});

// 実際の外部Day：meta.json が status: external で、公開先が day<番号>.rairakku.com のもの。
function externalDays() {
  const found = new Map();
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const match = entry.isDirectory() && /^day-(\d{3})-/.exec(entry.name);
    if (!match) continue;
    const metaFile = new URL(`${entry.name}/meta.json`, ROOT);
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const host = meta.status === 'external' && /^https:\/\/day(\d{1,3})\.rairakku\.com\/$/.exec(meta.externalUrl || '');
    if (host) found.set(Number(host[1]), { folder: entry.name, day: meta.day, intro: Boolean(meta.intro) });
  }
  return found;
}

test('対応表は、100日の外部Day（status: external・公開先が day<番号>.rairakku.com）と一致する。紹介ページが無いDayだけ、正の住所も転送する', () => {
  const external = externalDays();
  for (const [number, { folder, day, intro }] of external) {
    assert.equal(day, number, `${folder}: 公開先 day${number}.rairakku.com と Day 番号が違う`);
    const entry = EXTERNAL_DAYS.find(row => row.number === number);
    assert.ok(entry, `${folder}: day${number}.rairakku.com で出す外部Dayは、infra/day-redirect/worker.mjs の EXTERNAL_DAYS に足す（rairakku.com/day${number}/ から転送するため）`);
    if (intro) assert.equal(entry.folder, undefined, `${folder}: 紹介ページ（intro）があるDayは、正の住所を転送しない（サイトの本物のページを隠してしまう）`);
    else assert.equal(entry.folder, folder, `${folder}: 紹介ページが無い外部Dayは、EXTERNAL_DAYS に folder: '${folder}' も足す（正の住所 rairakku.com/100days/${folder}/ からアプリへ転送するため）`);
  }
  for (const { number } of EXTERNAL_DAYS) assert.ok(external.has(number), `EXTERNAL_DAYS の ${number} に対応する外部Dayが無い`);
});

test('wrangler.toml の経路は、rairakku.com/day* と、表の folder ごとの1本だけ（/100days/* のように広げない＝無料枠を守る）', () => {
  const toml = fs.readFileSync(new URL('infra/day-redirect/wrangler.toml', ROOT), 'utf8');
  const patterns = [...toml.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map(match => match[1]).sort();
  const expected = ['rairakku.com/day*', ...EXTERNAL_DAYS.filter(row => row.folder).map(row => `rairakku.com/100days/${row.folder}*`)].sort();
  assert.deepEqual(patterns, expected);
});
