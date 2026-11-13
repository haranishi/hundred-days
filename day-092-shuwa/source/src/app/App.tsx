import { ReadableText } from '../ui/ReadableText';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { canNavigate, parseRoute, routeHash } from './router';
import type { Route } from './router';
import { progress, recoveryNotice, reducedMotion, storageAvailable, watchPersistence, currentDay, sessionActive } from './state';
import { claimStreakNotice } from '../store/session';
import { displayedStreak } from '../engine/streak';
import { todayXp, goalRatio } from '../engine/xp';
import { Welcome } from '../screens/Welcome';
import { Path } from '../screens/Path';
import { Lesson } from '../screens/Lesson';
import { Result } from '../screens/Result';
import { Icon } from '../ui/icons';
import type { IconName } from '../ui/icons';
import { Review } from '../screens/Review';
import { Dictionary, ItemDetail } from '../screens/Dictionary';
import { Spell } from '../screens/Spell';
import { Records } from '../screens/Records';
import { Settings } from '../screens/Settings';
import { About } from '../screens/About';
import { unlockSound } from '../ui/sound';
import '../ui/library.css';

function initialRoute(): Route { return progress.value.settings.onboarded ? parseRoute(location.hash) : { name: 'welcome' }; }
export function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  const state = progress.value;
  const [streakNotice, setStreakNotice] = useState('');
  useEffect(() => {
    if (state.streak.current > 0 && state.streak.lastDate && displayedStreak(state.streak, currentDay.value) === 0) {
      if (claimStreakNotice(state.streak.lastDate)) setStreakNotice(`連続は0日に戻りました。最長は${state.streak.longest}日です`);
    } else setStreakNotice('');
  }, [state.streak.lastDate, currentDay.value]);
  useEffect(watchPersistence, []);
  // 見張りは描画と同じ流れの中で付ける（useEffect だと、最初の描画から付けるまでの間に URL が変わった時に
  // hashchange を取りこぼし、URL は #/about なのに画面は案内のまま、というずれが起きた）。付ける時点の URL に画面も合わせ直す
  useLayoutEffect(() => {
    const initial = initialRoute();
    let activeHash = routeHash(initial);
    history.replaceState(null, '', activeHash);
    setRoute(current => routeHash(current) === activeHash ? current : initial);
    const change = () => {
      const parsed = progress.value.settings.onboarded ? parseRoute(location.hash) : { name: 'welcome' } as const;
      const hash = routeHash(parsed);
      if (!canNavigate(hash)) { history.replaceState(null, '', activeHash); return; }
      activeHash = hash;
      if (location.hash !== hash) history.replaceState(null, '', hash);
      setRoute(parsed); window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (route.name === 'lesson' || route.name === 'welcome') return;
    const heading = document.querySelector<HTMLElement>('main h1');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }, [route]);
  const shell = route.name !== 'lesson' && route.name !== 'welcome' && !sessionActive.value;
  const xp = todayXp(state, currentDay.value);
  const ratio = goalRatio(xp, state.settings.dailyGoal);
  const tabs: { label: string; hash: string; icon: IconName; active: boolean }[] = [
    { label: '学ぶ', hash: '#/', icon: 'path', active: route.name === 'path' || route.name === 'result' },
    { label: '復習', hash: '#/review', icon: 'review', active: route.name === 'review' || route.name === 'weak' },
    { label: '図鑑', hash: '#/dict', icon: 'book', active: ['dict', 'item', 'spell'].includes(route.name) },
    { label: '記録', hash: '#/me', icon: 'record', active: ['me', 'settings', 'about'].includes(route.name) },
  ];
  return <div class={`app ${reducedMotion.value ? 'reduce-motion' : ''} ${shell ? 'app--shell' : ''}`} onPointerDown={() => unlockSound(progress.value.settings)} onKeyDown={() => unlockSound(progress.value.settings)}>
    <div class="notices">{streakNotice && <div class="recovery-notice" role="status"><span><ReadableText text={streakNotice} /></span><button class="icon-button" aria-label="連続記録のお知らせを閉じる" onClick={() => setStreakNotice('')}><Icon name="close" size={18} /></button></div>}{!storageAvailable.value && <div class="storage-warning" role="status"><ReadableText text="この端末では記録が残りません（プライベートブラウズなど）" /></div>}
      {recoveryNotice.value && <div class="recovery-notice" role="status"><span><ReadableText text="読み取れない記録を退避して、新しく始めました。" /></span><button class="icon-button" aria-label="記録の退避のお知らせを閉じる" onClick={() => { recoveryNotice.value = false; }}><Icon name="close" size={18} /></button></div>}
    </div>
    {shell && <header class="topbar"><span class={`topbar__streak ${state.streak.lastDate !== currentDay.value ? 'topbar__streak--pending' : ''}`} aria-label={`${displayedStreak(state.streak, currentDay.value)}日連続`}><Icon name="flame" size={28} /><strong>{displayedStreak(state.streak, currentDay.value)}</strong><small><ReadableText text="日" /></small></span><span class="topbar__goal" aria-label={`今日の目標、経験値 ${xp}、目標 ${state.settings.dailyGoal}`}><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="#E3E5F0" stroke-width="4" /><circle cx="16" cy="16" r="12" fill="none" stroke="#4C5FD5" stroke-width="4" pathLength="100" stroke-dasharray={`${ratio * 100} 100`} transform="rotate(-90 16 16)" /></svg><span class="topbar__goal-label"><ReadableText text="今日の目標" /></span><strong>{xp}/{state.settings.dailyGoal}</strong></span><button type="button" class="icon-button topbar__share" data-share-open aria-label="このアプリを共有する"><Icon name="share" /></button></header>}
    {route.name === 'welcome' ? <Welcome /> : route.name === 'path' ? <Path /> : route.name === 'lesson' ? <Lesson key={route.id} id={route.id} /> : route.name === 'result' ? <Result key={route.id} id={route.id} />
      : route.name === 'review' || route.name === 'weak' ? <Review key={route.name} weak={route.name === 'weak'} />
      : route.name === 'dict' ? <Dictionary /> : route.name === 'item' ? <ItemDetail key={route.id} id={route.id} />
      : route.name === 'spell' ? <Spell /> : route.name === 'me' ? <Records /> : route.name === 'settings' ? <Settings /> : <About />}
    {shell && <nav class="bottom-tabs" aria-label="主な画面">{tabs.map(tab => <a href={tab.hash} aria-current={tab.active ? 'page' : undefined}><Icon name={tab.icon} size={26} /><span>{tab.label}</span></a>)}</nav>}
  </div>;
}
