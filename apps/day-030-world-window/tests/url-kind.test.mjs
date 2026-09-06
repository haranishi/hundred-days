import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUrl, isExcluded, kindFromContentType, readExcludeHosts, upgradeToHttps } from '../tools/url-kind.mjs';

test('url-kind: URLの形からYouTube・m3u8・画像拡張子を分類する', () => {
  assert.equal(classifyUrl('https://youtu.be/a').kind, 'youtube');
  assert.equal(classifyUrl('https://example.test/live.M3U8?x=1').kind, 'm3u8');
  assert.equal(classifyUrl('http://example.test/camera.JPG').kind, 'image-ext');
  assert.equal(classifyUrl('https://example.test/view').kind, 'other');
  assert.equal(classifyUrl('not a url').kind, 'invalid');
  assert.equal(classifyUrl('ftp://example.test/a.jpg').kind, 'invalid');
});

test('url-kind: httpだけをhttpsへ置換する', () => {
  assert.equal(upgradeToHttps('http://example.test/a.jpg'), 'https://example.test/a.jpg');
  assert.equal(upgradeToHttps('https://example.test/a.jpg'), 'https://example.test/a.jpg');
});

test('url-kind: content-typeは画像とhttps映像だけをインライン扱いする', () => {
  assert.equal(kindFromContentType('image/jpeg; charset=binary', 'https://example.test/a'), 'img');
  assert.equal(kindFromContentType('application/vnd.apple.mpegurl', 'https://example.test/a'), 'hls');
  assert.equal(kindFromContentType('video/mp4', 'http://example.test/a'), 'page');
  assert.equal(kindFromContentType('text/html', 'https://example.test/a'), 'page');
});

test('url-kind: 除外ホストはコメントを無視しサブドメインにも一致する', () => {
  const hosts = readExcludeHosts('# 理由\nexample.test\n camera.example.org # 補足\n');
  assert.equal(isExcluded('https://sub.example.test/a', hosts), true);
  assert.equal(isExcluded('https://camera.example.org/a', hosts), true);
  assert.equal(isExcluded('https://notexample.test/a', hosts), false);
});
