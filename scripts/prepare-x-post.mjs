/* Day NのX投稿素材を準備する。公開は行わず、人による最終確認の直前までを自動化する。 */
'use strict';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appsDir = join(root, 'apps');
const args = process.argv.slice(2);

const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? '' : args[index + 1] || '';
};

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

if (args.includes('--help')) {
  console.log('Usage: npm run x:prepare -- --day <N> --video <path> --media-reviewed');
  process.exit(0);
}

const day = Number(option('--day'));
const videoOption = option('--video');
const mediaReviewed = args.includes('--media-reviewed');

if (!Number.isInteger(day) || day < 1 || day > 100) fail('--dayには1〜100の整数を指定する');
if (!videoOption) fail('--videoに動作動画のパスを指定する');
if (!mediaReviewed) fail('動画の映り込みを目視確認してから--media-reviewedを付ける');

const candidates = readdirSync(appsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^day-\d{3}-/.test(entry.name))
  .map((entry) => {
    const metaPath = join(appsDir, entry.name, 'meta.json');
    return existsSync(metaPath)
      ? { dir: entry.name, metaPath, meta: JSON.parse(readFileSync(metaPath, 'utf8')) }
      : null;
  })
  .filter(Boolean)
  .filter((entry) => entry.meta.day === day);

if (candidates.length !== 1) fail(`Day ${day}のmeta.jsonを一意に特定できない`);

const { dir, meta } = candidates[0];
if (meta.status !== 'published') fail(`Day ${day}はpublishedではないためX公開を準備できない`);
if (!meta.title || !meta.publicUrl) fail('meta.jsonのtitleまたはpublicUrlが空');

const aiHandled = meta.aiHandled?.find((value) => typeof value === 'string' && value.trim());
const humanHandled = meta.humanHandled?.find((value) => typeof value === 'string' && value.trim());
if (!aiHandled || !humanHandled) fail('AI担当と本人担当をmeta.jsonに事実ベースで記入する');

const xConfig = meta.social?.x;
const summary = xConfig?.summary?.trim();
const hashtagValues = xConfig?.hashtags;
if (!summary) fail('meta.jsonのsocial.x.summaryが空');
if (!Array.isArray(hashtagValues) || hashtagValues.length < 1 || hashtagValues.length > 2) {
  fail('meta.jsonのsocial.x.hashtagsは1〜2個にする');
}

const hashtags = hashtagValues.map((value) => {
  const tag = String(value).startsWith('#') ? String(value) : `#${value}`;
  if (!/^#[\p{L}\p{N}_]+$/u.test(tag)) fail(`無効なハッシュタグ: ${tag}`);
  return tag;
});

// meta.json の aiHandled / humanHandled / failuresAndFixes は「正確な記録」なので長くてよい。
// そのまま貼ると280を超えるため、social.x 側に短縮版を書けるようにする。
// 未指定なら従来どおり記録の先頭をそのまま使う。
//   "social": { "x": { "ai": "…", "human": "…", "failure": "…", "emoji": "💸" } }
// failure に空文字を明示すると、失敗の行を省略できる。
const failure = meta.failuresAndFixes?.find((item) => item?.problem?.trim());
const defaultFailureLine = failure
  ? `⚠️ ${failure.problem.trim()}${failure.fix?.trim() ? `→${failure.fix.trim()}` : ''}`
  : '';

const aiLine = xConfig?.ai?.trim() || aiHandled.trim();
const humanLine = xConfig?.human?.trim() || humanHandled.trim();
const failureLine =
  typeof xConfig?.failure === 'string'
    ? (xConfig.failure.trim() ? `⚠️ ${xConfig.failure.trim()}` : '')
    : defaultFailureLine;
const emoji = xConfig?.emoji?.trim() || '⏱️';

const post = [
  `Day ${day} / 100`,
  '',
  `「${meta.title}」を作りました${emoji}`,
  summary,
  '',
  `🤖 AI：${aiLine}`,
  `🙋 自分：${humanLine}`,
  failureLine,
  '',
  '実際に触れます。リンクはリプ欄👇',
  hashtags.join(' ')
].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n').trim();

const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
const sshGithubPrefix = ['git', 'github.com:'].join('@');
const repoUrl = remote.startsWith(sshGithubPrefix)
  ? `https://github.com/${remote.slice(sshGithubPrefix.length).replace(/\.git$/, '')}`
  : remote.replace(/\.git$/, '');

const reply = [
  `👇 ${meta.title}はこちら`,
  meta.publicUrl,
  '',
  'コードも公開しています',
  repoUrl
].join('\n');

const countPlain = (text) => Array.from(text).reduce(
  (total, char) => total + (char.codePointAt(0) <= 0x7f ? 1 : 2),
  0
);

const weightedLength = (text) => {
  const urlPattern = /https?:\/\/\S+/g;
  let total = 0;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    total += countPlain(text.slice(cursor, match.index));
    total += 23;
    cursor = match.index + match[0].length;
  }
  return total + countPlain(text.slice(cursor));
};

const postLength = weightedLength(post);
const replyLength = weightedLength(reply);
if (postLength > 280) fail(`本文がX換算${postLength}文字で上限280を超える`);
if (replyLength > 280) fail(`リプライがX換算${replyLength}文字で上限280を超える`);

console.log('公開前チェックを実行');
execFileSync(process.execPath, [join(root, 'scripts', 'precheck.mjs')], { cwd: root, stdio: 'inherit' });
console.log('ビルドを実行');
execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { cwd: root, stdio: 'inherit' });

const checkUrl = async (url, label) => {
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  } catch (error) {
    fail(`${label}へ接続できない: ${error.cause?.code || error.message}`);
  }
  if (!response.ok) fail(`${label}がHTTP ${response.status}: ${url}`);
  await response.body?.cancel();
  return { url, status: response.status };
};

const urlChecks = [
  await checkUrl(meta.publicUrl, '公開URL'),
  await checkUrl(repoUrl, 'GitHubリポジトリ')
];

const videoPath = resolve(videoOption);
if (!existsSync(videoPath)) fail(`動画が見つからない: ${videoPath}`);

let probe;
try {
  probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size:format_tags:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate',
    '-of', 'json',
    videoPath
  ], { encoding: 'utf8' }));
} catch {
  fail('ffprobeで動画を検査できない。ffmpegをインストールして動画を確認する');
}

const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');
if (!videoStream) fail('動画ストリームが見つからない');
if (videoStream.width >= videoStream.height) fail('X/Instagram兼用動画は縦型にする');
if (videoStream.width < 540 || videoStream.height < 960) fail('動画は最低540×960にする');

const duration = Number(probe.format?.duration || 0);
if (!Number.isFinite(duration) || duration <= 0 || duration > 60) fail('動作動画は1〜60秒にする');

const forbiddenMetadata = ['artist', 'author', 'comment', 'copyright', 'description', 'location', 'make', 'model', 'title'];
const metadata = probe.format?.tags || {};
const foundMetadata = forbiddenMetadata.filter((key) => metadata[key] || metadata[key.toUpperCase()]);
if (foundMetadata.length) fail(`動画に公開不要なメタデータがある: ${foundMetadata.join(', ')}`);

const outputDir = join(root, '.social-output', `day-${String(day).padStart(3, '0')}`);
mkdirSync(outputDir, { recursive: true });

const manifest = {
  day,
  appDirectory: dir,
  generatedAt: new Date().toISOString(),
  postWeightedLength: postLength,
  replyWeightedLength: replyLength,
  video: {
    path: videoPath,
    file: basename(videoPath),
    codec: videoStream.codec_name,
    width: videoStream.width,
    height: videoStream.height,
    frameRate: videoStream.r_frame_rate,
    duration,
    size: Number(probe.format?.size || 0)
  },
  urlChecks,
  readyForHumanReview: true
};

const checklist = [
  `# Day ${day} X投稿チェック`,
  '',
  '- [x] 公開前スキャン',
  '- [x] ビルド',
  '- [x] 公開URL・GitHub URL',
  '- [x] 本文・リプライ文字数',
  '- [x] 動画の縦横比・時間・メタデータ',
  '- [x] 動画の映り込み目視確認',
  '- [ ] 投稿先が100日チャレンジ用Xアカウントか確認',
  '- [ ] 本文と動画の最終プレビュー',
  '- [ ] 本文＋動画を公開',
  '- [ ] 公開URL＋GitHub URLをリプライ',
  '- [ ] 公開後にX投稿URLをmeta.jsonへ記録'
].join('\n');

writeFileSync(join(outputDir, 'post.txt'), `${post}\n`);
writeFileSync(join(outputDir, 'reply.txt'), `${reply}\n`);
writeFileSync(join(outputDir, 'checklist.md'), `${checklist}\n`);
writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nOK: X投稿準備完了 -> ${outputDir}`);
console.log(`本文 ${postLength}/280、リプライ ${replyLength}/280、動画 ${duration.toFixed(1)}秒`);
console.log('\n--- 本文 ---');
console.log(post);
console.log('\n--- リプライ ---');
console.log(reply);
console.log('\n公開ボタンは、checklist.mdの未完了項目を確認してから押すこと。');
