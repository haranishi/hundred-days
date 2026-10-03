// OWNER: dragon
// 操作できる怪獣3体の GLB を、Blender を画面なしで並べて動かして作り直す（同じ引数なら同じ出力）。最後に各出力の SHA-256 を出す。
//
//   npm run build:creatures                 3体とも（紅竜・雷翼・焔角）
//   npm run build:creatures -- raiyoku      名前を並べると、その怪獣だけ
//   --preview DIR                           形の確認の画像（Workbench）も DIR/<名前>/ に撮る
//   環境変数 BLENDER で Blender の場所を変えられる（既定は /Applications/Blender.app/Contents/MacOS/Blender）
//
// 紅竜の出力は r00c と同じバイト列のままにしてある（public/assets/dragon.glb と tools/blender/dragon-report.json）。
// 共通の処理（dragonlib/）を直したら、ここで表示される紅竜の SHA-256 が前と同じかを確かめる。
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const CREATURES = {
  kurenai: { out: 'public/assets/dragon.glb', report: 'tools/blender/dragon-report.json' },
  raiyoku: { out: 'public/assets/raiyoku.glb', report: 'tools/blender/raiyoku-report.json' },
  homuratsuno: { out: 'public/assets/homuratsuno.glb', report: 'tools/blender/homuratsuno-report.json' },
};

const argv = process.argv.slice(2);
const previewAt = argv.indexOf('--preview');
const preview = previewAt >= 0 ? argv[previewAt + 1] : null;
const names = argv.filter((a, i) => !a.startsWith('--') && (previewAt < 0 || i !== previewAt + 1));
const targets = names.length > 0 ? names : Object.keys(CREATURES);
for (const n of targets) if (!(n in CREATURES)) throw new Error(`知らない怪獣: ${n}（${Object.keys(CREATURES).join('・')}）`);

function build(name) {
  const { out, report } = CREATURES[name];
  const args = ['--background', '--factory-startup', '--python', 'tools/blender/build_creature.py', '--', '--creature', name, '--out', out, '--report', report];
  if (preview) args.push('--preview', path.join(preview, name));
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(BLENDER, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.on('error', reject);
    child.on('exit', (code) => {
      // Blender は Python の例外でも終了コード 0 で終わることがあるので、報告の行が出たかで確かめる
      if (code !== 0 || !log.includes('CREATURE_REPORT ' + name) || /Traceback/.test(log)) {
        reject(new Error(`${name} の組み立てに失敗しました（終了コード ${code}）\n${log.slice(-3000)}`));
        return;
      }
      resolve({ name, seconds: (Date.now() - t0) / 1000 });
    });
  });
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(path.join(ROOT, file))).digest('hex');
}

const results = await Promise.all(targets.map(build));
for (const { name, seconds } of results) {
  const { out, report } = CREATURES[name];
  const r = JSON.parse(await readFile(path.join(ROOT, report), 'utf8'));
  const clips = Object.entries(r.clips ?? {}).map(([k, c]) => `${k} ${c.duration}s${c.stride ? `（歩幅 ${c.stride}m）` : ''}`);
  console.log(`${name}: ${seconds.toFixed(1)}秒  三角形 近景 ${r.triangles.lod0}・遠景 ${r.triangles.lod1}  骨 ${r.bones}  クリップ ${clips.length}本`);
  console.log(`  ${clips.join('・')}`);
  console.log(`  ${out}  ${await sha256(out)}`);
  console.log(`  ${report}  ${await sha256(report)}`);
}
