import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildLinkReply } from '../lib/x-reply.mjs';

const codeUrl = 'https://github.com/example/hundred-days';
const meta = { title: '見て、走る？', publicUrl: 'https://app.example/' };
const appReply = '👇 「見て、走る？」はこちら\nhttps://app.example/';
const legacyReply = (meta, codeUrl) => [
  `👇 「${meta.title}」はこちら`, meta.publicUrl, '', 'コードも公開しています', codeUrl
].join('\n');

test('通常のDayは、改行や題名の鉤括弧も含めて従来どおり', () => {
  assert.equal(buildLinkReply({ meta, codeUrl, external: false }), `${appReply}\n\nコードも公開しています\n${codeUrl}`);
});

test('コードのURLがある外部Dayは、従来どおりコードを案内する', () => {
  const externalCode = 'https://github.com/example/app';
  const externalMeta = { ...meta, intro: { codeUrl: externalCode } };
  assert.equal(buildLinkReply({ meta: externalMeta, codeUrl: externalCode, external: true }), legacyReply(externalMeta, externalCode));
});

test('コード非公開なら、コードのURLがあっても案内文だけを添える', () => {
  const unpublished = {
    ...meta,
    intro: { codeUrl },
    social: { x: { codePublished: false, linkReplyNote: '  規約に同意してから使えます。\n作者表示は案内ページにあります。  ' } }
  };
  assert.equal(buildLinkReply({ meta: unpublished, codeUrl, external: true }), `${appReply}\n\n規約に同意してから使えます。\n作者表示は案内ページにあります。`);
});

test('コード非公開で案内文がなければ、題名と公開URLだけを出す', () => {
  const unpublished = { ...meta, social: { x: { codePublished: false } } };
  assert.equal(buildLinkReply({ meta: unpublished, codeUrl, external: true }), appReply);
});

test('通常のDayでも、明示したコード非公開を優先する', () => {
  const unpublished = { ...meta, social: { x: { codePublished: false } } };
  assert.equal(buildLinkReply({ meta: unpublished, codeUrl, external: false }), appReply);
});

test('コードのURLがない外部Dayは、このリポジトリのコードを案内しない', () => {
  for (const intro of [undefined, {}, { codeUrl: '' }]) {
    const externalMeta = { ...meta, intro, social: { x: { linkReplyNote: '使う前に規約を確認してください。' } } };
    assert.equal(buildLinkReply({ meta: externalMeta, codeUrl, external: true }), `${appReply}\n\n使う前に規約を確認してください。`);
  }
});

test('空白だけの案内文では、余分な改行を足さない', () => {
  const unpublished = { ...meta, social: { x: { codePublished: false, linkReplyNote: ' \n ' } } };
  assert.equal(buildLinkReply({ meta: unpublished, codeUrl, external: true }), appReply);
});

test('コードを公開するDayには、案内文の設定があっても従来の出力を返す', () => {
  const published = { ...meta, social: { x: { codePublished: true, linkReplyNote: '補足' } } };
  assert.equal(buildLinkReply({ meta: published, codeUrl, external: false }), legacyReply(published, codeUrl));
});

for (const dir of ['day-079-futsu-run', 'day-080-fifth-prince', 'day-081-pagecrate']) {
  test(`${dir}の実際のmeta.jsonから、従来と完全に同じリプライを作る`, () => {
    const meta = JSON.parse(readFileSync(new URL(`../../${dir}/meta.json`, import.meta.url), 'utf8'));
    const external = meta.status === 'external' && typeof meta.externalUrl === 'string' && meta.externalUrl.startsWith('https://');
    const selectedCodeUrl = external && meta.intro?.codeUrl ? meta.intro.codeUrl : codeUrl;
    assert.equal(buildLinkReply({ meta, codeUrl: selectedCodeUrl, external }), legacyReply(meta, selectedCodeUrl));
  });
}

test('呼ぶ側の既存検査は、案内文を含めて280ちょうどを通し、281で止める', () => {
  // CLI全体を動かさず、実際の返信生成と長さ検査を実行する。通信・動画・ビルドは不要。
  const source = readFileSync(new URL('../prepare-x-post.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const reply = buildLinkReply(');
  const end = source.indexOf("\nconsole.log('公開前チェックを実行');", start);
  assert.ok(start >= 0 && end > start, '呼ぶ側の長さ検査を特定できる');
  const check = (note) => runInNewContext(`${source.slice(start, end)}\nreplyLength`, {
    meta: { ...meta, social: { x: { codePublished: false, linkReplyNote: note } } },
    codeUrl,
    external: true,
    buildLinkReply,
    post: '本文',
    extraReplies: [],
    fail: (message) => { throw new Error(message); }
  });
  const note = 'a'.repeat(280 - check('') - 2);
  assert.equal(check(note), 280);
  assert.throws(() => check(`${note}a`), /リプライがX換算281文字で上限280を超える/);
});
