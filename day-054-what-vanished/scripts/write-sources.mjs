// data/models.json（fetch-assets.mjs が書く記録）から、素材の出典一覧 data/SOURCES.md を作る。
// 使い方: node day-054-what-vanished/scripts/write-sources.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROPS } from '../lib/catalog.js';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const m = JSON.parse(readFileSync(join(appDir, 'data/models.json'), 'utf8'));
const nameOf = (file) => Object.values(PROPS).find(p => p.file === file)?.name || '（家具）';
const lines = [
  '# 素材の出典',
  '',
  'すべて [Poly Haven](https://polyhaven.com/) の素材で、ライセンスは [CC0](https://creativecommons.org/publicdomain/zero/1.0/)（帰属表示の義務なし）。取得には Poly Haven の公開API（https://api.polyhaven.com）を使った（Powered by Poly Haven）。一覧は `scripts/write-sources.mjs` が `data/models.json` から作る。',
  '',
  '## 加工',
  '',
  '`scripts/fetch-assets.mjs` で 1k の glTF を取り、重複と未使用を除き、三角形が多いものは間引き、質感画像を WebP にして小さくし（色は256〜1024px、凹凸などはその半分）、頂点を量子化した。いくつかはアプリ側で大きさを実物に合わせて縮めている（`lib/catalog.js` の scale）。額と写真立てのガラスは、素材の jpg に透明の情報が無いため、読み込み時に半透明の材質へ置き換えている。',
  '',
  '## 3Dモデル',
  '',
  '| ファイル | 答えの札の名前 | Poly Haven の素材 | 作者 | 三角形（元→同梱） | 大きさ |',
  '|---|---|---|---|---|---|'
];
for (const [id, r] of Object.entries(m.models).sort()) {
  lines.push(`| ${id}.glb | ${nameOf(id)} | [${r.name}](https://polyhaven.com/a/${r.ph}) | ${r.authors.join('、')} | ${r.trisBefore}→${r.tris} | ${(r.bytes / 1024).toFixed(0)}KB |`);
}
lines.push('', '## 床・壁・敷物の質感と、窓の外の景色', '', '| ファイル | Poly Haven の素材 | 作者 | 使い方 |', '|---|---|---|---|');
for (const [id, r] of Object.entries(m.textures).sort()) {
  const use = id === 'garden' ? '窓の外の景色。HDRI の色調済み JPG を 2048×1024 の WebP に縮小（家の中の光には使わない）' : '床・壁・敷物の質感';
  lines.push(`| ${id}_*.webp | [${r.name}](https://polyhaven.com/a/${r.ph}) | ${r.authors.join('、')} | ${use} |`);
}
lines.push('', '## コードで作ったもの', '', '壁・窓・扉・天井・幅木・壁ぎわの陰り・接地の影・効果音は、この作品のコードで作っている。3Dの表示には three.js 0.186.0（MIT。`vendor/LICENSE-three.txt`）を GLTFLoader・RoomEnvironment・mergeGeometries 入りで1ファイルにまとめて同梱した。', '');
writeFileSync(join(appDir, 'data/SOURCES.md'), lines.join('\n'));
console.log('data/SOURCES.md を書きました');
