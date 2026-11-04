// 外部Dayの共通の転送（infra/day-redirect）：rairakku.com/day<番号>/ → day<番号>.rairakku.com。
// 対応表（EXTERNAL_DAYS）と、実際の外部Day（meta.json の status: external）がずれたら落ちる＝「次のDayも同じ住所の決まりで出す」を見張る。
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

test('表に無い番号・似た名前・別の深さは転送しない（元のサイトへ素通し）', () => {
  for (const path of ['/', '/day', '/day0', '/day8/', '/day82/', '/day84/', '/day830/', '/day83abc', '/days83/', '/100days/day-083-car360/', '/Day83/', '/xday83/']) {
    assert.equal(target(path), null, path);
  }
});

test('fetch：GET・HEAD は302で転送し、他の方法・表に無いものは元のサイトへ渡す', async () => {
  const passed = [];
  const original = globalThis.fetch;
  globalThis.fetch = async request => { passed.push(`${request.method} ${new URL(request.url).pathname}`); return new Response('origin'); };
  try {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request('https://rairakku.com/day83/?x=1', { method }));
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://day83.rairakku.com/?x=1');
    }
    assert.equal(await (await worker.fetch(new Request('https://rairakku.com/day83/', { method: 'POST', body: 'x' }))).text(), 'origin');
    assert.equal(await (await worker.fetch(new Request('https://rairakku.com/day84/'))).text(), 'origin');
    assert.deepEqual(passed, ['POST /day83/', 'GET /day84/']);
  } finally { globalThis.fetch = original; }
});

test('対応表は、100日の外部Day（status: external）で公開先が day<番号>.rairakku.com のものと一致する', () => {
  const external = new Map();
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    const match = entry.isDirectory() && /^day-(\d{3})-/.exec(entry.name);
    if (!match) continue;
    const metaFile = new URL(`${entry.name}/meta.json`, ROOT);
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const host = meta.status === 'external' && /^https:\/\/day(\d{1,3})\.rairakku\.com\/$/.exec(meta.externalUrl || '');
    if (host) external.set(Number(host[1]), { folder: entry.name, day: meta.day });
  }
  for (const [number, { folder, day }] of external) {
    assert.equal(day, number, `${folder}: 公開先 day${number}.rairakku.com と Day 番号が違う`);
    assert.ok(EXTERNAL_DAYS.includes(number), `${folder}: day${number}.rairakku.com で出す外部Dayは、infra/day-redirect/worker.mjs の EXTERNAL_DAYS に足す（rairakku.com/day${number}/ から転送するため）`);
  }
  for (const number of EXTERNAL_DAYS) assert.ok(external.has(number), `EXTERNAL_DAYS の ${number} に対応する外部Dayが無い`);
});
