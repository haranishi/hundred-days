// 設計ツール：ねらいの影の位置から道具の置き場所を逆算し、許容幅・一意性を測って、プレビューのSVGを書く。
//   node tools/design/run.mjs [事件id] [出力ディレクトリ]
// 数値を変えたら、結果を lib/cases.js へ写し、tests/cases.test.mjs で確かめる（このツールは配信されない）。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { calibrate, makeStage, sheet, uniqueness } from './design.mjs';
import { SPECS } from './specs.mjs';

const [only, outDir = join(process.cwd(), 'design-out')] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
for (const spec of SPECS) {
  if (only && spec.id !== only) continue;
  const stage = makeStage(spec);
  const { out, target } = calibrate(stage);
  const passes = uniqueness(stage, target, 3).filter((row) => row.success).map((row) => row.ly);
  console.log(`${spec.id} ${spec.name}: 正解合格=${out.solutionOk} 開始=${JSON.stringify(out.start)} 灯りの許容=${JSON.stringify(out.lamp)} 合格する高さ=${passes.join(',')} (正解 ${stage.lamp.solution})`);
  for (const prop of stage.props) console.log(`  ${prop.id}: y=${prop.y} z=${prop.z} scale=${prop.scale} x=${JSON.stringify(prop.x)}${prop.decoy ? ' 邪魔' : ''}`);
  sheet(stage, target, join(outDir, `sheet-${spec.id}.svg`));
}
