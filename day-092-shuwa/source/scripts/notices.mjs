/** 配布物に含める第三者の許諾の写しを public/THIRD_PARTY_NOTICES.txt に作る（ビルドの前に流す） */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
// 画面に届く（配布物に入る）ものだけを並べる。開発用の道具は入れない
const PACKAGES = [
  'preact', '@preact/signals', '@preact/signals-core', 'three', '@mediapipe/tasks-vision',
  'workbox-window', 'budoux',
];

const parts = [
  'てことば（100日チャレンジ Day092）が配布物に含める第三者のソフトウェアと書体の許諾',
  'このファイルは scripts/notices.mjs が node_modules から自動で作る。',
  '',
];
for (const name of PACKAGES) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(dir)) continue;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  parts.push('='.repeat(72), `${name} ${pkg.version}  (${pkg.license ?? 'license field なし'})`, pkg.homepage ?? '', '');
  // BudouXのnpm配布にはLICENSEが無い。ソースの著作権表示と、同梱済みのApache-2.0本文を載せる。
  if (name === 'budoux' && !licenseFile) {
    parts.push('Copyright 2021 Google LLC', 'https://github.com/google/budoux', '', readFileSync(join(root, 'node_modules/typescript/LICENSE'), 'utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim(), '');
  } else {
    parts.push(licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : '（パッケージに許諾の本文が無い。package.json の license 欄を参照）', '');
  }
}
parts.push('='.repeat(72), 'Zen Maru Gothic (Yoshimichi Ohira) — 使う文字だけに絞って同梱  (SIL Open Font License 1.1)', 'https://github.com/googlefonts/zen-marugothic', '', readFileSync(join(root, 'src/ui/fonts/OFL.txt'), 'utf8').trim(), '');
parts.push('='.repeat(72), 'MediaPipe Hand Landmarker model (hand_landmarker.task, float16, version 1)', 'Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0', 'Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf', '');
writeFileSync(join(root, 'public', 'THIRD_PARTY_NOTICES.txt'), parts.join('\n'));
console.log('THIRD_PARTY_NOTICES.txt を作りました');
