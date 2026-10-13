// 書いてはいけないものが無いこと（作業記録の 03_gates.md「罠」と依頼の禁止事項）を、ソースの文字列で確かめる。
// インライン script・on*= 属性・style 属性・外部フォント・外部画像・外部通信・絵文字・auto-phrase・zoom・なめらかなスクロール・rAF だけの待ち。
// あわせて、CSS の色と px が :root のトークンにだけあること（design:design-system の audit と同じ数え方）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(join(DIR, rel), 'utf8');
const html = read('index.html');
const css = read('app.css');
const libFiles = readdirSync(join(DIR, 'lib')).filter((f) => f.endsWith('.js'));
const sources = { 'app.js': read('app.js'), ...Object.fromEntries(libFiles.map((f) => [`lib/${f}`, read(`lib/${f}`)])) };

describe('index.html', () => {
  it('インライン script・on*= 属性・style 属性が無い。script は自分のファイルだけ', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const [, attrs, body] of scripts) {
      assert.ok(/\bsrc="\.\/(app\.js|shared\/share\.js)"/.test(attrs), `script の読み込み先 ${attrs}`);
      assert.equal(body.trim(), '', 'インライン script');
    }
    assert.equal(scripts.length, 2);
    assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'on*= 属性');
    assert.equal(/\sstyle\s*=/i.test(html), false, 'style 属性');
  });

  it('外部の資源（link・script・img・font・iframe）を読み込まない。href で外へ出るのは結果の共有の2つだけ', () => {
    assert.equal(/<(img|iframe|video|audio|source|object|embed)\b/i.test(html), false);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    for (const l of links) assert.equal(/href="https?:/i.test(l), false, l);
    const hrefs = [...html.matchAll(/\bhref="(https?:[^"]*)"/gi)].map((m) => m[1]);
    assert.deepEqual(hrefs, ['https://x.com/intent/post', 'https://social-plugins.line.me/lineit/share']);
    assert.equal(/@import|url\(\s*["']?https?:/i.test(css), false, 'CSS から外へ');
  });

  it('必要な目印：lang・title・viewport・description・share:text・theme-color。h1 は1つ', () => {
    assert.match(html, /<html lang="ja">/);
    assert.match(html, /<title>箱影の怪盗 — 押せる箱で警備の光をかわす忍び込みパズル<\/title>/);
    assert.match(html, /name="viewport"/);
    assert.match(html, /name="description" content="押せる箱で見張りと警備員の光、レーザーをさえぎり、影を通って宝を盗み出す、1手ずつ進む忍び込みパズル。全8面。登録なし。"/);
    assert.match(html, /name="share:text" content="箱影の怪盗 — 頼れるのは押せる箱だけ。光をさえぎり、影を通って宝を盗む忍び込みパズル"/);
    assert.match(html, /name="theme-color" content="#0e1320"/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
  });

  it('キーの案内（#keyhelp・#howto-keys）の最初の文は、文字のキーを使うときの案内（phrase.js）と同じ。JS が動く前の表示とずれない', async () => {
    const T = await import('../lib/phrase.js');
    const text = (id) => html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</p>`))[1].replaceAll('<wbr>', '');
    assert.equal(text('keyhelp'), T.KEY_HELP_LETTERS);
    assert.equal(text('howto-keys'), T.KEY_HELP_LETTERS);
  });

  it('JS が差し替えるボタンの文字・名前は、index.html の最初の文字・名前と同じ（コピーのボタン・ヒントを閉じるボタン）', async () => {
    const T = await import('../lib/phrase.js');
    assert.match(html, new RegExp(`id="share-copy"[^>]*>${T.COPY_LABEL}</button>`));
    assert.match(html, new RegExp(`id="btn-hint-close"[^>]*aria-label="${T.HINT_CLOSE_LABEL}"`));
  });

  it('お手本の札は盤の上に置かない（盤の上の #demo-badge と .boardbadge は無い）。札は状態の行の #demo-progress', () => {
    assert.equal(html.includes('demo-badge'), false);
    assert.equal(css.includes('boardbadge'), false);
    assert.match(html, /id="demo-progress"/);
  });

  it('id は重ならない', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `重なった id：${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  });

  it('02_ui_hooks.md の id がそろっている', () => {
    const must = ['btn-share', 'share-dialog', 'share', 'btn-share-close', 'btn-howto', 'howto-dialog', 'btn-howto-close', 'opt-letter-keys', 'btn-sound',
      'btn-prev', 'btn-next-level', 'btn-levels', 'btn-hint', 'hint', 'level-dialog', 'btn-levels-close', 'steps', 'par', 'treasure-state', 'controls',
      'btn-up', 'btn-right', 'btn-down', 'btn-left', 'btn-wait', 'btn-undo', 'btn-restart',
      'panel-caught', 'caught-text', 'btn-caught-undo', 'btn-caught-restart', 'btn-caught-demo',
      'panel-dead', 'dead-text', 'btn-dead-undo', 'btn-dead-restart', 'btn-dead-demo',
      'panel-clear', 'clear-stars', 'clear-steps', 'clear-note', 'btn-next', 'btn-again',
      'result-share', 'share-x', 'share-line', 'share-copy', 'share-native', 'share-said',
      'btn-demo', 'demo-progress', 'btn-demo-stop', 'live', 'toast', 'board', 'board-text', 'app', 'level-title'];
    for (const id of must) assert.ok(html.includes(`id="${id}"`), `#${id} が無い`);
    assert.match(html, /id="toast"[^>]*aria-hidden="true"/);
    assert.match(html, /id="live"[^>]*aria-live="polite"/);
  });
});

describe('ソースに書かないもの', () => {
  it('README・meta.json・E2E・プライバシー文書にも絵文字が無い（★☆は文字として可）', () => {
    const extra = [
      ['README.md', read('README.md')],
      ['meta.json', read('meta.json')],
      ['tests/e2e/day-066.spec.mjs', readFileSync(join(DIR, '../tests/e2e/day-066.spec.mjs'), 'utf8')],
      ['static/privacy.html', readFileSync(join(DIR, '../static/privacy.html'), 'utf8')],
    ];
    for (const [name, src] of extra) {
      assert.equal(/\p{Extended_Pictographic}/u.test(src.replaceAll('★', '').replaceAll('☆', '')), false, `${name} に絵文字`);
    }
  });

  it('絵文字・「_KEY」・auto-phrase・zoom・なめらかなスクロール・eval・console・外への通信の API を使わない', () => {
    for (const [name, src] of Object.entries({ ...sources, 'index.html': html, 'app.css': css })) {
      const text = src.replaceAll('★', '').replaceAll('☆', '');
      assert.equal(/\p{Extended_Pictographic}/u.test(text), false, `${name} に絵文字`);
      assert.equal(/\b[A-Za-z_]*_KEY\b/.test(src), false, `${name} に _KEY`);
      assert.equal(/auto-phrase/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, `${name} に auto-phrase`);
      assert.equal(/(^|[\s;{])zoom\s*:/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false, `${name} に zoom`);
      assert.equal(/behavior\s*:\s*['"]smooth['"]|scroll-behavior\s*:\s*smooth/.test(src), false, `${name} になめらかなスクロール`);
    }
    for (const [name, src] of Object.entries(sources)) {
      assert.equal(/\beval\s*\(|new Function\b|\.innerHTML\s*=|document\.write/.test(src), false, `${name} に危ない書き方`);
      assert.equal(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/.test(src), false, `${name} に外への通信`);
      assert.equal(/requestAnimationFrame/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), false, `${name} が rAF に頼っている（裏のタブで止まる）`);
      assert.equal(/\.setAttribute\(\s*['"]style['"]/.test(src), false, `${name} が style 属性を作る`);
    }
  });

  it('保存の名前は hakokageKaito.v1 だけ。localStorage を直接触るのは app.js の1か所（保存先を渡す）', () => {
    assert.match(sources['lib/progress.js'], /STORAGE_NAME = 'hakokageKaito\.v1'/);
    const touching = Object.entries(sources).filter(([, s]) => /localStorage|sessionStorage|indexedDB|document\.cookie/.test(s)).map(([n]) => n);
    assert.deepEqual(touching, ['app.js']);
  });
});

describe('app.css の色と px は :root のトークンにだけある（design-system の audit）', () => {
  // コメントを消し、波括弧の深さで「:root の中」と「それ以外」に分ける（@media の中の :root も :root として数える）
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const outside = [];
  const rootDepth = [];
  let depth = 0;
  let selector = '';
  let buf = '';
  for (const ch of stripped) {
    if (ch === '{') {
      selector = buf.trim();
      buf = '';
      if (/^:root\b/.test(selector)) rootDepth.push(depth + 1);
      depth += 1;
    } else if (ch === '}') {
      if (rootDepth.length && rootDepth[rootDepth.length - 1] === depth) rootDepth.pop();
      depth -= 1;
      buf = '';
    } else if (ch === ';') {
      const decl = buf.trim();
      buf = '';
      if (!rootDepth.length && decl) outside.push({ selector, decl });
    } else {
      buf += ch;
    }
  }
  const colorRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])(?:white|black|red|blue|green|yellow|gray|grey|orange|purple|pink)(?![\w-])/;
  const pxRe = /(?<![\w-])-?\d*\.?\d+px\b/;

  it('宣言の数を数えられている（読み取りの確認）', () => {
    assert.ok(outside.length > 300, `${outside.length}`);
  });

  it(':root の外に、色の直書きが0件（transparent・currentColor・var() は可）', () => {
    const bad = outside.filter(({ decl }) => colorRe.test(decl.replace(/var\([^)]*\)/g, '').replace(/transparent/g, '')));
    assert.deepEqual(bad.map((b) => `${b.selector} { ${b.decl} }`), []);
  });

  it(':root の外に、px の直書きが0件（寸法はトークン。0 と calc・var は可）', () => {
    const bad = outside.filter(({ decl }) => pxRe.test(decl.replace(/var\([^)]*\)/g, '')));
    assert.deepEqual(bad.map((b) => `${b.selector} { ${b.decl} }`), []);
  });

  it(':root の外に、line-height・font-weight・opacity・vh/vw の数字の直書きが0件（opacity の 0 と 1 は可）', () => {
    const value = (d) => d.decl.slice(d.decl.indexOf(':') + 1).trim();
    const name = (d) => d.decl.split(':')[0].trim();
    const bad = outside.filter((d) => {
      const v = value(d);
      if (name(d) === 'line-height') return !v.startsWith('var(');
      if (name(d) === 'font-weight') return !v.startsWith('var(');
      if (name(d) === 'opacity') return !/^(0|1|var\(.*\))$/.test(v);
      return /(?<![\w-])\d*\.?\d+(vh|vw|dvh)\b/.test(v.replace(/var\([^)]*\)/g, ''));
    });
    assert.deepEqual(bad.map((b) => `${b.selector} { ${b.decl} }`), []);
  });

  it('使っている var(--名前) は、:root か、部品の中（.panel--caught の --accent など）で定義されている', () => {
    const defined = new Set([...stripped.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...stripped.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    assert.deepEqual([...used].filter((n) => !defined.has(n)), []);
  });
});
