// 検証を1コマンドにまとめる（構文・試験・撮影）。シェルの記号（&& ; |）を使わずに済ませるための道具。
// 使い方（作業フォルダのルートで）:
//   node day-096-ux-recipe/tools/verify.mjs --types hero,pain --themes soft,calm --widths 390,960 --fills mid,max,empty --out shots
//   --no-shots で構文と試験だけ。--types を省くと全部品。--accents 0,3 で強調色（既定 0）。
// 出力: 構文の問題・試験の件数と失敗の名前・撮った画像のパス・ページのコンソールエラー。
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { BLOCK_SCHEMA, BLOCK_TYPES } from '../lib/contract.js';
import { startServer } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dayDir = join(root, 'day-096-ux-recipe');
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const list = (name, fallback) => String(opt(name, fallback)).split(',').map((s) => s.trim()).filter(Boolean);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'shots') continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

// 1. 構文
const syntax = [];
for (const file of walk(dayDir)) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) syntax.push(`${file.replace(`${root}/`, '')}\n${(r.stderr || '').split('\n').slice(0, 4).join('\n')}`);
}
console.log(syntax.length ? `■ 構文エラー ${syntax.length} 件\n${syntax.join('\n')}` : '■ 構文: 問題なし');

// 2. 試験
const t = spawnSync(process.execPath, ['--test', 'day-096-ux-recipe/tests/'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = `${t.stdout}\n${t.stderr}`;
const num = (label) => (out.match(new RegExp(`ℹ ${label} (\\d+)`)) || [])[1] ?? '?';
console.log(`■ 試験: ${num('tests')} 件中 成功 ${num('pass')}・失敗 ${num('fail')}`);
const failing = [...out.matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1]);
if (failing.length) {
  console.log(`  失敗した試験:\n${[...new Set(failing)].map((n) => `   - ${n}`).join('\n')}`);
  const detail = [...out.matchAll(/AssertionError[^\n]*\n?[^\n]*/g)].slice(0, 6).map((m) => `   ${m[0].replace(/\n/g, ' ').slice(0, 260)}`);
  if (detail.length) console.log(`  失敗の中身（先頭）:\n${detail.join('\n')}`);
}

// 3. 撮影
if (!argv.includes('--no-shots')) {
  const types = list('types', BLOCK_TYPES.join(',')).filter((x) => BLOCK_TYPES.includes(x));
  const themes = list('themes', 'soft,lively');
  const widths = list('widths', '390,960').map(Number);
  const fills = list('fills', 'mid');
  const accents = list('accents', '0').map(Number);
  const outDir = resolve(opt('out', 'shots'));
  mkdirSync(outDir, { recursive: true });
  const server = await startServer({ port: 0 });
  const browser = await chromium.launch();
  const files = [];
  const problems = [];
  for (const type of types) {
    for (let variant = 0; variant < BLOCK_SCHEMA[type].variants.length; variant += 1) {
      for (const theme of themes) for (const width of widths) for (const fill of fills) for (const accent of accents) {
        const page = await browser.newPage({ viewport: { width: Math.max(width + 40, 360), height: 900 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${server.url}/tools/gallery.html?mode=block&type=${type}&variant=${variant}&theme=${theme}&accent=${accent}&width=${width}&fill=${fill}`);
        await page.waitForSelector('body[data-ready="true"]', { timeout: 15_000 }).catch(() => errors.push('data-ready にならない'));
        const file = join(outDir, `${type}-v${variant}-${theme}-a${accent}-${width}-${fill}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const overflow = await page.evaluate(() => { const f = document.querySelector('.frame'); return f ? f.scrollWidth > f.clientWidth + 1 : false; });
        if (overflow) errors.push(`横にはみ出し（${width}px）`);
        files.push(file);
        if (errors.length) problems.push(`${type}/v${variant}/${theme}/${width}/${fill}: ${[...new Set(errors)].join(' | ').slice(0, 200)}`);
        await page.close();
      }
    }
  }
  await browser.close();
  await server.close();
  console.log(`■ 撮影: ${files.length} 枚 → ${outDir}`);
  console.log(files.slice(0, 400).map((f) => `  ${f}`).join('\n'));
  console.log(problems.length ? `■ 撮影中の問題 ${problems.length} 件\n${problems.slice(0, 40).map((p) => `  ${p}`).join('\n')}` : '■ 撮影中の問題: なし');
}
