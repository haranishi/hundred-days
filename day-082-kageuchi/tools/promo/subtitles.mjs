// 字幕と終わりの画面を、透明な PNG（1080×1920）に描く。書体はシステムの「ヒラギノ明朝 ProN」（ゲームと同じ）。書体ファイルは配らず、映像に焼き込むだけ。
//   node subtitles.mjs   → output/subs/<id>.png と output/subs/layout.json（文字と下地の外接矩形・書体の確認）
// 暗い映像の上でも読めるよう、文字の後ろに柔らかい暗い下地と影を敷く。
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT } from './lib/harness.mjs';
import { openBrowser } from '../../source/tools/lib/shoot.mjs';
import { ENDCARD, HEIGHT, SUBTITLES, WIDTH } from './edit.mjs';

const DIR = path.join(OUT, 'subs');
const FONT = "'Hiragino Mincho ProN', 'ヒラギノ明朝 ProN'";
/** 字幕の文字の中心の高さ（画面の上から。下の HUD と人物の足元を避ける） */
const SUB_CENTER_Y = 1440;

const CSS = `
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; background: transparent; overflow: hidden; }
  body { font-family: ${FONT}; color: #f6eedd; -webkit-font-smoothing: antialiased; }
  .sub { position: absolute; left: 50%; top: ${SUB_CENTER_Y}px; transform: translate(-50%, -50%); text-align: center;
         padding: 24px 34px; border-radius: 28px; background: rgba(6, 7, 14, 0.58);
         box-shadow: 0 0 40px 22px rgba(6, 7, 14, 0.58); white-space: nowrap; }
  .sub div { font-size: 58px; font-weight: 600; letter-spacing: 0.04em; line-height: 1.42;
             text-shadow: 0 2px 3px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.9); }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(5,5,10,0.70) 0%, rgba(5,5,10,0.55) 55%, rgba(5,5,10,0.35) 100%); }
  .end { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); text-align: center; white-space: nowrap; }
  .end .title { font-size: 210px; font-weight: 600; letter-spacing: 0.12em; margin-right: -0.12em; line-height: 1.1; color: #fbf3e2;
                text-shadow: 0 4px 6px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.8); }
  .end .rule { width: 420px; height: 3px; margin: 40px auto 46px; background: #c8402e; box-shadow: 0 0 10px rgba(0,0,0,0.8); }
  .end .line { font-size: 54px; font-weight: 600; letter-spacing: 0.06em; line-height: 1.6; text-shadow: 0 2px 3px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.9); }
`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function main() {
  mkdirSync(DIR, { recursive: true });
  const { browser, name } = await openBrowser();
  const layout = { browser: name, safe: { x0: WIDTH * 0.1, y0: HEIGHT * 0.1, x1: WIDTH * 0.9, y1: HEIGHT * 0.9 }, items: [] };
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    // 書体があるか：欧文の同じ文字列の幅が、無い書体（等幅に落ちる）と違うかで確かめる（和文は どの書体も全角で幅が同じなので使えない）
    await page.setContent(`<style>${CSS}</style><span id="a" style="font-family:${FONT};font-size:60px">Hamburgefonstiv Day082</span><br><span id="b" style="font-family:'NoSuchFont-xyz',monospace;font-size:60px">Hamburgefonstiv Day082</span>`);
    const fontCheck = await page.evaluate(() => ({ hira: document.getElementById('a').getBoundingClientRect().width, fallback: document.getElementById('b').getBoundingClientRect().width }));
    layout.font = { family: 'Hiragino Mincho ProN', ...fontCheck, available: Math.abs(fontCheck.hira - fontCheck.fallback) > 0.5 };
    if (!layout.font.available) throw new Error('ヒラギノ明朝 ProN が見つからない');
    for (const s of SUBTITLES) {
      for (const l of s.lines) if ([...l].length > 16) throw new Error(`1行16字を超える: ${l}`);
      if (s.lines.length > 2) throw new Error(`2行を超える: ${s.id}`);
      await page.setContent(`<style>${CSS}</style><div class="sub" id="box">${s.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`);
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(() => {
        const b = document.getElementById('box').getBoundingClientRect();
        const t = [...document.querySelectorAll('#box div')].map((d) => {
          const range = document.createRange();
          range.selectNodeContents(d);
          return range.getBoundingClientRect();
        });
        const tx = { x0: Math.min(...t.map((q) => q.left)), y0: Math.min(...t.map((q) => q.top)), x1: Math.max(...t.map((q) => q.right)), y1: Math.max(...t.map((q) => q.bottom)) };
        return { box: { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }, text: tx };
      });
      await page.screenshot({ path: path.join(DIR, `${s.id}.png`), omitBackground: true });
      layout.items.push({ id: s.id, lines: s.lines, ...r });
    }
    for (const l of ENDCARD.lines) if ([...l].length > 16) throw new Error(`1行16字を超える: ${l}`);
    await page.setContent(
      `<style>${CSS}</style><div class="end-shade"></div><div class="end" id="box"><div class="title">${esc(ENDCARD.title)}</div><div class="rule"></div>${ENDCARD.lines.map((l) => `<div class="line">${esc(l)}</div>`).join('')}</div>`,
    );
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const b = document.getElementById('box').getBoundingClientRect();
      return { box: { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }, text: { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom } };
    });
    await page.screenshot({ path: path.join(DIR, `${ENDCARD.id}.png`), omitBackground: true });
    layout.items.push({ id: ENDCARD.id, lines: [ENDCARD.title, ...ENDCARD.lines], ...r });
  } finally {
    await browser.close();
  }
  for (const it of layout.items) {
    const s = layout.safe;
    // 文字は 10% の内側に。下地（ぼかしの影を除く箱）も内側に
    it.insideSafe = it.text.x0 >= s.x0 && it.text.x1 <= s.x1 && it.text.y0 >= s.y0 && it.text.y1 <= s.y1 && it.box.x0 >= s.x0 && it.box.x1 <= s.x1;
  }
  writeFileSync(path.join(DIR, 'layout.json'), JSON.stringify(layout, null, 2));
  for (const it of layout.items) console.log(`${it.id}: 文字 x ${it.text.x0.toFixed(0)}–${it.text.x1.toFixed(0)}・y ${it.text.y0.toFixed(0)}–${it.text.y1.toFixed(0)}（10% の内側: ${it.insideSafe}）`);
  console.log(`書体: ${JSON.stringify(layout.font)}`);
  if (layout.items.some((it) => !it.insideSafe)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
