import { test, expect } from '@playwright/test';
import { calculateRank, describeNextGoal } from '../../day-063-dark-patterns/lib/stages.js';

/* Day63 のレイアウト検査（390×844・375×667・768×1024・1440×900）。
   各画面で、横はみ出し・短い固定文言の行数・改行の位置・文字の大きさ・コントラストを測る。
   - 改行の位置：行頭が文節の切れ目か（lib/phrase.js の phrases）、ひらがなで始まる行（文頭・句点のあとを除く）、
     語の途中（Intl.Segmenter の語）、カタカナ語・英数字の途中、1文字だけの行。偽サイトの文字も含めて全部
   - 文字の大きさとコントラスト：ゲーム側と偽サイトの本文は12px以上・4.5:1以上（大きい文字は3:1）。
     罠として意図して薄くした偽サイトの要素（data-trap）は、11px以上・3:1以上を下限にする
   乱数の種を固定し、第1・第2現場の配置の変種を全部出してから測るので、どの周でも同じ結果になる。
   位置は、動きを減らす設定にしてアニメーションの終了を待ってから測る（途中の値で揺れないように）。 */

const PATH = '/day-063-dark-patterns/';
const CUTIN_MS = 1000;
// 解説モーダル・第5現場の最終確認を出した直後と、第4現場の確認ダイアログを閉じた直後に入力を受け付けない時間（app.js の INPUT_GUARD_MS）
const INPUT_GUARD_MS = 450;
const PHONES = [{ width: 390, height: 844 }, { width: 375, height: 667 }];
const WIDE = [{ width: 768, height: 1024 }, { width: 1440, height: 900 }];
const SIZES = [...PHONES, ...WIDE];
const sizeTag = (size) => `${size.width}×${size.height}`;

// ページの中で動かす検査。page.evaluate に渡すので、この関数の外の変数は使えない（文節の区切りは window.__day063Phrase）
function auditPage({ oneLine = [] } = {}) {
  const phrase = window.__day063Phrase;
  const LETTER = /[\p{L}\p{N}]/u;
  const KATAKANA = /[ァ-ヺーｦ-ﾟ]/u; // 中黒（・）は区切りなので含めない
  const ALNUM = /[A-Za-z0-9]/;
  const HIRA = /^[ぁ-ゟ]/;
  const SENTENCE_END = /[。．！？!?]$/;
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  const openModalDialog = [...document.querySelectorAll('dialog[open]')].find((d) => d.matches(':modal'));

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  /* 測らないもの：モーダルや確認ダイアログに覆われた背後（inert）、モーダルの外、偽サイトの背景の飾り。
     カットインの間の偽サイト（#stage-viewport が inert）は覆われていないので測る */
  const skipped = (el) => Boolean(el.closest('.game-screen[inert], .ec-stage-content[inert], .fake-page-bg'))
    || Boolean(openModalDialog && !openModalDialog.contains(el));
  const isTrap = (el) => Boolean(el.closest('[data-trap]'));
  const isFakeSite = (el) => Boolean(el.closest('.stage-viewport')) && !el.closest('[data-game-ui]');
  const visible = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    && el.getClientRects().length > 0;

  const blockOf = (el) => {
    for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      const display = getComputedStyle(cur).display;
      if (display !== 'inline' && display !== 'contents') return cur;
    }
    return document.body;
  };

  // 1文字ずつの矩形と、何行目にあるか
  const charsOf = (nodes) => {
    const range = document.createRange();
    const chars = [];
    for (const node of nodes) {
      const text = node.data;
      for (let i = 0; i < text.length;) {
        const len = text.codePointAt(i) > 0xffff ? 2 : 1;
        const ch = text.slice(i, i + len);
        range.setStart(node, i);
        range.setEnd(node, i + len);
        const rects = range.getClientRects();
        const rect = rects.length ? rects[rects.length - 1] : null;
        chars.push({ ch, rect: rect && rect.width > 0 && rect.height > 0 ? rect : null });
        i += len;
      }
    }
    let line = -1;
    let lineBottom = -Infinity;
    for (const c of chars) {
      if (!c.rect || /\s/u.test(c.ch)) {
        c.line = null;
        continue;
      }
      const mid = c.rect.top + c.rect.height / 2;
      if (line < 0 || mid > lineBottom) {
        line += 1;
        lineBottom = c.rect.bottom;
      } else {
        lineBottom = Math.max(lineBottom, c.rect.bottom);
      }
      c.line = line;
    }
    return chars;
  };

  // 文字ノード（空白だけのものも含める。lib/phrase.js が文節を区切るときと同じ並びにするため）
  const textNodesUnder = (root, withSpaces = false) => {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (withSpaces || n.data.trim()) nodes.push(n);
    return nodes;
  };

  // ---------------------------------------------------------------- 文字のまとまり（行の入れ物ごと）
  const groups = new Map();
  for (const node of textNodesUnder(document.body, true)) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, noscript, template')) continue;
    if (skipped(parent) || !visible(parent)) continue;
    const block = blockOf(parent);
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block).push(node);
  }

  const wrapIssues = [];
  for (const [block, nodes] of groups) {
    const chars = charsOf(nodes);
    const lines = new Set(chars.map((c) => c.line).filter((l) => l !== null));
    if (lines.size < 2) continue;
    const text = chars.map((c) => c.ch).join('');
    const charAt = [];
    const offsets = [];
    let offset = 0;
    chars.forEach((c, index) => {
      offsets.push(offset);
      for (let k = 0; k < c.ch.length; k++) charAt.push(index);
      offset += c.ch.length;
    });
    const brief = text.replace(/\s+/g, ' ').trim().slice(0, 40);
    const snippet = (from, to) => text.slice(Math.max(0, from - 6), to + 6).replace(/\s+/g, ' ');

    // 語の途中の改行
    for (const seg of segmenter.segment(text)) {
      if (!seg.isWordLike) continue;
      const indexes = [...new Set(charAt.slice(seg.index, seg.index + seg.segment.length))];
      const placed = indexes.filter((i) => chars[i].line !== null);
      if (placed.length < 2) continue;
      if (new Set(placed.map((i) => chars[i].line)).size > 1) {
        wrapIssues.push(`${describe(block)}: 語「${seg.segment}」が行をまたぐ … ${snippet(seg.index, seg.index + seg.segment.length)}`);
      }
    }
    // カタカナ語・英数字の途中の改行（空白をはさまない隣どうし）
    for (let i = 1; i < chars.length; i++) {
      const a = chars[i - 1];
      const b = chars[i];
      if (a.line === null || b.line === null || a.line === b.line) continue;
      if ((KATAKANA.test(a.ch) && KATAKANA.test(b.ch)) || (ALNUM.test(a.ch) && ALNUM.test(b.ch))) {
        wrapIssues.push(`${describe(block)}: 「${a.ch}／${b.ch}」で改行 … ${chars.slice(Math.max(0, i - 6), i + 6).map((c) => c.ch).join('')}`);
      }
    }
    // 行頭：文節の切れ目か。ひらがなで始まる行は、文頭と句点のあとだけ
    const boundaries = new Set(phrase.phraseBoundaries(text));
    const started = new Set();
    chars.forEach((c, i) => {
      if (c.line === null || started.has(c.line)) return;
      started.add(c.line);
      if (c.line === 0) return;
      const at = offsets[i];
      const head = text.slice(at, at + 8).replace(/\s+/g, ' ');
      if (!boundaries.has(at)) wrapIssues.push(`${describe(block)}: 行頭「${head}」が文節の途中 … ${snippet(at, at)}`);
      const before = text.slice(0, at).trimEnd();
      if (HIRA.test(c.ch) && before && !SENTENCE_END.test(before)) {
        wrapIssues.push(`${describe(block)}: ひらがなで始まる行「${head}」 … ${snippet(at, at)}`);
      }
    });
    // 1文字・記号だけの行
    for (const lineNo of lines) {
      const onLine = chars.filter((c) => c.line === lineNo).map((c) => c.ch).join('');
      if ([...onLine].filter((ch) => LETTER.test(ch)).length <= 1) {
        wrapIssues.push(`${describe(block)}: 孤立した行「${onLine}」 … ${brief}`);
      }
    }
  }

  // ---------------------------------------------------------------- 文字の大きさとコントラスト
  const parseColor = (value) => {
    const nums = (value.match(/-?[\d.]+/g) || []).map(Number);
    if (value.startsWith('color(')) return { r: nums[0] * 255, g: nums[1] * 255, b: nums[2] * 255, a: nums.length > 3 ? nums[3] : 1 };
    return { r: nums[0] ?? 0, g: nums[1] ?? 0, b: nums[2] ?? 0, a: nums.length > 3 ? nums[3] : 1 };
  };
  const over = (top, bottom) => {
    const a = top.a;
    return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
  };
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (x, y) => {
    const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  };
  // 文字の背後の地色の候補（グラデーションは停止点ごと）。近い祖先から、不透明な地に当たるまで重ねる
  const groundsOf = (el) => {
    const layers = [];
    for (let cur = el; cur; cur = cur.parentElement) {
      const style = getComputedStyle(cur);
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        const stops = (style.backgroundImage.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g) || []).map(parseColor);
        if (stops.length) layers.push(stops);
        if (stops.length && stops.every((s) => s.a >= 1)) break;
      }
      const back = parseColor(style.backgroundColor);
      if (back.a > 0) {
        layers.push([back]);
        if (back.a >= 1) break;
      }
    }
    let grounds = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (const layer of layers.reverse()) {
      grounds = grounds.flatMap((ground) => layer.map((stop) => over(stop, ground)));
    }
    return grounds;
  };
  const opacityOf = (el) => {
    let value = 1;
    for (let cur = el; cur; cur = cur.parentElement) value *= Number(getComputedStyle(cur).opacity);
    return value;
  };

  const contrastIssues = [];
  const sizeIssues = [];
  const measured = [];
  const seen = new Set();
  for (const nodes of groups.values()) {
    for (const node of nodes) {
      const el = node.parentElement;
      if (seen.has(el) || !LETTER.test(node.data)) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      const color = parseColor(style.color);
      color.a *= opacityOf(el);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const trap = isTrap(el);
      const need = trap || large ? 3 : 4.5;
      const minSize = trap ? 11 : 12;
      const worst = Math.min(...groundsOf(el).map((ground) => ratio(over(color, ground), ground)));
      const sample = node.data.trim().replace(/\s+/g, ' ').slice(0, 24);
      const side = trap ? '偽サイト（罠）' : isFakeSite(el) ? '偽サイト' : 'ゲーム側';
      measured.push({ el: describe(el), side, text: sample, ratio: Math.round(worst * 100) / 100, need, size });
      if (worst < need) contrastIssues.push(`${describe(el)}「${sample}」 ${worst.toFixed(2)}:1 < ${need}:1`);
      if (size < minSize - 0.01) sizeIssues.push(`${describe(el)}「${sample}」 ${size}px < ${minSize}px`);
    }
  }

  // ---------------------------------------------------------------- 短い固定文言は1行
  const lineIssues = [];
  const lineCount = (el) => new Set(charsOf(textNodesUnder(el)).map((c) => c.line).filter((l) => l !== null)).size;
  for (const selector of oneLine) {
    for (const el of document.querySelectorAll(selector)) {
      if (skipped(el) || !visible(el)) continue;
      const count = lineCount(el);
      if (count > 1) lineIssues.push(`${selector}「${el.textContent.trim().replace(/\s+/g, ' ')}」が${count}行`);
    }
  }
  // white-space: nowrap で1行に守ったつもりの文言（「30% OFF！」「Dark Commercial Patterns」など）が割れていないか
  const nowrapChecked = new Set();
  for (const nodes of groups.values()) {
    for (const node of nodes) {
      if (!node.data.trim()) continue;
      for (let cur = node.parentElement; cur && cur !== document.body; cur = cur.parentElement) {
        const style = getComputedStyle(cur);
        if (/^(nowrap|pre)$/.test(style.whiteSpace) && !cur.hasAttribute('data-ph')) {
          if (!nowrapChecked.has(cur)) {
            nowrapChecked.add(cur);
            const count = lineCount(cur);
            if (count > 1) lineIssues.push(`${describe(cur)}（nowrap）「${cur.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}」が${count}行`);
          }
          break;
        }
        if (style.display !== 'inline' && style.display !== 'contents') break;
      }
    }
  }

  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    wrapIssues,
    contrastIssues,
    sizeIssues,
    lineIssues,
    measured
  };
}

const ONE_LINE = [
  '.app-header h1', '.btn-icon__text', '.hud-label', '.hud-value', '.hud-sound__text', '.hud-case', '.hud-toast',
  '.mission-tag', '.stage-cutin-tag', '.stage-cutin-title', '#modal-badge', '#modal-title', '#modal-stage-damage',
  '.trap-detail-tag', '#btn-next-stage', '#btn-retry-stage', '#btn-start-game', '#btn-retry', '.result-share__button',
  '.result-share__title', '.stat-label', '.stat-value', '.rank-prefix', '.stage-report-value', '.best-badge', '#btn-share-close',
  '.share__button', '#btn-final-stay', '#btn-final-leave'
];

/* 画面やモーダルは出た直後に不透明度0からフェードインする（動きを減らす設定でも1フレームはかかる）。
   その途中で測ると「見えない文字」として素通りしてしまうので、動いているアニメーションが終わるのを待つ */
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))));
}

// 検査に使う文節の区切り（アプリと同じ lib/phrase.js をページの中で読み込む）
async function loadPhrase(page) {
  await page.evaluate(async () => {
    if (!window.__day063Phrase) window.__day063Phrase = await import('./lib/phrase.js');
  });
}

async function audit(page, label, measuredLog) {
  await settle(page);
  await loadPhrase(page);
  const result = await page.evaluate(auditPage, { oneLine: ONE_LINE });
  // 測った要素が少なすぎるときは、画面を素通りしている（見えない扱いになった）おそれがある
  expect(result.measured.length, `${label}: 測った文字要素の数`).toBeGreaterThanOrEqual(5);
  if (measuredLog) for (const row of result.measured) measuredLog.push({ screen: label, ...row });
  expect.soft(result.overflow, `${label}: 横はみ出し`).toBeLessThanOrEqual(1);
  expect.soft(result.wrapIssues, `${label}: 改行の位置（文節の途中・ひらがなの行頭・語の途中・1文字の行）`).toEqual([]);
  expect.soft(result.lineIssues, `${label}: 短い固定文言が複数行`).toEqual([]);
  expect.soft(result.contrastIssues, `${label}: コントラスト不足`).toEqual([]);
  expect.soft(result.sizeIssues, `${label}: 文字が小さすぎる`).toEqual([]);
}

// 偽サイトの上端（ページ上端から .stage-viewport まで）と、HUDの3つの数値の高さ
async function auditGameTop(page, label) {
  const { stageTop, tops } = await page.evaluate(() => ({
    stageTop: document.getElementById('stage-viewport').getBoundingClientRect().top + window.scrollY,
    tops: ['hud-stage-text', 'hud-damage-text', 'hud-timer-text'].map((id) => document.getElementById(id).getBoundingClientRect().top)
  }));
  expect.soft(stageTop, `${label}: ページ上端から偽サイトまで`).toBeLessThanOrEqual(240);
  expect.soft(Math.max(...tops) - Math.min(...tops), `${label}: HUDの数値の高さ`).toBeLessThanOrEqual(1);
}

// 2つの要素の縦の間（上の要素の下端から、下の要素の上端まで）
async function shareGap(page, upper, lower) {
  return page.evaluate(([a, b]) => document.querySelector(b).getBoundingClientRect().top - document.querySelector(a).getBoundingClientRect().bottom, [upper, lower]);
}

async function seedRandom(page, seed = 6306) {
  await page.addInitScript((value) => {
    let a = value;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

async function open(page, size, seed) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedRandom(page, seed);
  await page.clock.install({ time: new Date('2026-10-10T09:00:00Z') });
  await page.goto(PATH);
  await page.clock.pauseAt(new Date('2026-10-10T09:00:05Z'));
}

const modal = (page) => page.locator('#modal-cleared');

// 出したばかりの部品の入力の停止が明けるまで、止めた時計を進める（この検査はすべて時計を止めて動かす）
async function passGuard(page) {
  await page.clock.runFor(INPUT_GUARD_MS);
}

// 解説モーダルが出て、入力を受け付け始めるまで（明けた状態で測る・押す）
async function toModal(page) {
  await expect(modal(page)).toHaveClass(/active/);
  await passGuard(page);
  await expect(modal(page)).not.toHaveAttribute('inert');
}

async function next(page) {
  await toModal(page);
  await page.locator('#btn-next-stage').click();
  await expect(modal(page)).not.toHaveClass(/active/);
}

async function retry(page) {
  await toModal(page);
  await page.locator('#btn-retry-stage').click();
  await expect(modal(page)).not.toHaveClass(/active/);
}

async function endCutin(page) {
  await page.clock.runFor(CUTIN_MS);
}

async function passStage2(page) {
  const summary = page.locator('.accordion-summary');
  if (await summary.count()) await summary.click();
  await page.locator('#chk-safe-plan').check();
  await page.locator('#btn-sub-start').click();
}

// 第3現場まで進める（第1・第2現場は看破）
async function toStage3(page) {
  await page.locator('#btn-start-game').click();
  await endCutin(page);
  await page.locator('#btn-reject-confirmshame').click();
  await next(page);
  await endCutin(page);
  await passStage2(page);
  await next(page);
  await endCutin(page);
}

for (const size of SIZES) {
  const tag = sizeTag(size);
  const phone = size.width < 700;

  test(`開始画面・共有ダイアログ（${tag}）`, async ({ page }) => {
    await open(page, size);
    await audit(page, `${tag} 開始画面`);
    await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
    await expect(page.locator('#app-share-dialog')).toBeVisible();
    await audit(page, `${tag} 共有ダイアログ`);
    expect(await shareGap(page, '#app-share-dialog .share__row', '#app-share-dialog .share__note'), 'ボタン列と注記の間').toBeGreaterThanOrEqual(12);
    expect(await shareGap(page, '#app-share-dialog .share__row', '#app-share-dialog .share__note'), 'ボタン列と注記の間').toBeLessThanOrEqual(16);
  });

  test(`第1・第2現場の全変種と解説モーダル（${tag}）`, async ({ page }) => {
    await open(page, size);
    await page.locator('#btn-start-game').click();
    await audit(page, `${tag} 第1現場カットイン`);
    await endCutin(page);
    if (phone) await auditGameTop(page, `${tag} 第1現場`);

    // 第1現場：拒否リンクの3つの配置をすべて出す（やり直すたびに配置が変わる）
    const layouts = new Set();
    for (let round = 0; round < 12 && layouts.size < 3; round++) {
      const layout = await page.locator('.ec-stage-box.is-popup').getAttribute('data-layout');
      layouts.add(layout);
      await audit(page, `${tag} 第1現場(${layout})`);
      await page.locator('#btn-accept-coupon').click();
      await toModal(page);
      await audit(page, `${tag} 第1現場 被弾の解説`);
      await retry(page);
      await endCutin(page);
    }
    expect(layouts.size).toBe(3);
    await page.locator('#btn-modal-fake-close').dispatchEvent('click');
    await expect(page.locator('.fake-modal-nag')).toBeVisible();
    await audit(page, `${tag} 第1現場の×の一言`);
    await page.locator('#btn-reject-confirmshame').click();
    await toModal(page);
    await audit(page, `${tag} 第1現場 看破の解説`);
    await next(page);
    await endCutin(page);
    if (phone) await auditGameTop(page, `${tag} 第2現場`);

    // 第2現場：注記2か所×チェックの左右の4通りをすべて出す。1回は時間切れの解説も測る
    const positions = new Set();
    let timedOut = false;
    for (let round = 0; round < 16 && positions.size < 4; round++) {
      const box = page.locator('.sub-stage-box');
      const position = `${await box.getAttribute('data-note')}/${await box.getAttribute('data-check')}`;
      positions.add(position);
      await audit(page, `${tag} 第2現場(${position})`);
      if (position.startsWith('below')) {
        // 開始ボタン直下の注記は、罠でも解くために読む文なので 11.5px 以上・4.5:1 以上（#6b7280 on #f9fafb で4.63:1）
        const fine = await page.locator('.fine-print').evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), color: getComputedStyle(el).color }));
        expect(fine.size).toBeGreaterThanOrEqual(11.5);
        expect(fine.color).toBe('rgb(107, 114, 128)');
      }
      const summary = page.locator('.accordion-summary');
      if (await summary.count()) {
        await summary.click();
        await audit(page, `${tag} 第2現場(${position}) 折りたたみを開いた`);
      }
      if (!timedOut) {
        await page.clock.runFor(31_000);
        await toModal(page);
        await expect(page.locator('#modal-badge')).toHaveClass(/is-timeout/);
        await audit(page, `${tag} 時間切れの解説`);
        timedOut = true;
      } else {
        await page.locator('#chk-safe-plan').check();
        await audit(page, `${tag} 第2現場(${position}) 罠解除の合図`);
        await page.locator('#btn-sub-start').click();
        await toModal(page);
        await audit(page, `${tag} 第2現場 看破の解説`);
      }
      await retry(page);
      await endCutin(page);
    }
    expect(positions.size).toBe(4);
  });

  test(`第3〜第5現場・結果画面（${tag}）`, async ({ page }) => {
    await open(page, size);
    await toStage3(page);

    // 第3現場
    if (phone) await auditGameTop(page, `${tag} 第3現場`);
    await audit(page, `${tag} 第3現場（お知らせ帯）`);
    await page.clock.runFor(1_500); // お知らせ帯がサイト自身の偽の通知に入れ替わる
    await expect(page.locator('.fake-toast')).toBeVisible();
    await audit(page, `${tag} 第3現場（偽の通知）`);
    // 偽の通知は緊急の赤帯にもボタンにも重ならない
    const overlap = await page.evaluate(() => {
      const toast = document.querySelector('.fake-toast').getBoundingClientRect();
      return ['.urgency-banner', '#btn-hotel-submit', '.hotel-plan-card'].filter((selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return !(toast.bottom <= r.top || toast.top >= r.bottom || toast.right <= r.left || toast.left >= r.right);
      });
    });
    expect(overlap).toEqual([]);
    await page.locator('#btn-hotel-submit').click();
    await toModal(page);
    await audit(page, `${tag} 第3現場 被弾の解説（理由の1行つき）`);
    await retry(page);
    await endCutin(page);
    await page.locator('input[value="freecancel"]').check();
    await audit(page, `${tag} 第3現場 罠解除の合図`);
    await page.locator('#btn-hotel-submit').click();
    await toModal(page);
    await next(page);

    // 第4現場（引き留めダイアログで「続ける」を押して被弾 → 解説に1行。やり直して看破）
    await endCutin(page);
    if (phone) await auditGameTop(page, `${tag} 第4現場`);
    await audit(page, `${tag} 第4現場`);
    const boxes = await page.locator('.option-row input[type="checkbox"]').evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().width)));
    expect(boxes).toEqual([16, 16]);
    await page.locator('#chk-opt-sub').click();
    await expect(page.locator('.retention-mini-dialog')).toBeVisible();
    await expect(page.locator('.mini-dialog-card')).toBeInViewport({ ratio: 1 });
    await audit(page, `${tag} 第4現場 引き留めダイアログ`);
    await page.locator('#btn-keep-sub').click();
    await passGuard(page);
    await page.locator('#btn-stage1-loud').click();
    await toModal(page);
    await audit(page, `${tag} 第4現場 被弾の解説（引き留めの1行つき）`);
    await retry(page);
    await endCutin(page);
    await page.locator('#chk-opt-sub').click();
    await page.locator('#btn-remove-sub').click();
    await passGuard(page);
    await page.locator('#chk-opt-warranty').uncheck();
    await audit(page, `${tag} 第4現場 罠解除の合図`);
    await page.locator('#btn-stage1-subtle').click();
    await toModal(page);
    await audit(page, `${tag} 第4現場 看破の解説`);
    await next(page);

    // 第5現場
    await endCutin(page);
    if (phone) await auditGameTop(page, `${tag} 第5現場`);
    await audit(page, `${tag} 第5現場`);
    await page.locator('#btn-real-cancel').dispatchEvent('click');
    await expect(page.locator('#survey-warning')).toBeVisible();
    await audit(page, `${tag} 第5現場 未回答の警告`);
    await page.locator('input[value="leave"]').check();
    await audit(page, `${tag} 第5現場 罠解除の合図`);
    await page.locator('#btn-real-cancel').dispatchEvent('click');
    await passGuard(page);
    await expect(page.locator('#btn-final-leave')).toBeInViewport({ ratio: 1 });
    await audit(page, `${tag} 第5現場 最終確認`);
    await page.locator('#btn-final-leave').click();
    await toModal(page);
    await expect(page.locator('#btn-next-stage')).toContainText('捜査報告書を見る');
    await audit(page, `${tag} 第5現場 看破の解説`);
    await next(page);

    // 結果画面（出した直後の約0.4秒は入力を受け付けない＝inert なので、それが明けてから測る）
    await expect(page.locator('#screen-result')).toHaveClass(/active/);
    await page.clock.runFor(500);
    await expect(page.locator('#screen-result')).not.toHaveAttribute('inert');
    await audit(page, `${tag} 結果画面`);
    const gap = await shareGap(page, '.result-share__row', '.result-share__note');
    expect(gap, '結果の共有欄：ボタン列と注記の間').toBeGreaterThanOrEqual(12);
    expect(gap, '結果の共有欄：ボタン列と注記の間').toBeLessThanOrEqual(16);

    // 称号・講評・目標・自己ベストの文言は周によって変わるので、全ランクぶん差し替えて測る（アプリと同じく文節を入れ直す）
    const cases = [
      [0, 21, false], [0, 95, false], [0, 30, true], [4980, 40, false], [12000, 50, false], [45730, 50, true]
    ];
    for (const [damage, sec, hasTimeouts] of cases) {
      const rank = calculateRank(damage, sec, hasTimeouts);
      const goal = describeNextGoal({ totalDamage: damage, totalTimeSec: sec, hasTimeouts }).text;
      await page.evaluate(({ title, comment, letter, color, goalText, seconds, damage }) => {
        const { phrasifyNode } = window.__day063Phrase;
        const set = (id, text) => {
          const el = document.getElementById(id);
          el.textContent = text;
          phrasifyNode(el);
        };
        set('result-rank-title', title);
        set('result-rank-desc', comment);
        set('result-goal', goalText);
        set('result-best', '自己ベストは、被害0円・時間切れなしの周で記録されます');
        document.getElementById('result-rank-letter').textContent = letter;
        document.getElementById('result-time-num').textContent = String(seconds);
        document.getElementById('result-damage-num').textContent = damage.toLocaleString('ja-JP');
        // ランクの円の地色と、被害総額の色もアプリと同じに差し替える（白い文字・赤い数字のコントラストを測るため）
        const shade = (hex, factor) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0')).join('')}`;
        document.getElementById('result-rank-circle').style.background = `linear-gradient(135deg, ${shade(color, 0.62)}, #111827)`;
        document.getElementById('result-total-damage').className = `stat-value ${damage === 0 ? 'is-zero' : 'is-hit'}`;
      }, { title: rank.title, comment: rank.comment, letter: rank.rank, color: rank.color, goalText: goal, seconds: sec, damage });
      await audit(page, `${tag} 結果画面（ランク${rank.rank}の文言）`);
    }
  });
}

test('縦の短い画面（375×667）でも、見せるべきものが最初の画面に入る', async ({ page }) => {
  await open(page, PHONES[1]);
  await expect(page.locator('#btn-start-game')).toBeInViewport({ ratio: 1 });

  const modalButtonsInView = async (label) => {
    await toModal(page);
    await settle(page);
    for (const id of ['#btn-next-stage', '#btn-retry-stage']) {
      await expect(page.locator(id), `${label}: ${id}`).toBeInViewport({ ratio: 1 });
    }
  };

  await page.locator('#btn-start-game').click();
  await endCutin(page);
  await page.locator('#btn-accept-coupon').click();
  await modalButtonsInView('第1現場 被弾');
  await retry(page);
  await endCutin(page);
  await page.locator('#btn-reject-confirmshame').click();
  await modalButtonsInView('第1現場 看破');
  await next(page);
  await endCutin(page);
  await passStage2(page);
  await modalButtonsInView('第2現場');
  await next(page);

  // 第3現場：1.6秒後、偽の通知が画面内に出る（予約の確定ボタンも画面内）
  await endCutin(page);
  await page.clock.runFor(1_600);
  await expect(page.locator('.fake-toast')).toBeVisible();
  await expect(page.locator('.fake-toast')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#btn-hotel-submit')).toBeInViewport({ ratio: 1 });
  await page.locator('#btn-hotel-submit').click();
  await modalButtonsInView('第3現場 被弾');
  await retry(page);
  await endCutin(page);
  await page.locator('input[value="freecancel"]').check();
  await page.locator('#btn-hotel-submit').click();
  await modalButtonsInView('第3現場 看破');
  await next(page);

  // 第4現場：赤い大ボタンと灰色の確定ボタンの両方が最初の画面に入る
  await endCutin(page);
  await settle(page);
  await expect(page.locator('#btn-stage1-loud')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#btn-stage1-subtle')).toBeInViewport({ ratio: 1 });
  await page.locator('#btn-stage1-loud').click();
  await modalButtonsInView('第4現場 被弾');
  await retry(page);
  await endCutin(page);
  await page.locator('#chk-opt-sub').click();
  await page.locator('#btn-remove-sub').click();
  await passGuard(page);
  await page.locator('#chk-opt-warranty').uncheck();
  await page.locator('#btn-stage1-subtle').click();
  await modalButtonsInView('第4現場 看破');
  await next(page);

  // 第5現場：退会手続きへのリンクまで画面内
  await endCutin(page);
  await expect(page.locator('#btn-real-cancel')).toBeInViewport({ ratio: 1 });
  await page.locator('input[value="leave"]').check();
  await page.locator('#btn-real-cancel').dispatchEvent('click');
  await passGuard(page);
  await page.locator('#btn-final-leave').click();
  await modalButtonsInView('第5現場');
});

for (const size of [{ width: 390, height: 720 }, { width: 360, height: 740 }]) {
  test(`解説モーダル：本文が画面からはみ出す高さでも、2つのボタンは下端に貼り付いて画面内（${sizeTag(size)}）`, async ({ page }) => {
    await open(page, size);
    await toStage3(page);
    await page.locator('input[value="freecancel"]').check();
    await page.locator('#btn-hotel-submit').click();
    await next(page);
    await endCutin(page);
    // いちばん長い解説（第4現場：2つとも被弾＋引き留めダイアログの1行）
    await page.locator('#chk-opt-sub').click();
    await page.locator('#btn-keep-sub').click();
    await passGuard(page);
    await page.locator('#btn-stage1-loud').click();
    await toModal(page);
    await settle(page);
    for (const id of ['#btn-next-stage', '#btn-retry-stage']) await expect(page.locator(id)).toBeInViewport({ ratio: 1 });
    // 続きがあるあいだはボタンの上をぼかし、最後まで読んだら消す
    const card = page.locator('.modal-card');
    const scrollable = await card.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
    await expect(card).toHaveClass(scrollable ? /has-more/ : /^modal-card$/);
    if (scrollable) {
      await card.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(card).not.toHaveClass(/has-more/);
      for (const id of ['#btn-next-stage', '#btn-retry-stage']) await expect(page.locator(id)).toBeInViewport({ ratio: 1 });
    }
  });
}

for (const size of WIDE) {
  const tag = sizeTag(size);

  test(`タブレット・PCで大きな空白を残さない（${tag}）`, async ({ page }) => {
    await open(page, size);
    // 開始カードは見出しの直下から（縦の中央に浮かせない）
    const startGap = await page.evaluate(() => document.querySelector('.start-card').getBoundingClientRect().top
      - document.querySelector('.app-header').getBoundingClientRect().bottom);
    expect(startGap, '見出しの下線から開始カードまで').toBeLessThanOrEqual(40);

    // 偽サイト枠の高さは中身に合わせる（最後の要素から枠の下端までの白い空き）
    const frameGap = (selector) => page.evaluate((sel) => document.querySelector('.browser-frame').getBoundingClientRect().bottom
      - document.querySelector(sel).getBoundingClientRect().bottom, selector);
    await page.locator('#btn-start-game').click();
    await endCutin(page);
    await page.locator('#btn-reject-confirmshame').click();
    await next(page);
    // 第2現場は注記の置き場所が2通りあるので、両方で測る
    const seen = new Set();
    for (let round = 0; round < 8 && seen.size < 2; round++) {
      await endCutin(page);
      await settle(page);
      const note = await page.locator('.sub-stage-box').getAttribute('data-note');
      seen.add(note);
      expect(await frameGap('.sub-stage-box'), `第2現場(${note})の枠の下の空き`).toBeLessThanOrEqual(120);
      await page.locator('#btn-sub-start').click();
      await retry(page);
    }
    expect(seen.size).toBe(2);
    await endCutin(page);
    await passStage2(page);
    await next(page);
    await endCutin(page);
    await page.locator('input[value="freecancel"]').check();
    await page.locator('#btn-hotel-submit').click();
    await next(page);
    await endCutin(page);
    await settle(page);
    expect(await frameGap('.ec-stage-content'), '第4現場の枠の下の空き').toBeLessThanOrEqual(120);
  });
}

test('第1現場：×を押して一言が出ても、緑のボタンと拒否リンクは動かない（3つの配置すべて）', async ({ page }) => {
  await open(page, PHONES[0]);
  await page.locator('#btn-start-game').click();
  await endCutin(page);
  const layouts = new Set();
  for (let round = 0; round < 12 && layouts.size < 3; round++) {
    layouts.add(await page.locator('.ec-stage-box.is-popup').getAttribute('data-layout'));
    await settle(page);
    const tops = () => page.evaluate(() => ['#btn-accept-coupon', '#btn-reject-confirmshame', '.fake-modal-card']
      .map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top * 10) / 10, Math.round(r.height * 10) / 10]; }));
    const before = await tops();
    await page.locator('#btn-modal-fake-close').dispatchEvent('click');
    await expect(page.locator('.fake-modal-nag')).toBeVisible();
    await settle(page);
    expect(await tops()).toEqual(before);
    await page.locator('#btn-accept-coupon').click();
    await retry(page);
    await endCutin(page);
  }
  expect(layouts.size).toBe(3);
});

test('第1現場：逃げる×は40回逃げてもポップアップの内側に留まり、ほかの要素と重ならない', async ({ page }) => {
  await open(page, PHONES[1], 2026);
  await page.locator('#btn-start-game').click();
  await endCutin(page);
  const close = page.locator('#btn-modal-fake-close');
  let dodges = 0;
  for (let round = 0; round < 40 && dodges < 40; round++) {
    // 逃げる回数は周ごとに2〜4回。押し下げ（pointerdown）のたびに逃げ、上限に達すると止まる
    for (let i = 0; i < 5 && dodges < 40; i++) {
      const before = await close.evaluate((el) => el.style.transform);
      await close.dispatchEvent('pointerdown');
      await settle(page);
      const after = await close.evaluate((el) => el.style.transform);
      if (after === before) break;
      dodges += 1;
      const problems = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const x = box(document.getElementById('btn-modal-fake-close'));
        const card = box(document.querySelector('.fake-modal-card'));
        const out = [];
        if (x.left < card.left || x.right > card.right || x.top < card.top || x.bottom > card.bottom) out.push('ポップアップの外');
        for (const sel of ['.coupon-badge-loud', '.fake-modal-lead', '#btn-accept-coupon', '#btn-reject-confirmshame', '.fake-modal-nag-slot']) {
          const r = box(document.querySelector(sel));
          if (!(x.bottom <= r.top || x.top >= r.bottom || x.right <= r.left || x.left >= r.right)) out.push(`${sel} と重なる`);
        }
        return out;
      });
      expect(problems, `${dodges}回目の×（${after}）`).toEqual([]);
    }
    await page.locator('#btn-accept-coupon').click();
    await retry(page);
    await endCutin(page);
  }
  expect(dodges).toBe(40);
});

test('第5現場：未回答の警告が出入りしても、フッターの「退会手続きへ進む」は動かない', async ({ page }) => {
  await open(page, PHONES[0]);
  await toStage3(page);
  await page.locator('input[value="freecancel"]').check();
  await page.locator('#btn-hotel-submit').click();
  await next(page);
  await endCutin(page);
  await page.locator('#chk-opt-sub').click();
  await page.locator('#btn-remove-sub').click();
  await passGuard(page);
  await page.locator('#chk-opt-warranty').uncheck();
  await page.locator('#btn-stage1-subtle').click();
  await next(page);
  await endCutin(page);

  const top = () => page.locator('#btn-real-cancel').evaluate((el) => el.offsetTop);
  const before = await top();
  await page.locator('#btn-real-cancel').dispatchEvent('click');
  await expect(page.locator('#survey-warning')).toBeVisible();
  expect(await top()).toBe(before);
  await page.locator('input[value="stay"]').check();
  await expect(page.locator('#survey-warning')).toBeHidden();
  expect(await top()).toBe(before);
});

test('文節の区切り（phrasifyNode）：何度呼んでも同じ結果で、文字の内容は変えず、飛ばす要素には触らない', async ({ page }) => {
  await open(page, PHONES[0]);
  await loadPhrase(page);
  const result = await page.evaluate(() => {
    const { phrasifyNode } = window.__day063Phrase;
    const root = document.createElement('div');
    // 飛ばす要素（data-no-phrase）と nowrap の中に、書き手が置いた <wbr> を1つずつ入れておく（後片付けで消さない）
    root.innerHTML = '<p id="t-main">サイトに仕込まれた<strong>ダークパターン</strong>を見抜き、1円も払わずに切り抜けてください。</p>'
      + '<p id="t-skip" data-no-phrase>文節に区切らない「罠UI」を<wbr>看破せよ</p>'
      + '<p id="t-nowrap">本文は<span style="white-space:nowrap">改行しない<wbr>短い文言</span>のあとで続きます</p>'
      + '<textarea id="t-area">入力欄の「罠UI」は触らない</textarea>'
      + '<style>.t-x { color: red; }</style>'
      + '<button id="t-flex" type="button" style="display:inline-flex">Xで投稿</button>';
    document.body.append(root);
    const text = root.textContent;
    phrasifyNode(root);
    const once = root.innerHTML;
    phrasifyNode(root);
    phrasifyNode(root);
    const out = {
      sameText: root.textContent === text,
      idempotent: root.innerHTML === once,
      wbrInMain: root.querySelectorAll('#t-main wbr').length,
      // <strong> をまたいで「仕込まれた｜ダークパターン」の間にも切れ目が入る
      wbrAtStrong: root.querySelector('#t-main strong').firstChild.nodeName,
      skipped: root.querySelector('#t-skip').innerHTML,
      // nowrap の中の書き手の <wbr> は元の位置に残り、増えもしない（アプリが入れる <wbr> には印 data-phrase-break が付く）
      authorWbrInNowrap: (() => {
        const span = root.querySelector('#t-nowrap span').cloneNode(true);
        span.querySelectorAll('wbr[data-phrase-break]').forEach((wbr) => wbr.remove());
        return span.innerHTML;
      })(),
      textarea: root.querySelector('#t-area').value,
      style: root.querySelector('style').textContent,
      // flex の入れ物の直下の文字は分けない（読み上げ名が「Xで 投稿」にならない）
      flex: root.querySelector('#t-flex').innerHTML,
      phrased: root.hasAttribute('data-phrased')
    };
    root.remove();
    return out;
  });
  expect(result).toEqual({
    sameText: true,
    idempotent: true,
    wbrInMain: expect.any(Number),
    wbrAtStrong: 'WBR',
    skipped: '文節に区切らない「罠UI」を<wbr>看破せよ',
    authorWbrInNowrap: '改行しない<wbr>短い文言',
    textarea: '入力欄の「罠UI」は触らない',
    style: '.t-x { color: red; }',
    flex: 'Xで投稿',
    phrased: true
  });
  expect(result.wbrInMain).toBeGreaterThanOrEqual(5);
});

test('ボタンとリンクの読み上げ名に、文節の区切りで空白が混ざらない（全画面）', async ({ page }) => {
  await open(page, PHONES[0]);
  const check = async (label) => {
    await settle(page);
    const items = await page.evaluate(() => {
      const dialog = [...document.querySelectorAll('dialog[open]')].find((d) => d.matches(':modal'));
      /* 期待する読み上げ名：ブロックの要素（<small> など）の前後だけ空白をはさむ。
         文節の区切りで入れた <wbr> と糊付けの span（data-ph）は、行内のものとして扱う（ここで空白が出たら不具合） */
      const nameOf = (node) => {
        let out = '';
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) out += child.data;
          if (child.nodeType !== Node.ELEMENT_NODE || child.getAttribute('aria-hidden') === 'true') continue;
          if (child.tagName === 'WBR' || child.hasAttribute('data-ph')) {
            out += nameOf(child);
            continue;
          }
          const display = getComputedStyle(child).display;
          out += display === 'inline' || display === 'contents' ? nameOf(child) : ` ${nameOf(child)} `;
        }
        return out;
      };
      return [...document.querySelectorAll('button, a[href]')]
        .filter((el) => el.checkVisibility() && !el.closest('[inert]') && !el.hasAttribute('aria-label') && (!dialog || dialog.contains(el)))
        .map((el) => ({ role: el.tagName === 'A' ? 'link' : 'button', name: nameOf(el).replace(/\s+/g, ' ').trim() }))
        .filter((item) => item.name);
    });
    expect(items.length, `${label}: 調べたボタンとリンクの数`).toBeGreaterThan(0);
    for (const { role, name } of items) {
      await expect(page.getByRole(role, { name, exact: true }).first(), `${label}: ${role}「${name}」`).toBeAttached();
    }
  };
  await check('開始画面');
  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  await check('共有ダイアログ');
  await page.keyboard.press('Escape');
  await page.locator('#btn-start-game').click();
  await endCutin(page);
  await check('第1現場');
  await page.locator('#btn-reject-confirmshame').click();
  await toModal(page);
  await check('解説モーダル');
  await next(page);
  await endCutin(page);
  await check('第2現場');
  await passStage2(page);
  await next(page);
  await endCutin(page);
  await check('第3現場');
  await page.locator('input[value="freecancel"]').check();
  await page.locator('#btn-hotel-submit').click();
  await next(page);
  await endCutin(page);
  await page.locator('#chk-opt-sub').click();
  await check('第4現場の引き留めダイアログ');
  await page.locator('#btn-remove-sub').click();
  await passGuard(page);
  await page.locator('#chk-opt-warranty').uncheck();
  await page.locator('#btn-stage1-subtle').click();
  await next(page);
  await endCutin(page);
  await page.locator('input[value="leave"]').check();
  await page.locator('#btn-real-cancel').dispatchEvent('click');
  // 最終確認は出た直後の入力の停止（inert）が明けてから調べる（inert の中のボタンは調べる対象から外れるため）
  await passGuard(page);
  await check('第5現場の最終確認');
  await page.locator('#btn-final-leave').click();
  await next(page);
  await page.clock.runFor(500);
  await check('結果画面');
});

/* 文字の大きさとコントラストの実測表（390×844）を test-results に残す。記録（implement.md）の表の出どころ */
test('コントラストの実測表を書き出す（390×844）', async ({ page }, testInfo) => {
  const rows = [];
  await open(page, PHONES[0]);
  const collect = async (label) => {
    await settle(page);
    await loadPhrase(page);
    const result = await page.evaluate(auditPage, { oneLine: [] });
    for (const row of result.measured) rows.push({ screen: label, ...row });
  };
  await collect('開始画面');
  await page.locator('#btn-start-game').click();
  await endCutin(page);
  await collect('第1現場');
  await page.locator('#btn-reject-confirmshame').click();
  await toModal(page);
  await collect('解説モーダル');
  await next(page);
  await endCutin(page);
  await collect('第2現場');
  const unique = new Map();
  for (const row of rows) {
    const key = `${row.side}|${row.el}`;
    if (!unique.has(key) || unique.get(key).ratio > row.ratio) unique.set(key, row);
  }
  const table = [...unique.values()].sort((a, b) => a.ratio - b.ratio);
  await testInfo.attach('contrast.json', { body: JSON.stringify(table, null, 1), contentType: 'application/json' });
  expect(table.every((row) => row.ratio >= row.need)).toBe(true);
});
