'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function failure(code, message) { return Object.assign(new Error(message), { code }); }

/** Rasterize LibreOffice's drawing export without running its scripts or allowing external resources. */
async function renderSvg(svgPath, outputDir, { maxPages = 100, timeout = 90_000, signal, onProgress } = {}) {
  if (signal?.aborted) throw failure('ABORTED', '資料の描画を中止しました。');
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { throw failure('BROWSER_UNAVAILABLE', '描画ブラウザがありません。'); }
  if ((await fs.stat(svgPath)).size > 256 * 1024 * 1024) throw failure('SVG_SIZE', '資料の画像データが大きすぎます。PDF形式でお試しください。');
  let browser;
  let interrupted = false;
  const interrupt = () => { interrupted = true; if (browser) void browser.close().catch(() => {}); };
  const watchdog = setTimeout(interrupt, Math.max(1, timeout));
  signal?.addEventListener('abort', interrupt, { once: true });
  // Abort can arrive while the preceding file inspection is pending.
  if (signal?.aborted) interrupt();
  try {
    if (interrupted) throw failure('ABORTED', '資料の描画を中止しました。');
    try { browser = await chromium.launch({ headless: true, timeout: Math.max(1, timeout) }); }
    catch (error) {
      if (/Executable doesn't exist|browserType\.launch.*executable|Please run.*playwright install/is.test(error.message)) {
        throw failure('BROWSER_UNAVAILABLE', '描画ブラウザを準備してください。');
      }
      throw error;
    }
    if (interrupted) throw failure('ABORTED', '資料の描画を中止しました。');
    const context = await browser.newContext({ javaScriptEnabled: false, acceptDownloads: false });
    const target = pathToFileURL(svgPath).href;
    // PowerPoint links and external images must not read local files or contact a network service.
    await context.route('**/*', route => {
      const url = route.request().url();
      return url === target || url.startsWith('data:') ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(Math.max(1, timeout));
    await page.goto(target, { waitUntil: 'load', timeout: Math.max(1, timeout) });
    const info = await page.evaluate(() => {
      const svg = document.documentElement;
      if (svg.localName !== 'svg') throw new Error('スライドの描画データを読み取れませんでした。');
      const box = svg.viewBox.baseVal;
      if (![box.width, box.height].every(n => Number.isFinite(n) && n > 0) || box.width / box.height < 0.1 || box.width / box.height > 10) throw new Error('資料の縦横比を読み取れませんでした。');
      const ratio = box.width / box.height;
      const width = ratio >= 1 ? 2000 : Math.round(2000 * ratio);
      const height = ratio >= 1 ? Math.round(2000 / ratio) : 2000;
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      const faces = Array.from(document.querySelectorAll('font-face')).map(face => ({
        family: face.getAttribute('font-family') || '',
        weight: /^(normal|bold|[1-9]00)$/.test(face.getAttribute('font-weight')) ? face.getAttribute('font-weight') : 'normal',
        style: /^(normal|italic|oblique)$/.test(face.getAttribute('font-style')) ? face.getAttribute('font-style') : 'normal'
      }));
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = faces.filter(face => face.family).map(face => {
        const base = face.family.replace(/ embedded$/, '');
        // Bind both names emitted by LibreOffice to the same installed typeface.
        const native = base === '游ゴシック Bold' ? 'YuGo-Bold' : base === '游ゴシック' ? 'YuGo-Medium' : base;
        return [...new Set([face.family, base])].map(family =>
          `@font-face{font-family:${JSON.stringify(family)};src:local(${JSON.stringify(native)});font-weight:${face.weight};font-style:${face.style};}`
        ).join('\n');
      }).join('\n');
      svg.append(style);
      const slides = Array.from(document.querySelectorAll('g.Slide')).filter(el => el.id && el.id !== 'dummy-slide');
      const ooo = 'http://xml.openoffice.org/svg/export';
      const metadata = Array.from(document.querySelectorAll('[id^="ooo:meta_slide_"]'));
      for (const slide of slides) {
        // The export stores backgrounds/master objects in defs; its disabled script would normally instantiate them.
        const meta = metadata.find(el => el.getAttributeNS(ooo, 'slide') === slide.id);
        const master = meta?.getAttributeNS(ooo, 'master');
        const page = slide.querySelector('g.Page');
        const layers = [];
        if (meta?.getAttributeNS(ooo, 'background-visibility') !== 'hidden') {
          layers.push(meta?.getAttributeNS(ooo, 'has-custom-background') === 'true' ? `bg-${slide.id}` : `bg-${master}`);
        }
        if (meta?.getAttributeNS(ooo, 'master-objects-visibility') !== 'hidden') layers.push(`bo-${master}`);
        if (page) for (const id of layers.reverse()) {
          if (!document.getElementById(id)) continue;
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
          use.setAttribute('href', `#${id}`);
          page.prepend(use);
        }
        slide.parentElement.style.display = 'none';
      }
      return { ids: slides.map(el => el.id), width, height };
    });
    if (!info.ids.length) throw failure('EMPTY_SVG', '資料にスライドがありません。');
    if (info.ids.length > maxPages) throw failure('PAGE_LIMIT', `資料は${maxPages}ページ以内にしてください。`);
    onProgress?.({ completed: 0, total: info.ids.length });
    await page.setViewportSize({ width: info.width, height: info.height });
    const files = [];
    for (let i = 0; i < info.ids.length; i++) {
      if (interrupted) throw failure('ABORTED', '資料の描画を中止しました。');
      await page.evaluate(({ ids, index }) => {
        for (const id of ids) document.getElementById(id).parentElement.style.display = 'none';
        let node = document.getElementById(ids[index]);
        while (node) {
          node.removeAttribute('visibility');
          node.style.visibility = 'visible';
          node.style.display = '';
          node = node.parentElement;
        }
      }, { ids: info.ids, index: i });
      await page.evaluate(() => document.fonts.ready);
      const filename = `slide-${i + 1}.png`;
      await page.screenshot({ path: path.join(outputDir, filename), type: 'png', timeout: Math.max(1, timeout) });
      files.push(filename);
      if (interrupted) throw failure('ABORTED', '資料の描画を中止しました。');
      onProgress?.({ completed: files.length, total: info.ids.length });
    }
    return files;
  } catch (error) {
    if (interrupted) throw failure('ABORTED', '資料の描画に時間がかかりすぎました。PDF形式でお試しください。');
    throw error;
  } finally {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', interrupt);
    if (browser) await browser.close().catch(() => {});
  }
}
module.exports = { renderSvg };
