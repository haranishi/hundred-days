import { ReadableText } from '../ui/ReadableText';
import { loadSession } from '../store/session';
import { useState } from 'preact/hooks';
import { getItem } from '../content';
import { progress, currentDay } from '../app/state';
import { reviewExercises, reviewQueue } from '../app/reviewModel';
import type { Exercise } from '../engine/lesson';
import { LessonSession } from './Lesson';
import { Mascot } from '../ui/Mascot';
import { Button } from '../ui/Button';
import { Icon } from '../ui/icons';

export function Review({ weak = false }: { weak?: boolean }) {
  const due = reviewQueue(progress.value, currentDay.value);
  const difficult = reviewQueue(progress.value, currentDay.value, true);
  const [exercises, setExercises] = useState<Exercise[] | null>(() => { const saved = loadSession(); return saved?.lessonId === (weak ? 'practice-weak' : 'review-due') ? saved.exercises : weak && difficult.ids.length ? reviewExercises(difficult.ids, progress.value) : null; });
  if (exercises) return <LessonSession review exercises={exercises} lesson={{ id: weak ? 'practice-weak' : 'review-due', title: weak ? '苦手を練習' : '復習', kind: 'review', newItems: [] }} />;
  if (weak) return <main class="screen empty"><Mascot expression="think" /><h1>{weak ? '苦手を練習' : '復習'}</h1><p><ReadableText text="いまは復習はありません。新しいレッスンへ進みましょう" /></p><a class="button" href="#/"><ReadableText text="道すじへ" /></a></main>;
  const nextDue = Object.entries(progress.value.items).filter(([id, item]) => getItem(id) && getItem(id)?.confidence !== 'low' && item.due > currentDay.value).map(([, item]) => item.due).sort()[0];
  return <main class="screen collection"><div class="page-heading"><div><p class="eyebrow"><ReadableText text="覚えた手話を、もう一度。" /></p><h1><ReadableText text="復習" /></h1></div><Mascot size={80} /></div>
    {due.count ? <section class="card review-summary"><Icon name="review" size={40} /><h2><ReadableText text="今日の復習 " /><strong>{due.count}</strong><ReadableText text="項目" /></h2><p><ReadableText text="期日の来た項目から、1回に最大12問。自分のペースで確かめましょう。" /></p><Button onClick={() => setExercises(reviewExercises(due.ids, progress.value))}><ReadableText text="復習をはじめる" /></Button></section> : <p class="review-empty">今日の復習はありません{nextDue ? `（次回 ${Number(nextDue.slice(5, 7))}月${Number(nextDue.slice(8))}日）` : ''}</p>}
    <section class="card review-summary"><h2><ReadableText text="苦手を練習" /></h2><p><ReadableText text={`まちがいのある項目は${difficult.count}個。`} /><br /><ReadableText text="まちがいの多い順に、最大12問を練習できます。" /></p>{difficult.count ? <a class={due.count ? 'button button--secondary' : 'button'} href="#/practice/weak"><ReadableText text="苦手を練習" /></a> : <p class="small"><ReadableText text="いまは苦手の項目はありません。" /></p>}</section>
    {!due.count && !difficult.count && <a class="button" href="#/"><ReadableText text="道すじへ" /></a>}
  </main>;
}
