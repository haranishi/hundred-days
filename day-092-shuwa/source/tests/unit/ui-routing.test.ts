import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from '../../src/app/router';

describe('画面の住所', () => {
  it.each([
    ['#/', 'path'], ['#/welcome', 'welcome'], ['#/review', 'review'], ['#/practice/weak', 'weak'],
    ['#/dict', 'dict'], ['#/spell', 'spell'], ['#/me', 'me'], ['#/settings', 'settings'], ['#/about', 'about'],
  ])('%sを解釈して元の住所に戻す', (hash, name) => {
    const route = parseRoute(hash);
    expect(route.name).toBe(name);
    expect(routeHash(route)).toBe(hash);
  });
  it.each(['', '#/unknown', '#/lesson/', '#/dict/a/result', '#/lesson/a/more', '#/lesson/%', '#/dict/a%2Fb', '#/dict/%00'])('%sは道すじへ', hash => {
    expect(parseRoute(hash)).toEqual({ name: 'path' });
  });
  it('レッスン・結果・項目のIDを保つ', () => {
    expect(parseRoute('#/lesson/kana-unit-1-lesson-1')).toEqual({ name: 'lesson', id: 'kana-unit-1-lesson-1' });
    expect(parseRoute('#/lesson/a/result')).toEqual({ name: 'result', id: 'a' });
    expect(parseRoute('#/dict/kana-a')).toEqual({ name: 'item', id: 'kana-a' });
    expect(routeHash({ name: 'result', id: 'a' })).toBe('#/lesson/a/result');
  });
  it('IDは一度だけURL符号化する', () => {
    const route = { name: 'item', id: 'ひらがな%あ' } as const;
    expect(parseRoute(routeHash(route))).toEqual(route);
  });
});
