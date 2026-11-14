import { ReadableText } from '../ui/ReadableText';
import { useState } from 'preact/hooks';
import { currentDay, progress } from '../app/state';
import { learnedCounts, recordShareText, weekXp } from '../app/recordModel';
import { displayedStreak } from '../engine/streak';
import { ACHIEVEMENTS } from '../engine/achievements';
import { Icon } from '../ui/icons';
import { Mascot } from '../ui/Mascot';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { ShareRecord } from '../ui/ShareRecord';
import { XpChart } from '../ui/XpChart';

export function Records() {
  const [share, setShare] = useState(false);
  const state = progress.value;
  const streak = displayedStreak(state.streak, currentDay.value);
  const xp = Object.values(state.xpByDay).reduce((sum, amount) => sum + amount, 0);
  return <main class="screen collection"><div class="page-heading"><div><p class="eyebrow"><ReadableText text="小さな一歩の、積み重ね。" /></p><h1><ReadableText text="記録" /></h1></div><Mascot size={80} /></div>
    <div class="card record-streak"><Icon name="flame" size={42} /><div><span><ReadableText text="いまの連続記録" /></span><strong>{streak}<small><ReadableText text="日" /></small></strong></div><div><span><ReadableText text="最長記録" /></span><strong>{state.streak.longest}<small><ReadableText text="日" /></small></strong></div></div>
    <div class="card record-xp"><Icon name="star" size={30} /><span><ReadableText text="合計経験値" /></span><strong>{xp}</strong></div>
    <section class="card prose"><h2><ReadableText text="覚えた項目" /></h2><p class="small"><ReadableText text="1回以上正解した項目（段階1以上）です。" /></p><ul class="learned-list">{learnedCounts(state).map(course => <li key={course.id}><span>{course.title}</span><strong>{course.learned} / {course.total}<small><ReadableText text=" 項目" /></small></strong></li>)}</ul></section>
    <div class="card chart-card"><XpChart days={weekXp(state, currentDay.value)} /></div>
    <section class="card prose"><h2><ReadableText text="実績" /></h2><ul class="achievement-list">{ACHIEVEMENTS.map(item => { const date = state.achievements[item.id]; return <li key={item.id} class={date ? 'achievement--earned' : ''}><Icon name={date ? 'star' : 'lock'} size={22} /><span><strong>{item.title}</strong><small>{date ? `取得済み · ${date}` : 'まだ'}</small></span><span aria-hidden="true">{date ? '✓' : '—'}</span></li>; })}</ul></section>
    <Button onClick={() => setShare(true)}><Icon name="share" /><ReadableText text="記録をシェア" /></Button>
    <nav class="card link-list" aria-label="記録のメニュー"><a href="#/settings"><ReadableText text="設定" /><Icon name="arrow" size={20} /></a><a href="#/about"><ReadableText text="このアプリについて" /><Icon name="arrow" size={20} /></a><a href="../"><ReadableText text="100日チャレンジの一覧へ" /><Icon name="arrow" size={20} /></a></nav>
    {share && <Sheet title="記録をシェア" onClose={() => setShare(false)}><ShareRecord text={recordShareText(streak)} /><Button secondary onClick={() => setShare(false)}><ReadableText text="とじる" /></Button></Sheet>}
  </main>;
}
