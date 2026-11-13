import { useEffect, useRef, useState } from 'preact/hooks';
import { loadSession } from '../store/session';
import { displayedStreak } from '../engine/streak';
import { COURSES } from '../course/course';
import type { Lesson } from '../course/course';
import { ReadableText } from '../ui/ReadableText';
import { getItem } from '../content';
import { dueItems } from '../engine/srs';
import { progress, currentDay, updateSettings } from '../app/state';
import { lessonStatuses } from '../app/pathModel';
import { navigate } from '../app/router';
import { Icon } from '../ui/icons';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Mascot } from '../ui/Mascot';
export function Path() {
  const state = progress.value;
  const pathRef = useRef<HTMLElement>(null);
  const saved = loadSession();
  const course = COURSES.find(course => course.id === state.settings.startCourse) ?? COURSES[0]!;
  const statuses = lessonStatuses(course, state.lessons);
  useEffect(() => {
    // 炎・目標・見出しをなるべく見せたまま、いま進める丸が下のタブにかからない最小限だけ送る。
    // 書体の読み込みが終わると文字の高さが変わって丸がずれるので、読み込み後にもう一度だけ合わせる
    // （その間に利用者が自分でスクロールしていたら合わせ直さない）
    let placed = -1;
    const align = () => {
      const node = pathRef.current?.querySelector<HTMLElement>('.lesson-node--current');
      if (!node) return;
      if (placed >= 0 && Math.abs(window.scrollY - placed) > 2) return;
      const tabs = document.querySelector<HTMLElement>('.bottom-tabs')?.offsetHeight ?? 64;
      const rect = node.getBoundingClientRect();
      const nodeBottom = window.scrollY + rect.top + rect.height;
      let top = Math.max(0, nodeBottom - (window.innerHeight - tabs - 16));
      const unit = node.closest('.path-unit');
      const nodes = unit?.querySelectorAll('.lesson-node');
      // 最初の2レッスンでは帯を読み始められる位置を優先する。
      // 丸の下端だけに合わせると、帯の上端がstickyなコース切替の下に潜る。
      if (unit === pathRef.current?.querySelector('.path-unit') && nodes && [...nodes].indexOf(node) < 2) top = 0;
      window.scrollTo({ top, behavior: 'instant' });
      placed = window.scrollY;
    };
    align();
    let active = true;
    document.fonts?.ready.then(() => { if (active) requestAnimationFrame(align); });
    return () => { active = false; };
  }, [course.id]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const due = dueItems(state, currentDay.value).filter(id => getItem(id));
  return <main ref={pathRef} class={`path screen course--${course.id}`}>
    <div class="path__heading"><div class="page-heading"><div><p class="eyebrow"><ReadableText text="ひとつずつ、手になじむ。" /></p><h1><ReadableText text="今日も、てことば" /></h1></div><Mascot size={80} /></div>
    <div class="course-tabs" role="tablist" aria-label="学ぶコース">{COURSES.map(item => <button role="tab" aria-selected={item.id === course.id} class={`course-tab course-tab--${item.id}`} onClick={() => { setSelected(null); updateSettings({ startCourse: item.id }); }}>{item.title}</button>)}</div>
    {state.streak.lastDate !== currentDay.value && <p class="streak-prompt"><ReadableText text={displayedStreak(state.streak, currentDay.value) > 0
      ? `今日1レッスンで${state.streak.current + 1}日連続` : '今日のレッスンで連続記録をはじめよう'} /></p>}
    </div>
    {saved && <a class="card review-card resume-card" href={saved.route}><span><strong>続きから（{saved.session.total - saved.session.queue.length}/{saved.session.total}）</strong><small><ReadableText text="途中のレッスンが保存されています" /></small></span><Icon name="arrow" /></a>}
    {due.length > 0 && <a class="review-card card" href="#/review"><Icon name="review" size={30} /><span><strong>復習 {due.length}問</strong><small><ReadableText text="覚えた手話を、もう一度。" /></small></span><Icon name="arrow" /></a>}
    {!course.units.length && <div class="empty card"><Mascot expression="think" size={140} /><h2><ReadableText text="教材を準備しています" /></h2><p><ReadableText text="いまは指文字コースから始められます。" /></p><Button onClick={() => updateSettings({ startCourse: 'kana' })}><ReadableText text="指文字を学ぶ" /></Button></div>}
    {course.units.map((unit, index) => {
      const done = unit.lessons.filter(lesson => statuses[lesson.id] === 'done').length;
      return <section class="path-unit" aria-label={`ユニット${index + 1} ${unit.title}`}>
        <header class="unit-card"><span class="eyebrow">ユニット{index + 1}</span><h2>{unit.id === 'kana-unit-6' ? <><ReadableText text="濁音・半濁音" /><br /><ReadableText text="小さい字・のばす音" /></> : <ReadableText text={unit.title} />}</h2><span class="small">{done} / {unit.lessons.length} レッスン完了</span><div class="unit-card__progress"><span style={{ width: `${done / unit.lessons.length * 100}%` }} /></div></header>
        <div class="path-nodes">{unit.lessons.map((lesson, position) => {
          const status = statuses[lesson.id];
          return <div class={`path-node path-node--${status}`} style={{ '--offset': `${[0, -54, 0, 54][position % 4]}px` }}>
            {status === 'current' && <span class="start-bubble"><ReadableText text="スタート" /></span>}
            <button class={`lesson-node lesson-node--${status}`} aria-label={`${lesson.title}${status === 'locked' ? '（鍵つき）' : status === 'done' ? '（完了）' : status === 'current' ? '（スタート）' : ''}`} onClick={() => setSelected(lesson)}>
              <Icon name={status === 'done' ? 'check' : status === 'locked' ? 'lock' : lesson.kind === 'review' ? 'star' : 'hand'} size={status === 'current' ? 36 : 30} />
            </button><span class="path-node__label">{lesson.kind === 'review' ? '総まとめ' : `レッスン${position + 1}`}</span>
          </div>;
        })}</div>
      </section>;
    })}
    <p class="path__footer small"><ReadableText text="小さな一歩も、ちゃんと力になる。" /></p>
    {selected && <Sheet title={selected.title} onClose={() => setSelected(null)}>
      {statuses[selected.id] === 'locked' ? <><p><Icon name="lock" /><ReadableText text=" 前のレッスンを終えると開きます" /></p><Button onClick={() => setSelected(null)}><ReadableText text="とじる" /></Button></> : <>
        <p class="eyebrow">{selected.kind === 'review' ? '覚えた手話をふりかえる' : course.id === 'word' ? '今回の新しいことば' : course.id === 'number' ? '今回の新しい数字' : '今回の新しい形'}</p>
        <p class="lesson-items"><ReadableText text={(selected.newItems.length ? selected.newItems : selected.reviewItems ?? []).map(id => getItem(id)?.label).join('・')} /></p>
        <Button onClick={() => navigate(`#/lesson/${selected.id}`)}>{statuses[selected.id] === 'done' ? 'もう一度' : 'はじめる'}</Button>
        <button class="text-button" onClick={() => setSelected(null)}><ReadableText text="とじる" /></button>
      </>}
    </Sheet>}
  </main>;
}
