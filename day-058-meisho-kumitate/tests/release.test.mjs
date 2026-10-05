// 公開物（index.html と assets/）が、100日チャレンジ版の約束どおりに組まれているかを確かめる。
// ゲームのルールと模型のテストは source/ の vitest が受け持つ（.github/workflows/day058-game.yml）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(root + name, 'utf8');
const meta = JSON.parse(read('meta.json'));
const html = read('index.html');
const site = read('source/src/client/site.ts');
const bundles = readdirSync(root + 'assets').filter((name) => name.endsWith('.js'));

test('meta.json と、ゲームの中の名前・公開URLがそろっている', () => {
  assert.equal(meta.day, 58);
  assert.equal(meta.name, 'day-058-meisho-kumitate');
  assert.equal(meta.status, 'published');
  assert.match(html, new RegExp(`<title>${meta.title}</title>`));
  assert.match(site, new RegExp(`SITE_NAME = '${meta.title}'`));
  assert.match(site, new RegExp(`SITE_URL = '${meta.publicUrl}'`));
  assert.ok(existsSync(root + meta.screenshot), `${meta.screenshot} がない`);
  // 制作時間は計っていない。0 のままにして、推測の数字を入れない
  assert.equal(meta.actualMinutes, 0);
});

test('共通の共有部品を読み、共有の窓を持つ', () => {
  assert.match(html, /<script src="shared\/share\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="shared\/share\.css" \/>/);
  assert.match(html, /<dialog id="share-dialog"[^>]*>[\s\S]*<div id="share"><\/div>[\s\S]*<\/dialog>/);
  assert.ok(existsSync(root + 'shared/share.js'));
});

test('素材はすべて相対パスで、指している実物がある', () => {
  const rooted = [...html.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(rooted, []);
  const assets = [...html.matchAll(/\b(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.some((file) => file.endsWith('.js')), 'ゲーム本体のJSを読んでいない');
  for (const file of assets) assert.ok(existsSync(root + file), `${file} がない`);
});

test('ネット対戦（サーバーとの通信）を含まない', () => {
  assert.ok(bundles.length > 0);
  for (const name of bundles) {
    const code = read(`assets/${name}`);
    assert.doesNotMatch(code, /\/api\/rooms|new WebSocket|wss:/, `${name} に通信のコードが残っている`);
    assert.doesNotMatch(code, /workers\.dev|localhost|127\.0\.0\.1/, `${name} に開発用・元の公開先のURLが残っている`);
    assert.doesNotMatch(code, /ネット対戦|友だちと・だれかと/, `${name} にネット対戦の入口や文言が残っている`);
  }
});

test('出さないと決めた名所と、前の名前が公開物に残っていない', () => {
  // 東京タワー・通天閣・ウルルは、外観や似姿を使うことに許可を求められているので外した（2026-10-05）。
  // 前の名前「ミニチュア観光名所バトル」は、同じ名前に近い既存作品があるので使わない
  for (const name of [...bundles.map((file) => `assets/${file}`), 'index.html']) {
    assert.doesNotMatch(read(name), /東京タワー|通天閣|ウルル|tokyo-tower|tsutenkaku|uluru/, `${name} に外した名所が残っている`);
    assert.doesNotMatch(read(name), /観光名所バトル/, `${name} に前の名前が残っている`);
  }
});

test('自前の canonical・og: を書かない（共通ビルドが meta.json から差し込む）', () => {
  assert.doesNotMatch(html, /rel="canonical"|property="og:|name="twitter:/);
});
