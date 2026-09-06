import test from 'node:test';
import assert from 'node:assert/strict';
import { embedUrl, parseYouTubeUrl } from '../lib/youtube.js';

test('youtube: 動画URLの各形式からIDを得る', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=abc_123-xy',
    'https://youtu.be/abc_123-xy',
    'https://youtube.com/live/abc_123-xy',
    'https://youtube.com/embed/abc_123-xy',
  ]) assert.deepEqual(parseYouTubeUrl(url), { type: 'video', id: 'abc_123-xy' });
});

test('youtube: チャンネルIDだけをchannelとして扱う', () => {
  assert.deepEqual(parseYouTubeUrl('https://youtube.com/channel/UCabcdefghijk'), { type: 'channel', id: 'UCabcdefghijk' });
  for (const path of ['@handle', 'c/name', 'user/name', 'channel/UCabcdefghijk/streams']) {
    assert.deepEqual(parseYouTubeUrl(`https://youtube.com/${path}`), { type: 'other', id: null });
  }
});

test('youtube: 埋め込みURLはprivacy-enhancedホストを使う', () => {
  assert.equal(embedUrl('v:abc'), 'https://www.youtube-nocookie.com/embed/abc?autoplay=1&rel=0&playsinline=1');
  assert.equal(embedUrl('c:UCabc'), 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCabc&autoplay=1');
  assert.equal(embedUrl('x:abc'), null);
});

test('youtube: 自動再生は利用者の操作の後だけにできる', () => {
  assert.equal(embedUrl('v:abc', { autoplay: false }), 'https://www.youtube-nocookie.com/embed/abc?autoplay=0&rel=0&playsinline=1');
  assert.equal(embedUrl('c:UCabc', { autoplay: false }), 'https://www.youtube-nocookie.com/embed/live_stream?channel=UCabc&autoplay=0');
});
