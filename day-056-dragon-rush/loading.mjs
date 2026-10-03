// 公開入口と配信エンジンで同じ画面を使う。段階数は実処理から更新する。
const CONTROLLER = Symbol.for('dragon.loading-screen');

export function createLoadingState() {
  let serial = 0;
  let value = { id: 0, status: 'idle', title: '', steps: [], step: 0, detail: '', error: '' };
  const current = id => value.id === id && value.status === 'loading';
  return {
    get snapshot() { return { ...value, steps: [...value.steps] }; },
    begin({ title, steps, detail = '' }) {
      if (!steps.length) throw new Error('読み込みの段階が必要です');
      value = { id: ++serial, status: 'loading', title, steps: [...steps], step: 0, detail, error: '' };
      return value.id;
    },
    step(id, index, detail) {
      if (!current(id) || !Number.isFinite(index)) return false;
      const next = Math.min(value.steps.length - 1, Math.max(0, Math.floor(index)));
      if (next < value.step) return false;
      value = { ...value, step: next, detail };
      return true;
    },
    finish(id) {
      if (!current(id)) return false;
      value = { ...value, status: 'done', step: value.steps.length };
      return true;
    },
    fail(id, error) {
      if (!current(id)) return false;
      value = { ...value, status: 'error', error };
      return true;
    },
  };
}

export function getLoadingScreen() {
  let root = document.getElementById('boot-status');
  if (root?.[CONTROLLER]) return root[CONTROLLER];
  if (!root) {
    root = document.createElement('section');
    root.id = 'boot-status';
  }
  // #appの表示切り替えやエンジンの画面と独立させる。
  document.body.append(root);
  root.className = 'dr-loading';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'dr-loading-title');
  root.setAttribute('aria-describedby', 'dr-loading-detail');
  root.setAttribute('data-testid', 'loading-screen');
  root.innerHTML = `
    <div class="dr-load-panel">
      <p class="dr-load-brand">夕暮れ破壊紀行 <span>/ LOADING</span></p>
      <div class="dr-load-heading">
        <span class="dr-load-spinner" aria-hidden="true"></span>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2 id="dr-loading-title"></h2>
          <p id="dr-loading-detail"></p>
        </div>
      </div>
      <div class="dr-load-progress">
        <div class="dr-load-meta"><span data-loading-count></span><span data-loading-time aria-live="off"></span></div>
        <progress aria-label="準備が完了した段階数"></progress>
        <ol class="dr-load-steps" aria-label="読み込みの段階"></ol>
      </div>
      <p class="dr-load-note">準備ができたら、自動でゲーム画面に戻ります。</p>
      <p class="dr-load-slow" hidden>通信状況や端末によって時間がかかります。画面を開いたままお待ちください。</p>
      <button class="dr-load-reload" type="button" hidden>再読み込みして試す</button>
    </div>`;
  if (!document.querySelector('[data-loading-styles]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = new URL('./loading.css', import.meta.url).href;
    style.setAttribute('data-loading-styles', '');
    document.head.append(style);
  }
  const state = createLoadingState();
  const title = root.querySelector('h2');
  const detail = root.querySelector('#dr-loading-detail');
  const progress = root.querySelector('progress');
  const count = root.querySelector('[data-loading-count]');
  const time = root.querySelector('[data-loading-time]');
  const steps = root.querySelector('ol');
  const slow = root.querySelector('.dr-load-slow');
  const reload = root.querySelector('button');
  const blocked = new Map();
  let started = 0;
  let timer;
  let focus;
  const blockBehind = () => {
    for (const element of document.body.children) {
      if (element === root || !(element instanceof HTMLElement) || blocked.has(element)) continue;
      blocked.set(element, element.inert);
      element.inert = true;
    }
  };
  const observer = new MutationObserver(blockBehind);
  const elapsed = () => {
    const seconds = Math.max(0, Math.floor((performance.now() - started) / 1000));
    time.textContent = `${seconds}秒経過`;
    if (seconds >= 15 && state.snapshot.status === 'loading') {
      slow.hidden = false;
      reload.hidden = false;
    }
  };
  const render = () => {
    const value = state.snapshot;
    root.dataset.phase = value.status;
    title.textContent = value.status === 'error' ? '読み込みを完了できませんでした' : value.title;
    detail.textContent = value.status === 'error' ? value.error : value.detail;
    count.textContent = `${value.step} / ${value.steps.length} 段階完了`;
    progress.max = value.steps.length;
    progress.value = value.step;
    steps.replaceChildren(...value.steps.map((name, index) => {
      const item = document.createElement('li');
      const done = index < value.step;
      const active = index === value.step;
      item.dataset.state = done ? 'done' : active ? 'active' : 'pending';
      item.dataset.number = done ? '✓' : String(index + 1);
      item.textContent = name;
      item.setAttribute('aria-label', `${name}：${done ? '完了' : active ? '準備中' : '待機中'}`);
      if (active) item.setAttribute('aria-current', 'step');
      return item;
    }));
    if (value.status === 'error') {
      clearInterval(timer);
      slow.hidden = true;
      reload.hidden = false;
      reload.focus({ preventScroll: true });
    }
  };
  const controller = {
    get snapshot() { return state.snapshot; },
    begin(config) {
      const id = state.begin(config);
      if (root.hidden) focus = document.activeElement;
      started = performance.now();
      slow.hidden = true;
      reload.hidden = true;
      root.hidden = false;
      blockBehind();
      observer.observe(document.body, { childList: true });
      clearInterval(timer);
      elapsed();
      timer = setInterval(elapsed, 250);
      render();
      root.focus({ preventScroll: true });
      return id;
    },
    step(id, index, text) {
      if (!state.step(id, index, text)) return false;
      render();
      return true;
    },
    finish(id) {
      if (!state.finish(id)) return false;
      clearInterval(timer);
      observer.disconnect();
      render();
      root.hidden = true;
      for (const [element, inert] of blocked) element.inert = inert;
      blocked.clear();
      if (focus instanceof HTMLElement && focus.isConnected && focus.getClientRects().length && !focus.closest('[hidden], [inert]')) {
        focus.focus({ preventScroll: true });
      } else document.querySelector('#app canvas')?.focus({ preventScroll: true });
      return true;
    },
    fail(id, error) {
      if (!state.fail(id, error)) return false;
      render();
      return true;
    },
  };
  reload.addEventListener('click', () => location.reload());
  document.addEventListener('keydown', event => {
    if (root.hidden) return;
    // 背後のゲームへキーを流さない。Tabはこの画面の操作内に留める。
    event.stopPropagation();
    if (event.key === 'Tab') {
      event.preventDefault();
      (reload.hidden ? root : reload).focus({ preventScroll: true });
    }
  }, true);
  root[CONTROLLER] = controller;
  return controller;
}

export function loadingPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
