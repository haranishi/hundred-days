// 空のファイルを作る小さな道具（編集の下ごしらえ用）：node lib/touch.mjs <パス>...
// 既にあるファイルは変えない。
import { existsSync, writeFileSync } from 'node:fs';

for (const p of process.argv.slice(2)) {
  if (!existsSync(p)) writeFileSync(p, '// new\n');
}
