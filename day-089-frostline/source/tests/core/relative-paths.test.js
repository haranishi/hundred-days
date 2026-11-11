import { it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// ゲームは、100 日チャレンジの /100days/day-089-frostline/ のようなサブパスの下に置かれる。
// 読み込む住所を「/world/…」のように根から書くと、本番だけ 404 になる（2026-11-11、山の地図の画像が本番で読めなかった）。
// コードの中の文字列で、自分の素材を根から指しているものが無いことを確かめる
const ROOT = new URL('../../src/', import.meta.url).pathname;
const files = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });
it('自分の素材（山のデータ・模型・このゲームについて・許諾・共有の部品）を、根の住所（/…）で指していない', () => {
  const bad = [];
  for (const file of files(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/['"`]\/(world|models|about|licenses|assets|shared|favicon)\b[^'"`]*['"`]/g)) bad.push(`${file.slice(ROOT.length)}: ${m[0]}`);
  }
  expect(bad).toEqual([]);
});
