import { ReadableText } from '../ui/ReadableText';
import { useState } from 'preact/hooks';
import { COURSES } from '../course/course';
import type { CourseId } from '../course/course';
import { updateSettings, flushProgress } from '../app/state';
import { navigate } from '../app/router';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Mascot } from '../ui/Mascot';
import { Icon } from '../ui/icons';
export function Welcome() {
  const [step, setStep] = useState(0);
  const start = (courseId: CourseId) => {
    updateSettings({ startCourse: courseId, onboarded: true });
    flushProgress();
    const first = COURSES.find(course => course.id === courseId)?.units[0]?.lessons[0];
    navigate(first ? `#/lesson/${first.id}` : '#/');
  };
  return <main class="welcome screen">
    <div class="welcome__progress"><span class="eyebrow"><ReadableText text="はじめの一歩" /></span><ProgressBar value={step / 3} label="初回の案内の進み具合" /><span class="small">{step + 1} / 4</span>{/* 初めて開いた人にも共有の入口を出す（100日の共通の試験が、開いた直後にこの名前のボタンを押して共有欄を確かめる） */}<button type="button" class="icon-button welcome__share" data-share-open aria-label="このアプリを共有する"><Icon name="share" /></button></div>
    <div class="welcome__content" key={step}>
      {step === 0 ? <>
        <div class="welcome__mascot"><Mascot size={224} /></div>
        <p class="eyebrow"><ReadableText text="手からはじまる、ことばの世界。" /></p>
        <h1 class="welcome__title"><ReadableText text="てことば" /></h1>
        <p class="welcome__lead"><ReadableText text="3Dの手で、" /><br /><ReadableText text="手話の指文字・数字・あいさつを1日5分" /></p>
        <Button onClick={() => { updateSettings({ dailyGoal: 10 }); setStep(1); }}><ReadableText text="はじめる " /><Icon name="arrow" /></Button>
        <p class="small"><ReadableText text="登録なし・無料。記録はこの端末だけに残ります" /></p>
      </> : step === 1 ? <>
        <Mascot expression="happy" size={130} /><p class="eyebrow"><ReadableText text="あなたに合わせて" /></p><h1><ReadableText text="どちらの手で" /><br /><ReadableText text="手話をしますか？" /></h1>
        <div class="option-stack">{(['right', 'left'] as const).map(hand => <button class="choice choice--row" onClick={() => { updateSettings({ dominant: hand }); setStep(2); }}><span class={hand === 'left' ? 'hand-icon--left' : ''}><Icon name="hand" size={32} /></span><span>{hand === 'right' ? '右手' : '左手'}</span>{hand === 'right' && <small class="badge"><ReadableText text="おすすめ" /></small>}</button>)}</div>
      </> : step === 2 ? <>
        <Mascot expression="think" size={130} /><p class="eyebrow"><ReadableText text="少しずつ、毎日" /></p><h1><ReadableText text="1日の目標は？" /></h1>
        <div class="option-stack">{([10, 20, 30, 50] as const).map(xp => <button class="choice choice--row" onClick={() => { updateSettings({ dailyGoal: xp }); setStep(3); }}><span>{xp / 10}レッスン</span><small>{xp}経験値</small>{xp === 10 && <small class="badge"><ReadableText text="おすすめ" /></small>}</button>)}</div>
      </> : <>
        <Mascot expression="cheer" size={130} /><p class="eyebrow"><ReadableText text="好きな入口から" /></p><h1><ReadableText text="どこから始めますか？" /></h1>
        <div class="option-stack">{COURSES.map(course => <button class={`choice course-option course-option--${course.id}`} onClick={() => start(course.id)}><span>{course.title} {course.id === 'kana' && <small class="badge"><ReadableText text="おすすめ" /></small>}</span><small><ReadableText text={course.id === 'kana' ? '自分の手で1文字できる体験がいちばん早い' : course.id === 'number' ? '身近な数字を手で伝えよう' : '気持ちを伝えることばから'} /></small></button>)}</div>
      </>}
    </div>
    {step > 0 && <button class="text-button" onClick={() => setStep(step - 1)}><ReadableText text="ひとつ前に戻る" /></button>}
  </main>;
}
