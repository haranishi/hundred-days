export function mountToast(root) {
  const doc = root.ownerDocument;
  let current;
  let timer;

  function clear() {
    clearTimeout(timer);
    if (!current) return;
    current.events.abort();
    current.item.remove();
    current = null;
  }

  function restart() {
    clearTimeout(timer);
    if (!current || current.kind === 'error' || current.item.matches(':hover, :focus-within')) return;
    timer = setTimeout(clear, current.label ? 10000 : 4000);
  }

  function toast(message, { kind = 'info', actionLabel, onAction } = {}) {
    const label = typeof onAction === 'function' ? actionLabel : undefined;
    if (current && current.message === message && current.kind === kind && current.label === label) {
      // 同じ案内をもう一度読み上げず、ボタンは直近の操作を指すようにする。
      current.onAction = onAction;
      restart();
      return;
    }

    clear();
    const item = doc.createElement('div');
    item.className = 'app-toast';
    item.dataset.kind = kind;
    if (kind === 'error') item.setAttribute('role', 'alert');
    const text = doc.createElement('span');
    text.textContent = message;
    item.append(text);

    const entry = { item, message, kind, label, onAction, events: new AbortController() };
    current = entry;
    const listen = { signal: entry.events.signal };
    if (label) {
      const origin = doc.activeElement;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'app-toast-action';
      button.textContent = label;
      button.addEventListener('click', () => {
        const hadFocus = item.contains(doc.activeElement);
        clear();
        entry.onAction();
        if (hadFocus && origin?.isConnected && !origin.disabled && origin.getClientRects().length) origin.focus({ preventScroll: true });
      }, listen);
      item.append(button);
    }
    const stop = () => clearTimeout(timer);
    item.addEventListener('focusin', stop, listen);
    item.addEventListener('focusout', () => queueMicrotask(() => { if (current === entry) restart(); }), listen);
    item.addEventListener('pointerenter', stop, listen);
    item.addEventListener('pointerleave', restart, listen);
    root.append(item);
    restart();
  }

  return { toast, clear, destroy: clear };
}
