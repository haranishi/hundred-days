import { ReadableText } from '../ui/ReadableText';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { getItem, VOCAB } from '../content';
import { COURSES } from '../course/course';
import type { Lesson as LessonDefinition } from '../course/course';
import { renderThumbnail } from '../hand';
import { buildLesson } from '../engine/lesson';
import type { Exercise } from '../engine/lesson';
import { mulberry32 } from '../engine/rng';
import { createSession, answer, next, summary } from '../engine/session';
import type { SessionState } from '../engine/session';
import { findLesson, lessonStatuses } from '../app/pathModel';
import { answerCorrect, answerReady, completeLesson, recordExercise, recordIntroduction } from '../app/lessonProgress';
import type { ExerciseAnswer } from '../app/lessonProgress';
import { flushProgress, lastResult, localToday, progress, sessionActive, updateProgress } from '../app/state';
import { navigate, setRouteGuard } from '../app/router';
import { Button } from '../ui/Button';
import { Icon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { ProgressBar } from '../ui/ProgressBar';
import { playCue } from '../ui/sound';
import { clearSession, loadSession, saveSession } from '../store/session';
import type { SavedSession } from '../store/session';
import { WordNoticeContext } from './exercises/Sign';
import { MistakeDetail } from './exercises/MistakeDetail';
import { ExerciseView } from './exercises/ExerciseView';

export function Lesson({ id }: { id: string }) {
  const lesson = findLesson(id);
  const course = COURSES.find(course => course.units.some(unit => unit.lessons.some(lesson => lesson.id === id)));
  if (!lesson || !course || lessonStatuses(course, progress.value.lessons)[id] === 'locked') return <main class="screen empty"><h1><ReadableText text="このレッスンはまだ開けません" /></h1><p><ReadableText text="道すじから、いま進めるレッスンを選んでください。" /></p><Button onClick={() => navigate('#/')}><ReadableText text="道すじへ" /></Button></main>;
  return <LessonSession key={id} lesson={lesson} />;
}

/** 復習画面からも同じ進行・結果表示を利用できる。 */
type SessionProps = { lesson: LessonDefinition; review?: boolean; exercises?: Exercise[] };
export function LessonSession(props: SessionProps) {
  const [saved, setSaved] = useState(() => {
    const value = loadSession();
    return value?.lessonId === props.lesson.id ? value : null;
  });
  const [resume, setResume] = useState<SavedSession | null>(null);
  if (saved) return <main class="screen empty"><h1><ReadableText text="レッスンの続きがあります" /></h1><p><ReadableText text={props.lesson.title} /></p>
    <Button onClick={() => { setResume(saved); setSaved(null); }}>続きから（{saved.session.total - saved.session.queue.length}/{saved.session.total}）</Button>
    <Button secondary onClick={() => { clearSession(); setSaved(null); }}><ReadableText text="はじめから" /></Button>
    <Button secondary onClick={() => navigate('#/')}><ReadableText text="道すじへ" /></Button></main>;
  return <ActiveLessonSession {...props} resumed={resume} />;
}
function ActiveLessonSession({ lesson, review = false, exercises, resumed }: SessionProps & { resumed: SavedSession | null }) {
  const [session, setSession] = useState(() => resumed?.session ?? createSession(exercises ?? buildLesson(lesson, progress.value, {
    rng: mulberry32(Date.now()), cameraEnabled: progress.value.settings.camera, items: getItem, vocab: VOCAB,
  })));
  const initialExercises = useRef(resumed?.exercises ?? [session.current!, ...session.queue]);
  const [value, setValue] = useState<ExerciseAnswer>(resumed?.value ?? null);
  const latestSession = useRef(session);
  const [quitTarget, setQuitTargetState] = useState<string | null>(null);
  const latestQuitTarget = useRef(quitTarget);
  const setQuitTarget = (target: string | null) => {
    // Update with the event, before rendering or passive effects can run.
    latestQuitTarget.current = target;
    setQuitTargetState(target);
  };
  const started = useRef(resumed?.started ?? Date.now());
  const [wordNoticeShown, setWordNoticeShown] = useState(resumed?.wordNoticeShown ?? false);
  const [continueReady, setContinueReady] = useState(false);
  const blockedUntil = useRef(Infinity);
  const completed = useRef(false);
  const cameraSuccess = useRef(resumed?.cameraSuccess ?? false);
  const [matchedWithCamera, setMatchedWithCamera] = useState(resumed?.matchedWithCamera ?? false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const exercise = session.current;
  const correct = session.answered && session.records.at(-1)?.correct === true;
  const currentHash = useRef(location.hash);
  useEffect(() => {
    sessionActive.value = true;
    setRouteGuard(target => {
      if (completed.current || target === currentHash.current) return true;
      setQuitTarget(target); return false;
    });
    return () => { sessionActive.value = false; setRouteGuard(null); flushProgress(); };
  }, []);
  useEffect(() => {
    if (exercise?.kind === 'intro') updateProgress(state => recordIntroduction(state, exercise.itemId, localToday()));
    contentRef.current?.scrollTo(0, 0);
    contentRef.current?.focus();
  }, [exercise]);
  useLayoutEffect(() => {
    setContinueReady(false);
    if (!session.answered) return;
    blockedUntil.current = performance.now() + 400;
    const timer = setTimeout(() => setContinueReady(true), 400);
    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => {
    if (!session.answered) return;
    const following = session.queue[0] ?? (!correct ? exercise : null);
    if (!following) return;
    const ids = following.kind === 'pairs' ? following.itemIds
      : following.kind === 'labelToSign' || following.kind === 'spellWord' ? following.options : [];
    const size = following.kind === 'pairs' ? 75 : following.kind === 'spellWord' ? 88 : 140;
    for (const id of ids) {
      const item = getItem(id);
      if (item) void renderThumbnail(item.sign, { dominant: progress.value.settings.dominant, size: size * 2 }).catch(() => {});
    }
  }, [session]);
  useLayoutEffect(() => { if (continueReady) continueRef.current?.focus(); }, [continueReady]);
  useLayoutEffect(() => {
    if (completed.current || !session.current) return;
    saveSession({ version: 1, lessonId: lesson.id, route: currentHash.current, session, value, exercises: initialExercises.current, matchedWithCamera,
      started: started.current, cameraSuccess: cameraSuccess.current, wordNoticeShown });
    flushProgress();
  }, [session, value, wordNoticeShown]);
  useEffect(() => {
    if (exercise?.kind === 'pairs' && !session.answered && answerReady(exercise, value)) submit();
  }, [exercise, value, session.answered]);
  const finish = (state: SessionState) => {
    if (completed.current) return;
    completed.current = true;
    clearSession();
    const result = summary(state);
    const today = localToday();
    const awarded = completeLesson(progress.value, lesson.id, result.firstTryPerfect, today, review, cameraSuccess.current);
    updateProgress(() => awarded.progress); flushProgress();
    lastResult.value = { lessonId: lesson.id, title: lesson.title, xp: awarded.xp, accuracy: result.accuracy,
      seconds: Math.max(1, Math.round((Date.now() - started.current) / 1000)), streak: awarded.progress.streak.current,
      streakExtended: awarded.streakExtended, achievements: awarded.achievements,
      repeatHash: review ? currentHash.current : undefined };
    playCue('complete', progress.value.settings);
    navigate(`#/lesson/${lesson.id}/result`);
  };
  const advance = (state: SessionState) => {
    if (latestSession.current !== state || !state.answered) return;
    const following = next(state);
    latestSession.current = following;
    setValue(null); setSession(following);
    if (!following.current) finish(following);
  };
  const submit = (camera = false) => {
    if (latestSession.current !== session || !exercise || session.answered || !answerReady(exercise, value)) return;
    const isCorrect = answerCorrect(exercise, value);
    setMatchedWithCamera(camera);
    if (camera) cameraSuccess.current = true;
    blockedUntil.current = performance.now() + 400;
    updateProgress(state => recordExercise(state, exercise, isCorrect, localToday()));
    const answered = answer(session, exercise.id, isCorrect);
    latestSession.current = answered;
    if (exercise.kind === 'intro') advance(answered);
    else { setSession(answered); playCue(isCorrect ? 'correct' : 'wrong', progress.value.settings); }
  };
  const skip = () => {
    if (latestSession.current !== session || !exercise || exercise.kind !== 'tryIt' || session.answered) return;
    // 「あとで」は正誤・復習・経験値の判定に回答を足さない。
    const following = { ...session, current: session.queue[0] ?? null, queue: session.queue.slice(1), total: session.total - 1 };
    latestSession.current = following;
    setValue(null); setSession(following);
    if (!following.current) finish(following);
  };
  // 画面を描く前に付ける（useEffect だと、描いた直後に押した Esc・数字キーを取りこぼす）
  useLayoutEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || latestQuitTarget.current || document.querySelector('.feedback dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); setQuitTarget('#/'); }
      else if (['1', '2', '3', '4'].includes(event.key) && !latestSession.current.answered) {
        event.preventDefault(); contentRef.current?.querySelector<HTMLButtonElement>(`[data-shortcut="${event.key}"]:not(:disabled)`)?.click();
      } else if (event.key === 'Enter' && (event.target === contentRef.current || event.target === document.body
        || (event.target instanceof Element && event.target.closest('.choices .choice[aria-pressed="true"]')))) {
        event.preventDefault(); (latestSession.current.answered ? continueRef.current : primaryRef.current)?.click();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  if (!exercise) return <main class="screen empty"><h1><ReadableText text="出題できる項目がありません" /></h1><Button onClick={() => { completed.current = true; navigate('#/'); }}><ReadableText text="道すじへ" /></Button></main>;
  const completedCount = Math.max(0, session.total - session.queue.length - 1);
  const repeated = session.records.slice(0, session.answered ? -1 : undefined).some(record => record.exerciseId === exercise.id);
  const praises = ['その調子。一歩ずつ、身についているよ！', 'よく見分けられたね！', 'ひとつ、手になじんだね！'];
  const praise = praises[(session.records.filter(record => record.correct).length - 1 + praises.length) % praises.length];
  return <main class="lesson">
    <header class="lesson__header"><button class="icon-button" aria-label="レッスンをやめる" onClick={() => setQuitTarget('#/')}><Icon name="close" /></button><ProgressBar value={completedCount / session.total} label="レッスンの進み具合" /><span class="small">{Math.min(completedCount + 1, session.total)} / {session.total}</span></header>
    <div class={`lesson__content lesson__content--${exercise.kind}`} ref={contentRef} tabIndex={-1}>
      <div class="lesson__retry">{repeated && <span class="badge retry-badge"><ReadableText text="もう一度" /></span>}</div>
      <WordNoticeContext.Provider value={{ shown: wordNoticeShown, markShown: () => setWordNoticeShown(true) }}>
      <ExerciseView key={`${exercise.id}-${session.records.length - Number(session.answered)}`} exercise={exercise} value={value} onChange={setValue} answered={session.answered} onSuccess={submit} onSkip={skip} />
      </WordNoticeContext.Provider>
    </div>
    <footer class={`lesson__footer ${session.answered ? correct ? 'feedback feedback--correct' : 'feedback feedback--wrong' : ''}`}>
      <div class="lesson__footer-inner">
        <div class="feedback__announcement" role="status" aria-live="polite" aria-atomic="true">{session.answered && <>
          <div class="feedback__title"><span class="feedback__symbol">{correct ? '✓' : '✗'}</span><div><h2>{correct ? exercise.kind === 'tryIt' ? matchedWithCamera ? '形が合いました！' : 'できたね！' : '正解！' : 'おしい！'}</h2><p><ReadableText text={correct ? exercise.kind === 'tryIt' ? '自分の手で、ひとつ練習できたね！' : exercise.kind === 'pairs' ? '手と文字のペアを、全部そろえられたね！' : praise ?? '' : '手と答えを見比べてみよう'} /></p></div></div>
          {!correct && <p class="feedback__retry"><ReadableText text="まちがえた問題を最後にもう一度出します" /></p>}
          {!correct && <MistakeDetail exercise={exercise} value={value} />}
        </>}</div>
        {session.answered ? <button ref={continueRef} class="button" disabled={!continueReady} onClick={() => { if (performance.now() >= blockedUntil.current) advance(session); }}><ReadableText text="つづける" /></button>
          : <>{exercise.kind !== 'pairs' && <button ref={primaryRef} class="button" disabled={!answerReady(exercise, value)} onClick={() => submit()}>{exercise.kind === 'intro' ? 'おぼえた' : exercise.kind === 'tryIt' ? 'できた' : 'チェック'}</button>}
            {exercise.kind === 'pairs' && <p class="small"><ReadableText text="すべてそろうと、自動で答え合わせします" /></p>}
            {exercise.kind === 'tryIt' && <button class="text-button" onClick={skip}><ReadableText text="あとで" /></button>}</>}
      </div>
    </footer>
    {quitTarget && <Sheet title="レッスンをやめますか？" onClose={() => setQuitTarget(null)}><p><ReadableText text="ここまでに紹介した項目の記録は残ります" /></p><div class="option-stack"><Button onClick={() => setQuitTarget(null)}><ReadableText text="つづける" /></Button><Button secondary onClick={() => { completed.current = true; clearSession(); flushProgress(); setRouteGuard(null); navigate(quitTarget); }}><ReadableText text="やめる" /></Button></div></Sheet>}
  </main>;
}
