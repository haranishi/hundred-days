import { getItem } from '../content';
import type { SignItem } from '../content/types';

export type CourseId = 'kana' | 'number' | 'word';
export interface Lesson {
  id: string;
  title: string;
  kind: 'learn' | 'review';
  newItems: string[];
  reviewItems?: string[];
}
export interface Unit { id: string; title: string; lessons: Lesson[] }
export interface Course { id: CourseId; title: string; units: Unit[] }
export type ItemLookup = (id: string) => SignItem | undefined;

export const KANA_ROWS = [
  'a i u e o', 'ka ki ku ke ko', 'sa shi su se so', 'ta chi tsu te to',
  'na ni nu ne no', 'ha hi fu he ho', 'ma mi mu me mo', 'ya yu yo',
  'ra ri ru re ro', 'wa wo n',
].map(row => row.split(' ').map(id => `kana-${id}`));
export const KANA_IDS = KANA_ROWS.flat();
const modifiers = ['dakuon', 'handakuon', 'sokuon', 'youon', 'chouon'].map(id => `mod-${id}`);
const words = [
  ['ohayou', 'konnichiwa', 'konbanwa'], ['arigatou', 'yoroshiku', 'gomennasai'],
  ['sayounara', 'otsukaresama', 'hajimemashite'], ['namae', 'shuwa', 'wakaru', 'wakaranai'],
  ['suki', 'kirai', 'daijoubu'],
].map(group => group.map(id => `word-${id}`));
const numbers = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [0, 100, 1000]]
  .map(group => group.map(id => `num-${id}`));
export const ALL_ITEM_IDS = [...KANA_IDS, ...modifiers, ...numbers.flat(), ...words.flat()];

function unit(course: CourseId, index: number, title: string, groups: string[][], reviewOnly = false): Unit {
  const id = `${course}-unit-${index}`;
  const lessons: Lesson[] = [];
  if (!reviewOnly) for (const group of groups) {
    for (let start = 0; start < group.length; start += 3) {
      lessons.push({ id: `${id}-lesson-${lessons.length + 1}`, title: `${title} ${lessons.length + 1}`,
        kind: 'learn', newItems: group.slice(start, start + 3) });
    }
  }
  lessons.push({ id: `${id}-review`, title: `${title}のまとめ`, kind: 'review', newItems: [], reviewItems: groups.flat() });
  return { id, title, lessons };
}

function definitions(): Course[] {
  const kanaTitles = ['あ行・か行', 'さ行・た行', 'な行・は行', 'ま行・や行', 'ら行・わ行・ん'];
  return [
    { id: 'kana', title: '指文字', units: [
      ...kanaTitles.map((title, i) => unit('kana', i + 1, title, KANA_ROWS.slice(i * 2, i * 2 + 2))),
      unit('kana', 6, '濁音・半濁音・小さい字・のばす音', [modifiers]),
      unit('kana', 7, '自分の名前を指文字で', [KANA_IDS], true),
    ] },
    { id: 'number', title: '数字', units: numbers.map((ids, i) => unit('number', i + 1,
      ['1〜5', '6〜10', '0・100・1000'][i]!, [ids])) },
    { id: 'word', title: 'あいさつ', units: words.map((ids, i) => unit('word', i + 1, [
      'おはよう・こんにちは・こんばんは', 'ありがとう・よろしくお願いします・ごめんなさい',
      'さようなら・お疲れさま・はじめまして', '名前・手話・わかる・わからない', '好き・嫌い・大丈夫',
    ][i]!, [ids])) },
  ];
}

/** contentの追加後も同じ定義から組み立てられる。空のユニットも非表示にする。 */
export function createCourses(items: ItemLookup = getItem): Course[] {
  const usable = (id: string) => { const item = items(id); return !!item && item.confidence !== 'low'; };
  return definitions().map(course => ({ ...course, units: course.units.map(group => ({ ...group,
    lessons: group.lessons.map(lesson => ({ ...lesson, newItems: lesson.newItems.filter(usable),
      reviewItems: lesson.reviewItems?.filter(usable) }))
      .filter(lesson => lesson.newItems.length + (lesson.reviewItems?.length ?? 0) > 0),
  })).filter(group => group.lessons.length > 0) }));
}
export const COURSES = createCourses();

/** 新出に属するユニットを使い、名前の総復習とは混ぜない。 */
export function unitItemIds(itemId: string): string[] {
  for (const course of definitions()) for (const group of course.units) {
    if (group.lessons.some(lesson => lesson.newItems.includes(itemId))) {
      return group.lessons.flatMap(lesson => lesson.newItems);
    }
  }
  return [];
}
