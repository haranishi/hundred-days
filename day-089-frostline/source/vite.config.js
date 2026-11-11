import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
// 配信物から、開発のときだけ使う山のデータの控え（public/world-*／?world=名前 で読む）を外す。
// Vite は public/ をそのまま写すので、外さないと、使われない 48 MB が本番に載る
const dropDevWorlds = () => ({
  name: 'drop-dev-worlds',
  apply: 'build',
  closeBundle() {
    const out = 'dist';
    try { for (const name of readdirSync(out)) if (/^world-/.test(name)) rmSync(join(out, name), { recursive: true, force: true }); } catch { /* 出力先を変えたときは、組み立ての道具が外す */ }
  },
});
// base は相対（./）。100 日チャレンジでは /100days/day-089-frostline/ の下に置くので、/assets/ と書くと読めない
export default { base: './', plugins: [dropDevWorlds()] };
