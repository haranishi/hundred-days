import test from 'node:test';
import assert from 'node:assert/strict';
import { bustCache, viewerFor } from '../lib/viewer.js';

test('viewer: 種別とHLS対応可否から表示方法を決める', () => {
  assert.equal(viewerFor({ kind: 'yt', url: 'v:abc' }, {}).mode, 'youtube');
  assert.deepEqual(viewerFor({ kind: 'img', url: 'https://example.test/a.jpg' }), { mode: 'image', src: 'https://example.test/a.jpg' });
  assert.equal(viewerFor({ kind: 'hls', url: 'https://example.test/a.m3u8' }, { canPlayHls: true }).mode, 'hls');
  assert.equal(viewerFor({ kind: 'hls', url: 'https://example.test/a.m3u8' }, { canPlayHls: false }).mode, 'link');
  assert.equal(viewerFor({ kind: 'page', url: 'https://example.test/page' }, {}).mode, 'link');
});

test('viewer: 自動再生の可否を埋め込みURLへ渡す', () => {
  assert.match(viewerFor({ kind: 'yt', url: 'v:abc' }, { autoplay: false }).src, /autoplay=0/);
  assert.match(viewerFor({ kind: 'yt', url: 'v:abc' }, {}).src, /autoplay=1/);
});

test('viewer: キャッシュ回避パラメータの区切りを選ぶ', () => {
  assert.equal(bustCache('https://example.test/a.jpg', 123), 'https://example.test/a.jpg?_=123');
  assert.equal(bustCache('https://example.test/a.jpg?size=l', 123), 'https://example.test/a.jpg?size=l&_=123');
});
