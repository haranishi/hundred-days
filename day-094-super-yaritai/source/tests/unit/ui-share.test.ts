// シェアの URL と文の組み立て（src/client/ui/share.ts の純粋な部分）。
import { describe, expect, it } from 'vitest';
import { HASHTAG, SITE_URL } from '../../src/client/site';
import { copyPayload, inviteShareText, inviteUrl, lineShareUrl, resultShareText, xIntentUrl } from '../../src/client/ui/share';

describe('X の投稿画面', () => {
  it('文と URL を別々にエンコードして載せる', () => {
    const url = xIntentUrl('荒らし度12,340点！ #スーパーやりたい放題', 'https://example.com/?room=K7QM');
    expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('text')).toBe('荒らし度12,340点！ #スーパーやりたい放題');
    expect(q.get('url')).toBe('https://example.com/?room=K7QM');
    // # と & と ? はエンコードされ、URL の区切りと取り違えない
    expect(url).not.toMatch(/text=[^&]*#/);
    expect(url).toContain('%23');
    expect(url).toContain('%3Froom%3DK7QM');
  });
});

describe('LINE', () => {
  it('URL だけを渡す', () => {
    const url = lineShareUrl('https://example.com/?room=K7QM&x=1');
    expect(url).toBe('https://social-plugins.line.me/lineit/share?url=https%3A%2F%2Fexample.com%2F%3Froom%3DK7QM%26x%3D1');
  });
});

describe('招待の URL（?room=）', () => {
  it('公開先に ?room=CODE を付ける', () => {
    expect(inviteUrl('K7QM')).toBe(`${SITE_URL}?room=K7QM`);
    expect(SITE_URL).toBe('https://day94.rairakku.com/');
  });
  it('すでに問い合わせがあれば & でつなぎ、room は置き換える', () => {
    expect(inviteUrl('AB23', 'http://localhost:8798/?debug=1')).toBe('http://localhost:8798/?debug=1&room=AB23');
    expect(inviteUrl('AB23', 'http://localhost:8798/?room=ZZZZ')).toBe('http://localhost:8798/?room=AB23');
  });
  it('ハッシュは落とす', () => {
    expect(inviteUrl('AB23', 'https://example.com/play#top')).toBe('https://example.com/play?room=AB23');
  });
});

describe('シェアの文', () => {
  it('結果の文：荒らし度は3桁ごとにカンマ、称号は『』、最後にハッシュタグ', () => {
    expect(resultShareText(12340, '伝説の迷惑客')).toBe('スーパーやりたい放題で荒らし度12,340点！称号『伝説の迷惑客』 #スーパーやりたい放題');
    expect(resultShareText(0, 'ちょっと迷惑なお客さん')).toContain('荒らし度0点！');
    expect(resultShareText(1234567, 'x')).toContain('1,234,567点');
    expect(HASHTAG).toBe('スーパーやりたい放題');
  });
  it('招待の文：あいことばを入れる', () => {
    expect(inviteShareText('K7QM')).toBe('スーパーやりたい放題で勝負しよう！あいことば K7QM');
  });
  it('コピーの中身は、文の次の行に URL', () => {
    expect(copyPayload('文', 'https://example.com/')).toBe('文\nhttps://example.com/');
  });
});
