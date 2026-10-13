// 全8面×主な画面幅で、盤のマスの大きさと、盤と操作を置いた後の余りの高さを表にする（開発用・配信しない）。
// 使い方: node layout-table.mjs   （収まらない組み合わせがあれば終了コード1）
import { readFileSync } from 'node:fs';
import { layoutMode, cellSize, spareHeight, CELL_MIN } from './layout.mjs';

const levels = JSON.parse(readFileSync(new URL('../levels.json', import.meta.url), 'utf8'));
const views = [[390, 844], [375, 667], [320, 568], [844, 390], [1440, 900], [768, 1024], [360, 800]];
console.log('| 面 | 盤 | ' + views.map(([w, h]) => `${w}×${h}`).join(' | ') + ' |');
console.log('|---|---|' + views.map(() => '---').join('|') + '|');
let bad = 0;
for (const L of levels) {
  const cols = L.board[0].length;
  const rows = L.board.length;
  const cells = views.map(([vw, vh]) => {
    const c = cellSize({ vw, vh, cols, rows });
    const spare = spareHeight({ vw, vh, cols, rows });
    if (spare < 0 || c < CELL_MIN) bad++;
    return `${layoutMode(vw, vh)} ${c}px（余り${spare}）`;
  });
  console.log(`| ${L.no} | ${cols}×${rows} | ${cells.join(' | ')} |`);
}
if (bad) { console.log(`\n収まらない組み合わせが ${bad} 件`); process.exit(1); }
console.log('\n全面・全画面幅で、盤（1マス36px以上）と操作が最初の画面に収まる');
