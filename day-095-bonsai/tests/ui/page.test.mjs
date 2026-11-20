import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { calendarState, daysToAdvance, launchOptions } from '../../lib/app-state.js';
import { CAMERA_LIMITS, DEFAULTS, SPECIES_IDS } from '../../lib/contract.js';
import { LORE } from '../../lib/lore.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('日付の表示と次の季節は同じ暦を使い、季節の境界ではその先を選ぶ', () => {
  assert.equal(calendarState(0).label, '秋・10月1週');
  assert.equal(calendarState(7).label, '秋・10月2週');
  assert.equal(daysToAdvance('week', 27), 7);
  assert.equal(daysToAdvance('month', 27), 30);
  // 「次の季節」は、次の季節の始まりの45日後（中ごろ）へ進める。始まりの日は見た目が変わらず、押しても何も起きないように見えた
  for (const [day, delta, label] of [[0, 106, '冬・1月3週'], [60, 46, '冬・1月3週'], [61, 135, '春・4月3週'], [335, 136, '冬・1月3週']]) {
    assert.equal(daysToAdvance('season', day), delta);
    assert.equal(calendarState(day + delta).label, label);
  }
  assert.equal(daysToAdvance('invalid', 0), 0);
});

test('撮影用URLを解析し、視点を範囲内に収めて、無効な指定を既定値に戻す', () => {
  const shot = launchOptions('?debug=1&fresh=1&tips=0&seed=11&gfx=high&species=pine&style=chokkan&pot=round-blue&light=morning&day=226&tool=pinch&cam=-30,76,8.5');
  assert.deepEqual(shot, {
    debug: true, fresh: true, tips: false, gfx: 'high', tool: 'pinch', camera: { az: -30, pol: 76, dist: 8.5 },
    pot: 'round-blue', light: 'morning', day: 226, directsTree: true, seedling: { species: 'pine', style: 'chokkan', seed: 11 },
  });
  assert.deepEqual(launchOptions('?cam=540,0,30').camera, { az: -180, pol: CAMERA_LIMITS.polMin, dist: CAMERA_LIMITS.distMax });
  const invalid = launchOptions('?debug=0&fresh=yes&species=tree&style=4&seed=4294967296&day=3.5&pot=none&light=no&gfx=medium&tool=saw&cam=20,,8.5');
  assert.deepEqual(invalid, launchOptions(''));
  assert.equal(invalid.seedling.species, DEFAULTS.species);
  assert.equal(launchOptions('?day=0&seed=0').directsTree, true);
  assert.equal(launchOptions('?cam=0,Infinity,8').camera, null);
});

test('手入れの説明は指定された樹種と針金の短い文で、目安と時期の違いを明記する', () => {
  assert.deepEqual(Object.keys(LORE.species), SPECIES_IDS);
  const lines = [LORE.intro, ...Object.values(LORE.species), LORE.wire, LORE.timing];
  assert.ok(lines.every((line) => typeof line === 'string' && line.trim().length > 5 && [...line].length <= 65));
  assert.match(LORE.intro, /目安/);
  assert.match(LORE.species.maple, /冬.*枝ぶり/);
  assert.match(LORE.species.pine, /春.*初夏.*新芽.*摘/);
  assert.match(LORE.species.plum, /鉢植え.*花が終わった.*切り戻す/);
  assert.match(LORE.wire, /太.*食い込/);
  assert.match(LORE.timing, /地域.*樹種.*違い/);
});

test('ページの言語・公開メタ情報・共有の入口・画面の状態がHTMLに揃う', () => {
  const html = read('index.html');
  const { title } = JSON.parse(read('meta.json'));
  assert.match(html, /<html lang="ja">/);
  assert.ok(html.includes(`<title>${title}</title>`));
  assert.ok(html.includes(`<meta name="share:text" content="${title}`));
  // canonical・OGP・twitter:card は、ビルドが meta.json から足す（ソースに書くと、元の住所
  // https://hundred-days.pages.dev/... と食い違い、公開の契約 scripts/lib/publish-contract.mjs が落とす）
  assert.doesNotMatch(html, /rel="canonical"|property="og:|name="twitter:card"/);
  assert.match(html, /name="theme-color" content="#f3eee3"/);
  assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(html, /<link rel="stylesheet" href="\.\/shared\/share.css">/);
  assert.deepEqual([...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attributes, body]) => [attributes.trim(), body.trim()]), [
    ['src="./shared/share.js" defer', ''], ['type="module" src="./app.js"', ''],
  ]);
  assert.match(html, /id="share-open"[^>]*aria-label="このアプリを共有する"/);
  assert.match(html, /<(?:div|footer) id="share">/);
  const root = html.match(/<main id="app"[^>]*>/)?.[0] ?? '';
  for (const attribute of ['ready', 'species', 'tool', 'season', 'day', 'branches', 'gfx']) assert.ok(root.includes(`data-${attribute}=`));
  assert.match(root, /data-ready="false"/);
  assert.match(html, /<canvas[^>]*role="img"[^>]*tabindex="0"[^>]*aria-label="紅葉の盆栽。秋。枝は0本"/);
  assert.match(html, /id="live" role="status"/);
  assert.ok(html.indexOf('data-tool="pinch"') < html.indexOf('<canvas'));
  const css = read('app.css');
  assert.match(css, /\.stage canvas\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('和紙の面に対して本文と小さい文字は4.5対1、フォーカスは3対1を保つ', () => {
  const colors = Object.fromEntries([...read('app.css').matchAll(/--([a-z-]+):\s*#([a-f0-9]{6})\s*;/g)].map(([, name, hex]) => [name, hex]));
  const channel = (hex) => {
    const value = Number.parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (name) => colors[name].match(/../g).reduce((sum, hex, i) => sum + channel(hex) * [0.2126, 0.7152, 0.0722][i], 0);
  for (const surface of ['paper', 'recessed', 'raised']) {
    const background = luminance(surface) + 0.05;
    for (const ink of ['ink', 'muted', 'shu-ink']) assert.ok(background / (luminance(ink) + 0.05) >= 4.5, `${surface}上の${ink}`);
    assert.ok(background / (luminance('focus') + 0.05) >= 3, `${surface}上のフォーカス`);
  }
});

test('モジュールの先読み一覧は app.js の静的 import をたどった結果と一致する', () => {
  const root = new URL('../../', import.meta.url);
  const head = read('index.html').split('</head>')[0];
  const entry = new URL(head.match(/<script type="module" src="([^"]+)"/)[1], root);
  const staticImport = /^[ \t]*(?:import\s+(?:[^;'"]*?\bfrom\s*)?|export\s+(?:\*|\{[^}]*\})\s+from\s*)['"]([^'"]+)['"]/gm;
  const imported = new Set();
  function visit(source) {
    for (const [, specifier] of readFileSync(source, 'utf8').matchAll(staticImport)) {
      const target = new URL(specifier, source);
      if (imported.has(target.href)) continue;
      imported.add(target.href);
      visit(target);
    }
  }
  visit(entry);
  const preloads = [...head.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)]
    .map(([, href]) => new URL(href, root).href);
  assert.ok(imported.has(new URL('vendor/three.js', root).href));
  assert.deepEqual(preloads.sort(), [...imported].sort());
});

test('設定メニューの画質は自動・高・標準・軽めの順で選べる', () => {
  const select = read('index.html').match(/<label>画質<select id="gfx">([\s\S]*?)<\/select><\/label>/)?.[1] ?? '';
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)]
    .map(([, id, label]) => [id, label]), [['auto', '自動'], ['high', '高'], ['mid', '標準'], ['low', '軽め']]);
});
