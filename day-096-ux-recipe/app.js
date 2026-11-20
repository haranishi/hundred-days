import { DEVICES, GOALS, GOAL_LABEL, HASH_VIEW, sanitizeState } from './lib/contract.js';
import { createState, reduce, createHistory, commit, present, undo, redo, canUndo, canRedo } from './lib/state.js';
import { diagnose } from './lib/rules.js';
import * as storage from './lib/persist.js';
import { decodeState, viewUrl } from './lib/codec.js';
import { renderPage } from './lib/render.js';
import { mountGoal } from './lib/ui-goal.js';
import { mountOutline } from './lib/ui-outline.js';
import { mountPreview, installPageStyle } from './lib/ui-preview.js';
import { mountPalette } from './lib/ui-palette.js';
import { mountTopbar } from './lib/ui-topbar.js';
import { mountToast } from './lib/ui-toast.js';
import { mountKeys } from './lib/keys.js';
import { mountInspector } from './lib/ui-inspector.js';
import { mountDiagnosis } from './lib/ui-diagnosis.js';
import { mountLook } from './lib/ui-look.js';
import { mountShare } from './lib/ui-share.js';
import { mountSlots } from './lib/ui-slots.js';

const TABS = ['outline', 'edit', 'diagnosis', 'look'];

function readReplacement(raw) {
  try { return sanitizeState(raw); }
  catch { return null; }
}

export function bootChoice({ hash = '', search = '' }, saved) {
  const query = new URLSearchParams(search);
  const prefix = '#' + HASH_VIEW + '=';
  if (hash.startsWith(prefix)) return { screen: 'viewer', code: hash.slice(prefix.length) };
  const goal = query.get('goal');
  if (GOALS.includes(goal)) return { screen: 'editor', goal };
  if (saved && query.get('fresh') !== '1') return { screen: 'editor', state: saved };
  return { screen: 'goal' };
}

export async function resolveStart(location, saved, decode = decodeState) {
  const choice = bootChoice(location, saved);
  if (choice.screen !== 'viewer') return choice;
  try {
    const result = await decode(choice.code);
    return result.ok ? { screen: 'viewer', state: result.state } : { screen: 'goal', reason: result.reason };
  } catch {
    return { screen: 'goal', reason: 'このリンクを読み取れませんでした。' };
  }
}

export function createAutosaver(write, report) {
  let pending = null;
  let timer;
  function flush() {
    clearTimeout(timer);
    if (!pending) return;
    let saved = false;
    try { saved = write(pending); }
    catch { /* 保存先がまた使えるときに、直近の入力を保存し直せるようにする。 */ }
    if (saved) pending = null;
    report(saved ? 'saved' : 'error');
  }
  return {
    schedule(state) {
      clearTimeout(timer);
      pending = state;
      report('pending');
      timer = setTimeout(flush, 400);
    },
    flush,
  };
}

export function createEditor(initial, { onDirty = () => {}, onSelect = () => {}, onTab = () => {} } = {}) {
  let history = createHistory(initial);
  let selectedId = initial.blocks[0]?.id ?? null;
  let tab = 'edit';
  let mobilePanelOpen = false;
  let device = 'phone';
  const listeners = new Set();
  const cache = new WeakMap();
  const getState = () => present(history);
  function diagnosis() {
    const state = getState();
    if (!cache.has(state)) cache.set(state, diagnose(state));
    return cache.get(state);
  }
  const event = (reason, action) => ({ state: getState(), selectedId, diagnosis: diagnosis(), reason, action });
  function notify(reason, action) {
    const snapshot = event(reason, action);
    for (const fn of listeners) fn(snapshot);
  }

  function update(next, reason, action, dirty = true) {
    if (next === history) return false;
    const before = getState();
    history = next;
    const state = getState();
    const newPage = reason === 'load' || action?.type === 'replace' || state.goal !== before.goal;
    if (newPage) {
      selectedId = state.blocks[0]?.id ?? null;
      tab = 'edit';
    } else if (selectedId && !state.blocks.some(b => b.id === selectedId)) {
      const i = before.blocks.findIndex(b => b.id === selectedId);
      selectedId = state.blocks[Math.min(i, state.blocks.length - 1)]?.id ?? null;
    }
    notify(reason, action);
    if (dirty) onDirty(getState());
    return true;
  }

  return {
    getState, getHistory: () => history, getSelectedId: () => selectedId,
    getTab: () => tab, getDevice: () => device, diagnose: diagnosis,
    isMobilePanelOpen: () => mobilePanelOpen,
    dispatch(action, { coalesce } = {}) {
      let next;
      try { next = reduce(getState(), action); }
      catch (error) {
        if (action?.type === 'replace') return false;
        throw error;
      }
      return update(commit(history, next, coalesce), 'dispatch', action);
    },
    restart(state, { dirty = true } = {}) { return update(createHistory(state), 'load', undefined, dirty); },
    undo: () => update(undo(history), 'undo'), redo: () => update(redo(history), 'redo'),
    canUndo: () => canUndo(history), canRedo: () => canRedo(history),
    subscribe(fn) {
      listeners.add(fn);
      fn(event('init'));
      return () => listeners.delete(fn);
    },
    select(id, { path, tab: requested } = {}) {
      if (id !== null && !getState().blocks.some(b => b.id === id)) return;
      const nextTab = requested ?? (id || path ? 'edit' : tab);
      selectedId = id;
      if (TABS.includes(nextTab)) tab = nextTab;
      if (id || path) mobilePanelOpen = true;
      notify('select');
      onSelect(id, path);
    },
    setTab(next, { toggle = false } = {}) {
      if (!TABS.includes(next)) return;
      // 診断の点数などから同じタブを指定した場合も、依頼された内容を開く。
      const open = !(toggle && tab === next && mobilePanelOpen);
      if (tab !== next || mobilePanelOpen !== open) {
        tab = next;
        mobilePanelOpen = open;
        notify('tab');
      }
      onTab();
    },
    foldPanel() {
      if (!mobilePanelOpen) return;
      mobilePanelOpen = false;
      notify('tab');
    },
    setDevice(next) {
      if (next === device || !DEVICES.some(item => item.key === next)) return;
      device = next;
      notify('device');
    },
  };
}

export function openSavedState(ctx, state, draft) {
  const clean = readReplacement(state);
  if (!clean) return false;
  if (!draft) return ctx.restart(clean);
  // リンクから来た人も、以前の下書きがあれば1回の「元に戻す」で戻れるようにする。
  if (ctx.getState() !== draft) ctx.restart(draft, { dirty: false });
  return ctx.dispatch({ type: 'replace', state: clean });
}

function mountPanelLayout(editor, ctx) {
  const outline = editor.querySelector('#slot-outline');
  const preview = editor.querySelector('#slot-preview');
  const panel = editor.querySelector('#slot-panel');
  const holder = panel.querySelector('#panel-outline');
  const body = panel.querySelector('#ed-panel-body');
  const fold = panel.querySelector('[data-fold]');
  const tabs = [...panel.querySelectorAll('[role="tab"]')];
  const panes = new Map(tabs.map(button => [button.dataset.tab, panel.querySelector('#' + button.getAttribute('aria-controls'))]));
  const wide = matchMedia('(min-width: 1100px)');
  const twoColumns = matchMedia('(min-width: 720px)');
  const events = new AbortController();
  const listen = { signal: events.signal };

  function paint() {
    const selected = ctx.getTab();
    const current = wide.matches && selected === 'outline' ? 'edit' : selected;
    const folded = !twoColumns.matches && !ctx.isMobilePanelOpen();
    editor.dataset.folded = String(folded);
    body.hidden = folded;
    fold.hidden = folded || twoColumns.matches;
    fold.setAttribute('aria-expanded', String(!folded));
    for (const button of tabs) {
      const active = button.dataset.tab === current;
      button.setAttribute('aria-selected', String(active && !folded));
      if (twoColumns.matches) button.removeAttribute('aria-expanded');
      else button.setAttribute('aria-expanded', String(active && !folded));
      button.tabIndex = active ? 0 : -1;
      panes.get(button.dataset.tab).hidden = !active || folded;
    }
  }
  function arrange() {
    const active = document.activeElement;
    const hadFocus = outline.contains(active);
    const scroller = outline.querySelector('[data-scroller]');
    const y = scroller.scrollTop;
    tabs[0].hidden = wide.matches;
    if (wide.matches && outline.parentElement === holder) preview.before(outline);
    if (!wide.matches && outline.parentElement !== holder) holder.append(outline);
    if (wide.matches && ctx.getTab() === 'outline') ctx.setTab('edit');
    else if (!wide.matches && hadFocus) ctx.setTab('outline');
    else if (!twoColumns.matches && body.contains(active)) ctx.setTab(ctx.getTab());
    paint();
    if (hadFocus) active.focus({ preventScroll: true });
    scroller.scrollTop = y;
  }

  panel.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (button === fold) {
      ctx.foldPanel();
      tabs.find(tab => tab.dataset.tab === ctx.getTab())?.focus({ preventScroll: true });
    } else if (tabs.includes(button)) {
      ctx.setTab(button.dataset.tab, { toggle: !twoColumns.matches });
    }
  }, listen);
  panel.addEventListener('keydown', e => {
    const visible = tabs.filter(tab => !tab.hidden);
    const index = visible.indexOf(e.target);
    if (index < 0) return;
    const destinations = { Home: 0, End: visible.length - 1, ArrowLeft: (index + visible.length - 1) % visible.length, ArrowRight: (index + 1) % visible.length };
    if (!Object.hasOwn(destinations, e.key)) return;
    e.preventDefault();
    const next = visible[destinations[e.key]];
    ctx.setTab(next.dataset.tab);
    next.focus();
  }, listen);
  wide.addEventListener('change', arrange, listen);
  twoColumns.addEventListener('change', arrange, listen);
  arrange();
  const unsubscribe = ctx.subscribe(paint);
  return { destroy() { unsubscribe(); events.abort(); } };
}

function mountViewer(root, state, ctx, adopt) {
  installPageStyle(root.ownerDocument);
  const page = root.querySelector('[data-view-page]');
  page.innerHTML = renderPage(state, { mode: 'export' });
  root.querySelector('[data-score]').textContent = 'UX診断 ' + ctx.diagnose().score + '点';
  function click(event) {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.hasAttribute('data-adopt')) adopt(state);
    else if (target.hasAttribute('data-choose')) ctx.toGoalScreen();
    else if (target.hasAttribute('data-app-send')) ctx.openAppShare(target);
    else if (page.contains(target) && target.matches('a[href^="#"]')) {
      // 見本のページ内移動で、共有内容が入ったURLの断片を失わないようにする。
      event.preventDefault();
      const id = target.getAttribute('href').slice(1);
      const anchor = [...page.querySelectorAll('[id]')].find(el => el.id === id);
      if (anchor) anchor.scrollIntoView({ block: 'start' });
    }
  }
  function submit(event) {
    event.preventDefault();
    ctx.toast('このフォームは見本です。入力した内容は送信されません。');
  }
  root.addEventListener('click', click);
  page.addEventListener('submit', submit);
  return { destroy() { root.removeEventListener('click', click); page.removeEventListener('submit', submit); page.replaceChildren(); } };
}

export async function mountApp(root) {
  const doc = root.ownerDocument;
  const local = id => root.querySelector('#' + id);
  const query = new URLSearchParams(location.search);
  const base = location.origin + location.pathname;
  // 手元でも「このアプリを共有する」には、受け取った人のレシピや起動用の引数を含めない。
  if (!doc.querySelector('link[rel="canonical"]')) {
    const canonical = doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = base;
    doc.head.append(canonical);
  }
  const live = local('toasts');
  const notifications = mountToast(live);
  function placeNotifications() {
    const layer = [...root.querySelectorAll('dialog[open]')].at(-1) ?? root;
    if (live.parentElement !== layer) layer.append(live);
  }
  function toast(message, options) {
    // 開いているダイアログの外は読み上げ対象から外れるため、結果も同じ面に出す。
    placeNotifications();
    notifications.toast(message, options);
    queueMicrotask(placeNotifications);
  }
  let draft = query.get('fresh') === '1' ? null : undefined;
  function currentDraft() {
    if (draft !== undefined) return draft;
    try { draft = storage.loadCurrent(); }
    catch {
      draft = null;
      toast('端末の下書きを読み取れませんでした。', { kind: 'error' });
    }
    return draft;
  }
  const explicit = bootChoice(location, null);
  const route = await resolveStart(location, explicit.screen === 'goal' ? currentDraft() : null);
  const initial = route.state ?? createState(route.goal ?? GOALS[0]);
  let editor;
  let viewer;
  let choosingAgain = false;
  let saveStatus = draft ? 'saved' : 'idle';
  let saveFailureShown = false;
  const saver = createAutosaver(state => storage.saveCurrent(state), status => {
    saveStatus = status;
    editor?.topbar.setSaveStatus(status);
    if (status === 'error' && !saveFailureShown) {
      toast('端末に保存できませんでした。共有リンクからページを残せます。', { kind: 'error' });
      saveFailureShown = true;
    }
    if (status === 'saved') saveFailureShown = false;
  });
  const ctx = createEditor(initial, {
    onDirty(state) {
      if (root.dataset.screen !== 'editor') return;
      draft = state;
      saver.schedule(state);
    },
    onSelect(id, path) {
      editor?.preview.scrollToBlock(id);
      if (path === 'site.name') {
        local('panel-look').querySelector('input[aria-label="サイトの名前"], input[type="text"], input:not([type])')?.focus();
      } else if (path) {
        editor?.inspector.focusPath(path);
      } else if (root.dataset.screen === 'editor' && (doc.activeElement === doc.body || doc.activeElement?.closest('[hidden]'))) {
        local('tab-' + ctx.getTab()).focus({ preventScroll: true });
      }
    },
  });

  const screens = { goal: local('screen-goal'), editor: local('screen-edit'), viewer: local('screen-view') };
  const events = new AbortController();
  const listen = { signal: events.signal };
  let navigation = 0;
  const openers = new Map();
  function openDialog(dialog, trigger, open = () => dialog.showModal()) {
    if (dialog.open) return;
    openers.set(dialog, trigger ?? doc.activeElement);
    return open();
  }
  function focusScreen() {
    const target = root.dataset.screen === 'editor' ? screens.editor.querySelector('[data-site]') : screens.goal.querySelector('h1');
    target.focus({ preventScroll: true });
  }
  for (const dialog of root.querySelectorAll('dialog')) {
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      placeNotifications();
      const button = openers.get(dialog);
      openers.delete(dialog);
      if (root.querySelector('dialog[open]')) return;
      if (button?.isConnected && button !== doc.body && button.getClientRects().length && !button.disabled) button.focus({ preventScroll: true });
      else if (doc.activeElement === doc.body && root.dataset.screen !== 'viewer') focusScreen();
    }, listen);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog || !dialog.open) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }, listen);
  }

  function show(screen) {
    if (viewer && screen !== 'viewer') { viewer.destroy(); viewer = null; }
    root.dataset.screen = screen;
    for (const [key, node] of Object.entries(screens)) node.hidden = key !== screen;
    if (screen === 'goal') goalUI.setDraft(currentDraft());
  }
  function consumeRoute() {
    navigation += 1;
    const url = new URL(location.href);
    url.searchParams.delete('goal');
    url.searchParams.delete('fresh');
    if (url.hash.startsWith('#' + HASH_VIEW + '=')) url.hash = '';
    if (url.href !== location.href) window.history.replaceState(window.history.state, '', url.href);
  }
  let shownTip = false;
  function enterEditor(change) {
    ctx.foldPanel();
    show('editor');
    choosingAgain = false;
    change();
    if (!editor) {
      editor = {
        layout: mountPanelLayout(screens.editor, ctx),
        outline: mountOutline(local('slot-outline'), ctx),
        preview: mountPreview(local('slot-preview'), ctx),
        topbar: mountTopbar(local('slot-topbar'), ctx),
        inspector: mountInspector(local('panel-edit'), ctx),
        diagnosis: mountDiagnosis(local('panel-diagnosis'), ctx),
        look: mountLook(local('panel-look'), ctx),
      };
    }
    editor.preview.resume();
    editor.topbar.setSaveStatus(saveStatus);
    consumeRoute();
    focusScreen();
    if (!shownTip && query.get('tips') !== '0' && !storage.hasSeen('editor-tip')) {
      toast(matchMedia('(min-width: 720px)').matches
        ? '部品を選ぶと、右の編集パネルでそこに置く理由を読めます。'
        : '部品をタップすると、下に編集パネルが開きます。そこに置く理由も読めます。');
      storage.markSeen('editor-tip');
      shownTip = true;
    }
  }

  function toGoalScreen() {
    choosingAgain = root.dataset.screen === 'editor';
    saver.flush();
    show('goal');
    consumeRoute();
    focusScreen();
  }
  function resume() {
    if (!draft) return;
    enterEditor(() => { if (ctx.getState() !== draft) ctx.restart(draft, { dirty: false }); });
  }
  const confirmation = local('dlg-goal-change');
  let proposedGoal;
  function chooseGoal(goal, trigger) {
    if (!GOALS.includes(goal)) return;
    if (!choosingAgain) { enterEditor(() => ctx.restart(createState(goal))); return; }
    if (goal === ctx.getState().goal) { resume(); return; }
    proposedGoal = goal;
    local('ed-confirm-note').textContent = '「' + GOAL_LABEL[goal] + '」の部品に入れ替えます。見た目は引き継ぎます。変更後も元に戻せます。';
    openDialog(confirmation, trigger);
  }
  confirmation.querySelector('[data-confirm]').addEventListener('click', () => {
    confirmation.close();
    enterEditor(() => ctx.dispatch({ type: 'setGoal', goal: proposedGoal }));
  }, listen);

  const dispatch = ctx.dispatch;
  ctx.dispatch = (action, options) => {
    if (root.dataset.screen !== 'editor') {
      if (action?.type !== 'replace' || !readReplacement(action.state)) return false;
      enterEditor(() => openSavedState(ctx, action.state, currentDraft()));
      return true;
    }
    return dispatch(action, options);
  };
  function slotResult(ok, success, failure) {
    toast(ok ? success : failure, { kind: ok ? 'info' : 'error' });
  }
  function useSlot(operation, fallback) {
    try { return operation(); }
    catch { return fallback; }
  }
  Object.assign(ctx, {
    toast, chooseGoal, toGoalScreen, resume,
    viewUrl: () => viewUrl(ctx.getState(), base),
    openShare: (tab = 'link', trigger) => openDialog(local('dlg-share'), trigger, () => share.open(tab)),
    openSlots: trigger => openDialog(local('dlg-slots'), trigger, () => slots.open()),
    openPalette: (index, trigger) => openDialog(local('dlg-palette'), trigger, () => palette.open(index)),
    openAppShare: trigger => openDialog(local('dlg-app-share'), trigger),
    slots: {
      list() {
        const rows = useSlot(() => storage.listSlots(), null);
        if (!rows) toast('保存の一覧を読み取れませんでした。', { kind: 'error' });
        return rows ?? [];
      },
      save(name) {
        const state = root.dataset.screen === 'goal' ? draft : ctx.getState();
        const result = state
          ? useSlot(() => storage.saveSlot(state, name), { ok: false, reason: 'この端末に保存できませんでした。' })
          : { ok: false, reason: '先にページの目的を選んでください。' };
        slotResult(result.ok, '名前をつけて保存しました。', result.reason);
        return result;
      },
      load(id) {
        const state = useSlot(() => storage.loadSlot(id), null);
        slotResult(!!state, '保存したページを開きました。', '保存したページを読み取れませんでした。');
        return state;
      },
      remove(id) {
        const ok = useSlot(() => storage.deleteSlot(id), false);
        slotResult(ok, '保存を削除しました。', '保存を削除できませんでした。');
        return ok;
      },
      rename(id, name) {
        const ok = useSlot(() => storage.renameSlot(id, name), false);
        slotResult(ok, '保存の名前を変えました。', '保存の名前を変えられませんでした。');
        return ok;
      },
    },
  });

  const goalUI = mountGoal(screens.goal, ctx);
  const palette = mountPalette(local('dlg-palette'), ctx);
  const share = mountShare(local('dlg-share'), ctx);
  const slots = mountSlots(local('dlg-slots'), ctx);
  const keys = mountKeys(root, ctx);
  function enterViewer(state) {
    saver.flush();
    viewer?.destroy();
    show('viewer');
    editor?.preview.pause();
    if (ctx.getState() !== state) ctx.restart(state, { dirty: false });
    viewer = mountViewer(screens.viewer, state, ctx, shared => enterEditor(() => openSavedState(ctx, shared, currentDraft())));
  }
  async function followHash() {
    const request = ++navigation;
    const hash = location.hash;
    if (!hash.startsWith('#' + HASH_VIEW + '=')) {
      if (root.dataset.screen === 'viewer') {
        if (currentDraft()) resume();
        else toGoalScreen();
      }
      return;
    }
    const next = await resolveStart(location, null);
    // 同じタブで次のリンクを開いた人に、先に開いたレシピを遅れて表示しない。
    if (request !== navigation || hash !== location.hash) return;
    if (next.screen === 'viewer') enterViewer(next.state);
    else {
      choosingAgain = false;
      saver.flush();
      show('goal');
      consumeRoute();
      focusScreen();
      toast(next.reason, { kind: 'error' });
    }
  }
  window.addEventListener('hashchange', followHash, listen);
  window.addEventListener('pagehide', saver.flush, listen);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) saver.flush(); }, listen);

  if (route.screen === 'viewer') {
    enterViewer(route.state);
  } else if (route.screen === 'editor') {
    enterEditor(() => {
      if (route.goal) ctx.restart(initial);
    });
  } else {
    show('goal');
    if (route.reason) { consumeRoute(); toast(route.reason, { kind: 'error' }); }
  }
  if (query.get('debug') === '1') window.__uxr = { ctx, getState: ctx.getState, dispatch: ctx.dispatch, diagnose: ctx.diagnose };
  root.dataset.ready = 'true';
  return { ctx, destroy() {
    navigation += 1;
    saver.flush();
    events.abort();
    for (const part of [goalUI, palette, share, slots, keys, viewer, ...Object.values(editor ?? {}), notifications]) part?.destroy?.();
    if (window.__uxr?.ctx === ctx) delete window.__uxr;
    delete root.dataset.ready;
  } };
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) void mountApp(root);
}
