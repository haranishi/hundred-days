import { ReadableText } from '../ui/ReadableText';
import { useEffect, useState } from 'preact/hooks';
import { lastResult, currentDay, progress, reducedMotion } from '../app/state';
import { lessonUnitTitle } from '../app/pathModel';
import { resultShareText } from '../app/share';
import { navigate } from '../app/router';
import { todayXp, goalRatio } from '../engine/xp';
import { Mascot } from '../ui/Mascot';
import { Icon } from '../ui/icons';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { ShareRecord } from '../ui/ShareRecord';
import { Sheet } from '../ui/Sheet';
export function Result({ id }: { id: string }) {
  const result = lastResult.value?.lessonId === id ? lastResult.value : null;
  const [xp, setXp] = useState(reducedMotion.value ? result?.xp ?? 0 : 0);
  const [share, setShare] = useState(false);
  useEffect(() => {
    if (!result || reducedMotion.value) { setXp(result?.xp ?? 0); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const ratio = Math.min(1, (time - start) / 650);
      setXp(Math.round(result.xp * ratio));
      if (ratio < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [result, reducedMotion.value]);
  if (!result) return <main class="screen empty"><Mascot /><h1><ReadableText text="記録は道すじで確認できます" /></h1><p><ReadableText text="結果の詳しい表示はレッスンを終えた直後に見られます。" /></p><Button onClick={() => navigate('#/')}><ReadableText text="道すじへ" /></Button></main>;
  const state = progress.value;
  const today = todayXp(state, currentDay.value);
  return <main class="screen result">
    <Mascot expression="cheer" size={200} /><p class="eyebrow"><ReadableText text="今日の一歩、できました。" /></p><h1>{result.repeatHash ? '復習完了！' : 'レッスン完了！'}</h1><p class="small"><ReadableText text={result.title} /></p>
    <div class="result-stats"><div class="card stat"><Icon name="star" /><strong aria-label={`${result.xp}経験値を獲得`}><span aria-hidden="true">+{xp}</span></strong><span><ReadableText text="経験値" /></span></div><div class="card stat"><strong>{Math.round(result.accuracy * 100)}<small>%</small></strong><span><ReadableText text="正答率" /></span></div><div class="card stat"><strong>{Math.floor(result.seconds / 60)}:{String(result.seconds % 60).padStart(2, '0')}</strong><span><ReadableText text="かかった時間" /></span></div></div>
    <div class={`card streak-card ${result.streakExtended ? 'streak-card--extended' : ''}`}><Icon name="flame" size={54} /><div><strong>{result.streak}日連続</strong><p>{result.streakExtended ? result.streak === 1 ? <><ReadableText text="はじめの一歩。" /><br /><ReadableText text="連続記録がはじまりました！" /></> : <ReadableText text="今日も学べたね。記録が延びました！" /> : <ReadableText text="今日の学びを、もうひとつ。" />}</p></div></div>
    <div class="card goal-card"><div><strong><ReadableText text="今日の目標" /></strong><span>{today} / {state.settings.dailyGoal} 経験値</span></div><ProgressBar value={goalRatio(today, state.settings.dailyGoal)} label="今日の目標の達成度" />{today >= state.settings.dailyGoal && <p><ReadableText text="✓ 目標達成！ 自分のペースで続けよう。" /></p>}</div>
    {result.achievements.length > 0 && <div class="card achievements"><h2><ReadableText text="新しい実績" /></h2>{result.achievements.map(item => <p><Icon name="star" /> {item.title}</p>)}</div>}
    <div class="result__continue"><Button onClick={() => navigate(result.repeatHash ? '#/review' : '#/')}><ReadableText text="つづける" /></Button></div><div class="option-stack"><Button secondary onClick={() => navigate(result.repeatHash ?? `#/lesson/${id}`)}><ReadableText text="もう一度" /></Button><button class="text-button" onClick={() => setShare(true)}><Icon name="share" /><ReadableText text=" 記録をシェア" /></button></div>
    {share && <Sheet title="記録をシェア" onClose={() => setShare(false)}><ShareRecord text={resultShareText(result.repeatHash ? result.title : lessonUnitTitle(id), result.streak)} /><Button secondary onClick={() => setShare(false)}><ReadableText text="とじる" /></Button></Sheet>}
  </main>;
}
