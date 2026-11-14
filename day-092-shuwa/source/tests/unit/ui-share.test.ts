import { describe, expect, it } from 'vitest';
import { resultShareText, shareLinks, shareUrl } from '../../src/app/share';
describe('記録の共有', () => {
  it('学んだ内容・日数・タグを文に入れる', () => {
    expect(resultShareText('あ行・か行', 3)).toBe('てことばで手話の『あ行・か行』を覚えたよ！ 🔥3日連続 #てことば #手話 #100日チャレンジ');
  });
  it('canonicalを優先し、画面のhashを外す', () => {
    expect(shareUrl('https://example.com/day92/', 'https://preview.test/#/lesson/a/result')).toBe('https://example.com/day92/');
  });
  it('canonicalがなければ現在のアプリの住所を使う', () => {
    expect(shareUrl(null, 'https://example.com/100days/day092/?lang=ja#/lesson/a')).toBe('https://example.com/100days/day092/?lang=ja');
  });
  it('相対canonicalを現在のページから解決する', () => {
    expect(shareUrl('./', 'https://example.com/day092/index.html#/me')).toBe('https://example.com/day092/');
  });
  it('外部スキームのcanonicalは使わない', () => {
    expect(shareUrl('javascript:alert(1)', 'https://example.com/#/')).toBe('https://example.com/');
  });
  it('日本語・改行・&を二重符号化せずクエリに入れる', () => {
    const text = 'あ & い\n🔥3日';
    const appUrl = 'https://example.com/day/?a=1&b=2';
    const links = shareLinks(text, appUrl);
    const x = new URL(links.x);
    const line = new URL(links.line);
    expect(x.origin + x.pathname).toBe('https://x.com/intent/post');
    expect(x.searchParams.get('text')).toBe(text);
    expect(x.searchParams.get('url')).toBe(appUrl);
    expect(line.searchParams.get('url')).toBe(appUrl);
  });
});
