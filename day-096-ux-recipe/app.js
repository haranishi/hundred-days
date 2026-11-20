import { DEVICES, GOALS, GOAL_LABEL, HASH_VIEW, STORAGE_PREFIX, validateState } from './lib/contract.js';
import { createState, restoreState, reduce, createHistory, commit, present, undo, redo, canUndo, canRedo } from './lib/state.js';
import { diagnose } from './lib/rules.js';
import { isUntouched } from './lib/sample.js';
import * as persist from './lib/persist.js';
import { decodeState, viewUrl } from './lib/codec.js';
import { renderPage } from './lib/render.js';
import { createDraftDialog, DRAFT_WARNING, mountGoal } from './lib/ui-goal.js';
import { mountOutline } from './lib/ui-outline.js';
import { mountPreview, installPageStyle } from './lib/ui-preview.js';
import { mountPalette } from './lib/ui-palette.js';
import { mountNotice, mountStorageNotice, mountTopbar } from './lib/ui-topbar.js';
import { mountToast } from './lib/ui-toast.js';
import { mountKeys } from './lib/keys.js';
import { mountInspector } from './lib/ui-inspector.js';
import { mountDiagnosis } from './lib/ui-diagnosis.js';
import { mountLook } from './lib/ui-look.js';
import { mountShare } from './lib/ui-share.js';
import { mountSlots } from './lib/ui-slots.js';

const TABS = ['outline', 'edit', 'diagnosis', 'look'];
const PANEL_HEIGHT = '--ed-panel-h';

const LINK_HELP = '送ってくれた人にリンクをもう一度送ってもらうか、下から目的を選んで始めてください。';
const CURRENT_KEY = STORAGE_PREFIX + 'current';

function readOtherDraft(value) {
  try {
    const raw = JSON.parse(value);
    return validateState(raw).length ? null : restoreState(raw);
  } catch { return null; }
}

export function bootChoice({ hash = '', search = '' }, saved) {
  const query = new URLSearchParams(search);
  const prefix = '#' + HASH_VIEW + '=';
  if (hash.startsWith(prefix)) return { screen: 'viewer', code: hash.slice(prefix.length) };
  const goal = query.get('goal');
  if (GOALS.includes(goal)) {
    if (saved && !isUntouched(saved)) return { screen: 'goal', notice: '続きの作業があるため、目的の選択から始めます。' };
    return { screen: 'editor', goal };
  }
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

export async function startAtCurrentHash(location, saved, display, resolve = resolveStart) {
  // 復号中にリンクが変わった場合、古い画面で新しいURLを消費しないようにする。
  for (;;) {
    const { hash, search } = location;
    const route = await resolve({ hash, search }, saved);
    if (hash === location.hash) {
      display(route);
      return;
    }
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
    // 競合で取り消されたときは、帯の「一時停止」を保存エラーで上書きしない。
    if (!pending) return;
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
    cancel() {
      clearTimeout(timer);
      pending = null;
    },
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
    dispatch(action, { coalesce, dirty = true } = {}) {
      let next;
      try { next = reduce(getState(), action); }
      catch (error) {
        if (action?.type === 'replace') return false;
        throw error;
      }
      return update(commit(history, next, coalesce), 'dispatch', action, dirty);
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

function replaceDraft(ctx, state, draft, dirty) {
  const clean = restoreState(state);
  if (!clean) return false;
  if (!draft) return ctx.restart(clean, { dirty });
  // 見本を選んだだけでも履歴には載せる。端末の下書きは最初の編集まで残す。
  if (ctx.getState() !== draft) ctx.restart(draft, { dirty: false });
  return ctx.dispatch({ type: 'replace', state: clean }, { dirty });
}

export function openSavedState(ctx, state, draft) {
  return replaceDraft(ctx, state, draft, true);
}

function mountPanelLayout(editor, ctx) {
  const shell = editor.closest('.app-shell');
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

  function measureHeight(entries) {
    // 境界線と端末下端の余白も、通知が避ける高さに含める。
    const box = entries?.[0]?.borderBoxSize?.[0];
    const height = editor.hidden ? 0 : (box?.blockSize ?? panel.getBoundingClientRect().height);
    shell.style.setProperty(PANEL_HEIGHT, height + 'px');
  }
  const observer = new ResizeObserver(measureHeight);

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
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
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
  observer.observe(panel, { box: 'border-box' });
  return {
    measureHeight,
    destroy() {
      observer.disconnect();
      unsubscribe();
      events.abort();
      if (outline.parentElement === holder) preview.before(outline);
    },
  };
}

function mountViewer(root, state, ctx, adopt) {
  installPageStyle(root.ownerDocument);
  const page = root.querySelector('[data-view-page]');
  page.innerHTML = renderPage(state, { mode: 'export' });
  root.querySelector('[data-score]').textContent = 'UX診断 ' + diagnose(state).score + '点';
  function click(event) {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.hasAttribute('data-adopt')) adopt(state, target);
    else if (target.hasAttribute('data-choose')) ctx.toGoalScreen();
    else if (target.hasAttribute('data-app-send')) ctx.openAppShare(target);
    else if (page.contains(target) && target.matches('.uxr-form-submit')) explainForm(event);
    else if (page.contains(target) && target.matches('a[href^="#"]')) {
      // 見本のページ内移動で、共有内容が入ったURLの断片を失わないようにする。
      event.preventDefault();
      const id = target.getAttribute('href').slice(1);
      const anchor = [...page.querySelectorAll('[id]')].find(el => el.id === id);
      if (anchor) anchor.scrollIntoView({ block: 'start' });
    }
  }
  function explainForm(event) {
    event.preventDefault();
    ctx.toast('このフォームは見本です。入力した内容は送信されません。');
  }
  root.addEventListener('click', click);
  page.addEventListener('submit', explainForm);
  return { destroy() { root.removeEventListener('click', click); page.removeEventListener('submit', explainForm); page.replaceChildren(); } };
}

export function createSlotMutations(storage, toast, refreshList) {
  function failed(result, message) {
    if (result.reason === 'changed') {
      refreshList();
      message = '保存の一覧が別のタブで変わっていました。一覧を更新しました。';
    }
    toast(message, { kind: 'error' });
    return false;
  }
  return {
    remove(id, expect) {
      const result = storage.tryDeleteSlot(id, undefined, expect);
      if (!result.ok) return failed(result, '保存を削除できませんでした。');
      refreshList();
      if (expect === undefined) {
        toast('保存を削除しました。');
      } else {
        // 取り消しには、一覧を開いたときの本文でなく実際に消した記録を使う。
        const { record } = result;
        toast(record.name + 'を消しました。', {
          actionLabel: '元に戻す',
          onAction() {
            const restored = storage.restoreSlot(record);
            refreshList(restored ? id : undefined);
            if (restored) toast('元に戻しました。');
            else toast('元に戻せませんでした（保存枠がいっぱいです）。', { kind: 'error' });
          },
        });
      }
      return true;
    },
    rename(id, name, expect) {
      const result = storage.tryRenameSlot(id, name, undefined, expect);
      if (!result.ok) return failed(result, '保存の名前を変えられませんでした。');
      refreshList(id);
      toast('保存の名前を変えました。');
      return true;
    },
  };
}

export async function mountApp(root, { storage = persist } = {}) {
  const doc = root.ownerDocument;
  const local = id => root.querySelector('#' + id);
  const query = new URLSearchParams(location.search);
  const base = location.origin + location.pathname;
  const events = new AbortController();
  const listen = { signal: events.signal };
  let canonical;
  // 手元でも「このアプリを共有する」には、受け取った人のレシピや起動用の引数を含めない。
  if (!doc.querySelector('link[rel="canonical"]')) {
    canonical = doc.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = base;
    doc.head.append(canonical);
  }
  const originalLive = local('toasts');
  const live = originalLive ?? doc.createElement('div');
  if (!originalLive) {
    live.id = 'toasts';
    live.className = 'app-toasts';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-relevant', 'additions');
    root.append(live);
  }
  const notifications = mountToast(live);
  let toastDialog;
  let toastState;
  function dismissToasts() {
    toastState = null;
    notifications.dismissAll();
  }
  function returnNotifications(event) {
    if (event && (event.target !== toastDialog || toastDialog.open)) return;
    toastDialog?.removeEventListener('close', returnNotifications);
    toastDialog = null;
    if (live.parentElement !== root) root.append(live);
  }
  function placeNotifications() {
    if (events.signal.aborted) return;
    const dialog = [...root.querySelectorAll('dialog[open]')].at(-1);
    if (toastDialog !== dialog) {
      toastDialog?.removeEventListener('close', returnNotifications);
      toastDialog = dialog;
      dialog?.addEventListener('close', returnNotifications, listen);
    }
    const layer = dialog ?? root;
    if (live.parentElement !== layer) layer.append(live);
  }
  function toast(message, options) {
    if (events.signal.aborted) return;
    toastState = options?.kind === 'error' ? null : ctx.getState();
    // 開いているダイアログの外は読み上げ対象から外れるため、結果も同じ面に出す。
    placeNotifications();
    notifications.toast(message, options);
  }
  const readDraft = () => storage.readCurrent(undefined, { includeRaw: true });
  const initial = readDraft();
  let lastDraftRaw = initial.raw;
  let draft = initial.state;
  let blocked = initial.status === 'unavailable' || initial.status === 'damaged' ? initial.status : null;
  let startupNotice;
  const currentDraft = () => draft;
  let editor;
  let viewer;
  let viewerOrigin;
  let choosingAgain = false;
  let saveStatus = draft ? 'saved' : 'idle';
  let saveFailureShown = false;
  let otherDraft;
  let conflictNotice;
  function visibleSaveStatus() {
    if (blocked === 'unavailable') return 'error';
    if (blocked || otherDraft) return 'paused';
    return ctx.getState() === draft ? saveStatus : 'idle';
  }
  function reportSave(status) {
    saveStatus = status;
    editor?.topbar.setSaveStatus(visibleSaveStatus());
    if (status === 'error' && !saveFailureShown) {
      toast('端末に保存できませんでした。共有リンクからページを残せます。', { kind: 'error' });
      saveFailureShown = true;
    }
    if (status === 'saved') saveFailureShown = false;
  }
  const saver = createAutosaver(state => storage.saveCurrent(state, undefined, {
    beforeWrite: raw => !pauseForChangedDraft(raw),
    onSaved(raw) { lastDraftRaw = raw; },
  }), reportSave);
  const ctx = createEditor(draft ?? createState(), {
    onDirty(state) {
      if (events.signal.aborted || root.dataset.screen !== 'editor') return;
      draft = state;
      if (!blocked && !otherDraft) saver.schedule(state);
    },
    onSelect(id, path) {
      editor?.preview.scrollToBlock(id);
      if (path === 'site.name') {
        editor?.look.focusPath();
      } else if (path) {
        editor?.inspector.focusPath(path);
      } else if (root.dataset.screen === 'editor' && (doc.activeElement === doc.body || doc.activeElement?.closest('[hidden]'))) {
        local('tab-' + ctx.getTab()).focus({ preventScroll: true });
      }
    },
  });
  const stopWatchingToast = ctx.subscribe(({ state, reason }) => {
    if (toastState && (toastState !== state || reason === 'load')) dismissToasts();
  });

  const screens = { goal: local('screen-goal'), editor: local('screen-edit'), viewer: local('screen-view') };
  let navigation = 0;
  let handledHash;
  let proposal;
  const draftDialog = createDraftDialog(doc);
  root.append(draftDialog);
  const openers = new Map();
  function openDialog(dialog, trigger, open = () => dialog.showModal()) {
    if (dialog.open || events.signal.aborted) return;
    openers.set(dialog, trigger ?? doc.activeElement);
    dismissToasts();
    const result = open();
    if (live.childElementCount) placeNotifications();
    return result;
  }
  function focusScreen() {
    const target = root.dataset.screen === 'editor' ? screens.editor.querySelector('[data-site]') : screens.goal.querySelector('h1');
    target.focus({ preventScroll: true });
  }
  for (const dialog of root.querySelectorAll('dialog')) {
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      if (proposal?.dialog === dialog) proposal = null;
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

  function closeDialogs() {
    proposal = null;
    for (const dialog of root.querySelectorAll('dialog[open]')) {
      openers.delete(dialog);
      dialog.close();
    }
    returnNotifications();
  }
  function show(screen) {
    navigation += 1;
    // 別の共有ページを続けて開くと、画面名は同じでも前の案内は古くなる。
    if (toastState) dismissToasts();
    closeDialogs();
    if (viewer && screen !== 'viewer') { viewer.destroy(); viewer = null; }
    root.dataset.screen = screen;
    for (const [key, node] of Object.entries(screens)) node.hidden = key !== screen;
    if (screen !== 'editor') root.style.setProperty(PANEL_HEIGHT, '0px');
    if (screen === 'goal') goalUI.setDraft(currentDraft());
  }
  function consumeRoute() {
    const url = new URL(location.href);
    url.searchParams.delete('goal');
    url.searchParams.delete('fresh');
    if (url.hash.startsWith('#' + HASH_VIEW + '=')) url.hash = '';
    if (url.href !== location.href) window.history.replaceState(window.history.state, '', url.href);
    handledHash = location.hash;
  }
  let shownTip = false;
  function enterEditor(change = () => {}, preservePanel = false) {
    if (!preservePanel) ctx.foldPanel();
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
    editor.layout.measureHeight();
    editor.preview.resume();
    editor.topbar.setSaveStatus(visibleSaveStatus());
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
  const goalDialog = local('dlg-goal-change');
  const goalConfirm = goalDialog.querySelector('[data-confirm]');
  const originalGoalLabel = goalConfirm.textContent;
  function confirmReplacement(dialog, trigger, apply) {
    if (!draft || isUntouched(draft)) { apply(); return; }
    proposal = { dialog, navigation, hash: location.hash, apply };
    openDialog(dialog, trigger);
  }
  for (const dialog of [draftDialog, goalDialog]) {
    dialog.querySelector('[data-confirm]').addEventListener('click', () => {
      const pending = proposal;
      if (!dialog.open || pending?.dialog !== dialog || pending.navigation !== navigation || pending.hash !== location.hash) return;
      proposal = null;
      dialog.close();
      pending.apply();
    }, listen);
  }
  function startRecipe(goal, keepTheme = false) {
    enterEditor(() => {
      if (keepTheme) ctx.dispatch({ type: 'setGoal', goal }, { dirty: false });
      else replaceDraft(ctx, createState(goal), currentDraft(), false);
    });
  }
  function chooseGoal(goal, trigger) {
    if (!GOALS.includes(goal)) return;
    if (!choosingAgain) {
      confirmReplacement(draftDialog, trigger, () => startRecipe(goal));
      return;
    }
    if (goal === ctx.getState().goal) { enterEditor(); return; }
    local('ed-confirm-note').textContent = '「' + GOAL_LABEL[goal] + '」の部品に入れ替えます。見た目は引き継ぎます。変更後も元に戻せます。' + DRAFT_WARNING;
    goalConfirm.textContent = '置き換える';
    confirmReplacement(goalDialog, trigger, () => startRecipe(goal, true));
  }

  const dispatch = ctx.dispatch;
  ctx.dispatch = (action, options) => {
    if (root.dataset.screen !== 'editor') {
      if (action?.type !== 'replace' || !restoreState(action.state)) return false;
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
  const stateToSave = () => root.dataset.screen === 'editor' ? ctx.getState() : currentDraft();
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
        const state = stateToSave();
        const result = state
          ? useSlot(() => storage.saveSlot(state, name), { ok: false, reason: 'この端末に保存できませんでした。' })
          : { ok: false, reason: '先にページの目的を選んでください。' };
        slotResult(result.ok, '名前をつけて保存しました。', result.reason);
        return result;
      },
      load(id, expect) {
        const state = useSlot(() => storage.loadSlot(id, undefined, expect), null);
        if (!state) toast('保存したページを読み取れませんでした。', { kind: 'error' });
        return state;
      },
      ...createSlotMutations(storage, toast, id => slots.refreshList(id)),
    },
  });

  const goalUI = mountGoal(screens.goal, ctx);
  const palette = mountPalette(local('dlg-palette'), ctx);
  const share = mountShare(local('dlg-share'), ctx);
  // 入口での保存名と本文が、どちらも同じ下書きから取られるようにする。
  const slots = mountSlots(local('dlg-slots'), { ...ctx, getState: stateToSave });
  const keys = mountKeys(root, ctx);
  function enterViewer(state) {
    saver.flush();
    if (!viewer) viewerOrigin = editor && root.dataset.screen === 'editor' ? 'editor' : 'goal';
    viewer?.destroy();
    show('viewer');
    editor?.preview.pause();
    viewer = mountViewer(screens.viewer, state, ctx, (shared, trigger) => {
      confirmReplacement(draftDialog, trigger, () => enterEditor(() => openSavedState(ctx, shared, currentDraft())));
    });
  }
  function showEntrance(route) {
    choosingAgain = false;
    saver.flush();
    show('goal');
    if (route.reason || route.notice) {
      consumeRoute();
      focusScreen();
      if (route.reason) toast(route.reason + LINK_HELP, { kind: 'error' });
      else toast(route.notice);
    }
  }
  async function followHash() {
    const hash = location.hash;
    // 復号し終えたリンクの変更通知が遅れて届いても、新たに開いた確認を閉じない。
    if (handledHash === hash) return;
    handledHash = hash;
    const request = ++navigation;
    closeDialogs();
    if (!hash.startsWith('#' + HASH_VIEW + '=')) {
      if (root.dataset.screen === 'viewer') {
        if (viewerOrigin === 'editor') enterEditor(undefined, true);
        else if (currentDraft()) resume();
        else toGoalScreen();
      }
      return;
    }
    const next = await resolveStart(location, null);
    // 同じタブで次のリンクを開いた人に、先に開いたレシピを遅れて表示しない。
    if (request !== navigation || hash !== location.hash) return;
    if (next.screen === 'viewer') enterViewer(next.state);
    else showEntrance(next);
  }
  function clearConflict() {
    otherDraft = null;
    conflictNotice?.destroy();
    conflictNotice = null;
  }
  function keepLocalDraft() {
    if (!otherDraft) return;
    lastDraftRaw = readDraft().raw ?? otherDraft.raw;
    clearConflict();
    draft = ctx.getState();
    saver.schedule(draft);
    saver.flush();
    focusScreen();
  }
  function loadOtherDraft() {
    if (!otherDraft) return;
    // 連続した書き込みでは、次のイベントが届く前に利用者が読み込みを選ぶこともある。
    const latest = readDraft();
    const chosen = latest.state ? latest : otherDraft;
    draft = chosen.state;
    lastDraftRaw = chosen.raw;
    clearConflict();
    ctx.restart(draft, { dirty: false });
    reportSave('saved');
    focusScreen();
  }
  function pauseForChangedDraft(raw) {
    if (raw == null || raw === (otherDraft?.raw ?? lastDraftRaw)) return false;
    const state = readOtherDraft(raw);
    if (!state) return false;
    // pagehide の即時保存も止める。入力中の値は、本人が選ぶまで編集履歴に残す。
    saver.cancel();
    otherDraft = { raw, state };
    reportSave('paused');
    conflictNotice ??= mountStorageNotice(local('slot-topbar'), keepLocalDraft, loadOtherDraft);
    return true;
  }
  function storageChanged(event) {
    if (event.key !== CURRENT_KEY || event.newValue === null) return;
    try {
      if (event.storageArea && event.storageArea !== globalThis.localStorage) return;
    } catch { return; }
    let raw = event.newValue;
    // 解決済みの変更通知が後から届いても、古い原文で再び保存を止めない。
    try { if (event.storageArea) raw = event.storageArea.getItem(CURRENT_KEY); }
    catch { /* 保存先を読めない場合は、通知に含まれる下書きから選べる。 */ }
    pauseForChangedDraft(raw);
  }
  function enableAutosave() {
    window.addEventListener('storage', storageChanged, listen);
    window.addEventListener('pagehide', saver.flush, listen);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) saver.flush(); }, listen);
  }
  function dismissStartupNotice() {
    startupNotice.destroy();
    startupNotice = null;
    focusScreen();
  }
  function startWithNewDraft() {
    if (!storage.backupDamagedCurrent()) {
      startupNotice.setMessage('元の下書きのコピーを残せませんでした。自動保存は停止中です。');
      return;
    }
    blocked = null;
    dismissStartupNotice();
    enableAutosave();
    draft = ctx.getState();
    saver.schedule(draft);
    saver.flush();
  }
  if (blocked === 'damaged') {
    startupNotice = mountNotice(local('slot-topbar'), '保存されていた下書きを読み取れませんでした。', [
      ['新しい内容で保存を始める', startWithNewDraft],
      ['このまま保存しない', dismissStartupNotice],
    ]);
  } else if (blocked === 'unavailable') {
    startupNotice = mountNotice(local('slot-topbar'), 'この端末では、作業を保存できません。作ったページは「共有・書き出し」から残してください。', [
      ['閉じる', dismissStartupNotice],
    ]);
  } else {
    enableAutosave();
  }
  let ready = false;
  window.addEventListener('hashchange', () => { if (ready) void followHash(); }, listen);

  await startAtCurrentHash(location, currentDraft(), route => {
    if (handledHash !== location.hash) {
      handledHash = location.hash;
      if (route.screen === 'viewer') enterViewer(route.state);
      else if (route.goal) startRecipe(route.goal);
      else if (route.screen === 'editor') enterEditor();
      else showEntrance(route);
    }
    ready = true;
  });
  if (query.get('debug') === '1') window.__uxr = { ctx, getState: ctx.getState, dispatch: ctx.dispatch, diagnose: ctx.diagnose };
  root.dataset.ready = 'true';
  return { ctx, destroy() {
    if (events.signal.aborted) return;
    navigation += 1;
    saver.flush();
    closeDialogs();
    events.abort();
    openers.clear();
    stopWatchingToast();
    clearConflict();
    startupNotice?.destroy();
    for (const part of [goalUI, palette, share, slots, keys, viewer, ...Object.values(editor ?? {}), notifications]) part?.destroy?.();
    draftDialog.remove();
    goalConfirm.textContent = originalGoalLabel;
    local('ed-confirm-note').textContent = '';
    canonical?.remove();
    if (!originalLive) live.remove();
    root.style.removeProperty(PANEL_HEIGHT);
    if (window.__uxr?.ctx === ctx) delete window.__uxr;
    delete root.dataset.ready;
  } };
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) void mountApp(root);
}
